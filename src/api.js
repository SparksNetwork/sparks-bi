import Slack from 'slack-node'
import Toggl from 'toggl-api'

export function createApi(cfg, fb, server) {
  const isTogglEnabled = () => cfg.TOGGL_WORKSPACE_ID && cfg.TOGGL_API_TOKEN
  const isSlackEnabled = () => cfg.SLACK_API_TOKEN

  const slack = isSlackEnabled() && new Slack(cfg.SLACK_API_TOKEN)

  const currentEntryFor = apiToken =>
    new Promise((resolve) =>
      (new Toggl({apiToken})).getCurrentTimeEntry((err,result) =>
        resolve(err || {togglToken: apiToken, ...result})
      )
    )

  const inWorkspace = togglUser =>
    togglUser && String(togglUser.wid) === String(cfg.TOGGL_WORKSPACE_ID)

  const buildPresenceRow = ({fullName, slackUsername, togglToken, timezone}, sUsers, tUsers) => {
    const sUser = sUsers.find(u => u.name === slackUsername)

    const tUser = tUsers.find(u => u.togglToken === togglToken)

    return {
      fullName,
      presence: sUser && sUser.presence || 'N/A',
      duration: inWorkspace(tUser) && tUser.duration || 0,
      description: inWorkspace(tUser) && tUser.description,
      timezone,
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
        isTogglEnabled() && togglToken && currentEntryFor(togglToken) || {togglToken}
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
    new Promise((resolve) =>
      (new Toggl({apiToken: cfg.TOGGL_API_TOKEN}))
      .weeklyReport({
        workspace_id: cfg.TOGGL_WORKSPACE_ID,
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

  if (isSlackEnabled()) {
    server.get('/presence', respondPresence)
  }

  if (isTogglEnabled()) {
    server.get('/time/pastSeven', respondTimeRolling)
  }
}
