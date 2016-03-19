import restify from 'restify'

import Firebase from 'firebase'
import Slack from 'slack-node'
import Toggl from 'toggl-api'

const requiredVars = [
  'PORT',
  'FIREBASE_HOST',
  'FIREBASE_TOKEN',
  'TOGGL_WORKSPACE_ID',
  'TOGGL_API_TOKEN',
  'SLACK_API_TOKEN',
]

requiredVars
.filter(v => !process.env[v])
.forEach(v => {
  console.log('Must specify ' + v)
  process.exit()
})

const cfg = {}
requiredVars.forEach(v => cfg[v] = process.env[v].trim())

const {
  PORT,
  FIREBASE_HOST,
  FIREBASE_TOKEN,
  TOGGL_WORKSPACE_ID,
  TOGGL_API_TOKEN,
  SLACK_API_TOKEN,
} = cfg

const fb = new Firebase(FIREBASE_HOST)

const slack = new Slack(SLACK_API_TOKEN)

const currentEntryFor = apiToken =>
  new Promise((resolve,reject) =>
    (new Toggl({apiToken})).getCurrentTimeEntry((err,result) =>
      resolve(err || {togglToken: apiToken, ...result})
    )
  )

// const getTogglCurrent = ({fullName, initials, togglToken, slackUsername}) => {
//   console.log('getting toggl for', togglToken)
//   if (!togglToken) {
//     return new Promise(resolve => resolve({fullName, initials, slackUsername}))
//   }
//   const toggl = new Toggl({apiToken: togglToken})
//   return new Promise((resolve,reject) =>
//     toggl.getCurrentTimeEntry((err,result) => {
//       console.log('toggl response:', err, result)
//       if (err) {
//         resolve({fullName, initials, slackUsername, err})
//       } else {
//         const response = {fullName, initials, slackUsername}
//         if (result && String(result.wid) === String(TOGGL_WORKSPACE_ID)) {
//           response.start = result.start
//           response.duration = result.duration
//           response.description = result.description
//         } else if (result) {
//           response.description = 'OTHER PROJECT'
//         }
//         resolve(response)
//       }
//     })
//   )
// }

const inWorkspace = togglUser =>
  togglUser && String(togglUser.wid) === String(TOGGL_WORKSPACE_ID)

const buildPresenceRow = ({fullName, slackUsername, togglToken}, sUsers, tUsers) => {
  const sUser = sUsers.find(u => u.name === slackUsername)

  const tUser = tUsers.find(u => u.togglToken === togglToken)

  return {
    fullName,
    presence: sUser && sUser.presence || 'N/A',
    duration: inWorkspace(tUser) && tUser.duration || 0,
    description: inWorkspace(tUser) && tUser.description,
  }
}

const getSlackUsers = () =>
  new Promise((resolve,reject) =>
    slack.api('users.list', {presence: 1}, (err,response) =>
      err ? reject(err) : resolve(response.members)
    )
  )

const toRows = obj => Object.keys(obj).map(k => obj[k])

const getTeamMembers = () =>
  fb.child('teamMembers').once('value').then(snap => toRows(snap.val()))

const respondPresence = (req, res, next) => {
  Promise.all([
    getTeamMembers(), getSlackUsers(),
  ])
  .then(([members,sUsers]) =>
    Promise.all(members.map(({togglToken}) =>
      togglToken && currentEntryFor(togglToken) || {togglToken}
    ))
    .then(tUsers => [
      members,
      sUsers,
      tUsers,
    ])
  )
  .then(([members, sUsers, tUsers]) =>
    members.map(m => buildPresenceRow(m,sUsers,tUsers))
  )
  .then(rows => {
    res.send(rows)
    next()
  })
  .catch(err => console.log(err))
}

const server = restify.createServer()

server.get('/presence', respondPresence)

fb.authWithCustomToken(FIREBASE_TOKEN.trim(), (err,auth) => {
  if (err) { console.log('FB auth err:',err); process.exit() }
  server.listen(PORT, () =>
    console.log('%s listening at %s', server.name, server.url)
  )
})
