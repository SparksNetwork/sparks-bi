import restify from 'restify'

import Firebase from 'firebase'
import Slack from 'slack-node'
import Toggl from 'toggl-api'
import {createBot} from './bot'
import {map, trim, compose} from 'ramda'

const requiredVars = [
  'PORT',
  'FIREBASE_HOST',
  'FIREBASE_TOKEN',
  //'TOGGL_WORKSPACE_ID',
  //'TOGGL_API_TOKEN',
  //'SLACK_API_TOKEN',
]

requiredVars
.filter(v => !process.env[v])
.forEach(v => {
  console.log('Must specify ' + v)
  process.exit()
})

const cfg = map(
  compose(trim, String),
  process.env
)

const {
  PORT,
  FIREBASE_HOST,
  FIREBASE_TOKEN,
  TOGGL_WORKSPACE_ID,
  TOGGL_API_TOKEN,
  SLACK_API_TOKEN,
} = cfg

const fb = new Firebase(FIREBASE_HOST)

const isTogglEnabled = () => TOGGL_WORKSPACE_ID && TOGGL_API_TOKEN
const isSlackEnabled = () => SLACK_API_TOKEN

const slack = isSlackEnabled() && new Slack(SLACK_API_TOKEN)

const currentEntryFor = apiToken =>
  new Promise((resolve,reject) =>
    (new Toggl({apiToken})).getCurrentTimeEntry((err,result) =>
      resolve(err || {togglToken: apiToken, ...result})
    )
  )

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

const buildTimeRow = ({initials, togglUid}, totals) => {
  const details = totals.find(({uid}) => uid === togglUid)
  console.log('details',details)
  return {
    initials,
    totals: details && details.totals.slice(0,-1),
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

const getWeeklyTotals = () =>
  new Promise((resolve,reject) =>
    (new Toggl({apiToken: TOGGL_API_TOKEN}))
    .weeklyReport({
      workspace_id: TOGGL_WORKSPACE_ID,
      grouping: 'users',
    }, (err,result) =>
      resolve(err || result.data)
    )
  )

const respondTimeRolling = (req, res, next) => {
  Promise.all([
    getTeamMembers(), getWeeklyTotals(),
  ])
  .then(([members,totals]) =>
    members.map(m => buildTimeRow(m, totals))
  )
  .then(rows => {
    res.send({members: rows})
    next()
  })
  .catch(err => console.log(err))
}

const server = restify.createServer()
server.use(restify.bodyParser())

if (isSlackEnabled()) {
  server.get('/presence', respondPresence)
}

if (isTogglEnabled()) {
  server.get('/time/pastSeven', respondTimeRolling)
}

fb.authWithCustomToken(FIREBASE_TOKEN.trim(), (err,auth) => {
  if (err) { console.log('FB auth err:',err); process.exit() }

  server.listen(PORT, () =>
    console.log('%s listening at %s', server.name, server.url)
  )

  const startBot = createBot(fb, server)

  startBot(function(err, bot) {
    if (err) { console.log('BOT error:', err); process.exit() }
    console.log('Bot connected')
  })
})
