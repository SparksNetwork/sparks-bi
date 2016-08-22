import restify from 'restify'

import Firebase from 'firebase'
import {createBot} from './bot'
import {createApi} from './api'
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
} = cfg

const fb = new Firebase(FIREBASE_HOST)

const server = restify.createServer()
server.use(restify.bodyParser())
createApi(cfg, fb, server)

const startBot = bot =>
  bot.start()
    .then(() => console.log('Bot connected'))

const startServer = server => new Promise((resolve, reject) =>
  server.listen(PORT, err =>
    err ? reject(err) : resolve(server)
  )
)

const startFirebase = fb => new Promise((resolve, reject) =>
  fb.authWithCustomToken(FIREBASE_TOKEN.trim(), (err, auth) => {
    if (err) { reject(err) }
    resolve(auth)
  })
)

startFirebase(fb).then(() => {
  const bot = createBot(fb, server)
  bot.use('greeter')
  bot.use('teams')
  bot.use('update-reminder', {
    channel: 'daily-update',
    team: 'dev',
  })
  bot.use('release')
  bot.use('trello', {
    board: 'P/Dev Pipeline',
    lists: [
      {name: 'BACKLOG - max 10 items, sized and agreed on', label: 'Backlog'},
      {name: 'WORKING - max 2 per dev, must have an assigned person', label: 'Working'},
      {name: 'REVIEW - max 5, if no face then you can add yourself', label: 'Review', alert: {team: 'dev', channel: 'z-dev'}},
      {name: 'WAITING - max 5, reviewed, waiting to go to staging', label: 'Waiting'},
    ],
  })

  return startServer(server)
    .then(() => startBot(bot))
})
.catch(err => console.log('ERROR:', err) || process.exit())
