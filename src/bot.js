import Promise from 'bluebird'
import Botkit from 'botkit'
import {WebClient} from '@slack/client'
import {createStorage} from './bot-store'
import moment from 'moment'
import limdu from 'limdu'
import {
  T, test, keys, prop, path, propEq, find, trim, compose, uniq, append,
  contains, mergeAll, filter, reject, allPass,
} from 'ramda'
import rm from 'remove-markdown'
import fs from 'fs'

const MORNINGS = [
  'Morning!',
  'Good morning.',
  'I tip my hat to you, good gentleperson.',
  'Top of the morning to you.',
]

const POSITIVES = [
  'Good to hear',
  'Great!',
  'I\'m glad',
]

const NEGATIVES = [
  'I\'m sorry',
  'Too bad',
]

const slack = new WebClient(process.env.SLACK_TOKEN)

function randPhrase(phrases) {
  const idx = Math.round(Math.random() * (phrases.length - 1))
  return phrases[idx]
}

function addToArray(item) {
  return compose(
    uniq,
    append(item),
    ary => ary || []
  )
}

function teams(controller) {
  const storage = controller.storage

  controller.hears([/^add <@(.+)> to (.+) team/], ['direct_message', 'mention'], async function(bot, message) {
    const [,userId,teamId] = message.match.map(trim)
    const team = await storage.teams.getAsync(teamId) || {id: teamId}
    const user = await storage.users.getAsync(userId) || {id: userId}

    team.users = addToArray(userId)(team.users)
    user.teams = addToArray(teamId)(user.teams)

    await storage.teams.saveAsync(team)
    await storage.users.saveAsync(user)

    const {user: {name}} = await slack.users.info(userId)
    bot.reply(message, `Added ${name} to ${teamId}`)
  })

  controller.hears([/^(who is in |describe (?:the )?)(.+) team/], ['direct_message', 'mention'], async function(bot, message) {
    const [,,teamId] = message.match.map(trim)
    const team = await storage.teams.getAsync(teamId)

    if (team) {
      const users = await Promise.all(team.users.map(id => slack.users.info(id)))
      bot.reply(message, `The ${teamId} team has the users ${users.map(path(['user', 'name'])).join(', ')}`)
    } else {
      bot.reply(message, `Cannot find a team named ${teamId}`)
    }
  })
}

function dailyUpdateReminder(controller) {
  const options = {
    channel: 'z-dev',
    team: 'dev',
  }

  const {storage} = controller
  let dailyUpdateChannel
  let users

  slack.channels.list().then(({channels}) =>
    dailyUpdateChannel = channels.find(propEq('name', options.channel))
  )

  async function getTeam() {
    return await storage.teams.getAsync(options.team)
  }

  async function getTeamUsers() {
    const team = await getTeam()

    return await Promise.all(team.users.map(id => Promise.all([
      slack.users.info(id).then(prop('user')),
      slack.users.getPresence(id),
      storage.users.getAsync(id),
    ]).then(mergeAll)))
  }

  async function inTeam(userId) {
    const team = await getTeam()
    return team && team.users && contains(userId, team.users)
  }

  async function getUsersNotUpdatedToday() {
    const users = await getTeamUsers()
    return users
      .filter(prop('lastUpdateAt'))
      .filter(u =>
        moment(u.lastUpdateAt).isBefore(moment().add(-24, 'h')))
  }

  async function checkUpdates() {
    console.log('== checking updates')
    const users = await getUsersNotUpdatedToday()

    const onlineNotNotified = compose(
      reject(allPass([
        prop('notifiedAt'),
        u => moment(u.notifiedAt).isAfter(moment().add(-24, 'h')),
      ])),
      filter(propEq('presence', 'active'))
    )

    await Promise.all(
      onlineNotNotified(users)
        .map(async function(user) {
          console.log(`${user.name} has been a naughty person`)

          await storage.users.saveAsync({id: user.id, notifiedAt: Date.now()})
          const {channel: {id: channelId}} = await slack.im.open(user.id)
          slack.chat.postMessage(channelId, `Hey, please can you put your daily update into the #${options.channel} channel!`, {as_user: true})
        })
    )

    checkTimer()
  }

  function checkTimer() {
    setTimeout(checkUpdates, 1000 * 5)
  }

  checkTimer()

  controller.hears([/.+/], ['ambient', 'message_received'], async function(bot, message) {
    if (!message.channel === dailyUpdateChannel.id) { console.log('wrong channel'); return }
    if (!await inTeam(message.user)) { console.log('not in team'); return }

    const user = await storage.users.getAsync(message.user) || {id: message.user}
    user.lastUpdateAt = Date.now()
    user.lastUpdate = message.text
    await storage.users.saveAsync(user)
    console.log(`user ${user.id} last updated at ${user.lastUpdate}`)
  })

  controller.hears([/^when .*<@(.+)>.*update/], ['direct_message'], async function(bot, message) {
    const [,userId] = message.match.map(trim)
    const [user, {user: {name}}] = await Promise.all([
      storage.users.getAsync(userId),
      slack.users.info(userId),
    ])

    if (user && user.lastUpdateAt) {
      const m = moment(user.lastUpdateAt)
      bot.reply(message, `${name} last gave an update ${m.fromNow()}: ${user.lastUpdate}`)
    } else {
      bot.reply(message, `${name} has never given an update`)
    }
  })

  controller.hears([/who updated/, /show updates/], ['direct_message'], async function(bot, message) {
    console.log('who updated?')
    const team = await getTeam()
    const users = await getTeamUsers()

    users
      .filter(prop('lastUpdateAt'))
      .filter(u => moment(u.lastUpdateAt).isAfter(moment().add(-24, 'h')))
      .forEach(user => {
        console.log(user)
        bot.reply(message, `*${user.name}*: ${user.lastUpdate}`)
      })
  })
}

function greeter(controller, fb) {
  const TextClassifier = limdu.classifiers.multilabel.BinaryRelevance.bind(0, {
    binaryClassifierType: limdu.classifiers.Winnow.bind(0, {retrain_count: 10}),
  })

  const WordExtractor = function(input, features) {
    input.split(' ').forEach(word => features[word] = 1)
  }

  const intentClassifier = new limdu.classifiers.EnhancedClassifier({
    classifierType: TextClassifier,
    normalizer: limdu.features.LowerCaseNormalizer,
    featureExtractor: WordExtractor,
  })

  const classifierRef = fb.child('botkitClassifier').child('goodbad')

  classifierRef
    .on('child_added', function(s) {
      const doc = s.val()
      console.log('adding doc', doc)
      intentClassifier.trainOnline(doc.text, doc.label)
    })

  classifierRef
    .on('value', function() {
      console.log('retrain')
      intentClassifier.retrain()
    })

  controller.hears([/^classify (.+) in (.+) as (.+)$/], ['direct_message', 'mention'], function(bot, message) {
    const [, text, child, label] = message.match

    fb.child('botkitClassifier').child(child)
      .push({text, label})
      .then(() =>
        bot.reply(message, `OK, classified ${text} as ${label}`))
      .catch(err =>
        bot.reply(message, `ERROR, ${err}`))
  })

  controller.hears([/(good\s+)?morning[!.,]?\s*$/i], ['ambient', 'direct_message', 'message_received'], function(bot, message) {
    const goodBad = function(text, label) {
      return function(response, convo) {
        const label = test(/good/, response.text) ? 'good' : 'bad'
        classifierRef.push({text, label})
        convo.say('I shall remember')
        convo.next()
      }
    }

    const askHow = function(response, convo) {
      convo.ask(`${randPhrase(MORNINGS)} How are you today?`, function(response, convo) {
        const text = response.text
        const label = intentClassifier.classify(text)[0]

        if (label) {
          const reply = randPhrase(label === 'good' ? POSITIVES : NEGATIVES)
          convo.say(reply)
        } else {
          convo.ask('And is that good or bad?', goodBad(text, label))
        }

        convo.next()
      })
    }

    bot.startConversation(message, askHow)
  })
}

function createBot(fb, server) {
  const controller = Botkit.slackbot({
    storage: createStorage({fb}),
    // debug: true,
  })

  keys(controller.storage).forEach(key =>
    Promise.promisifyAll(controller.storage[key]))

  const bot = controller.spawn({
    token: process.env.SLACK_TOKEN,
  })

  greeter(controller, fb)
  teams(controller)
  dailyUpdateReminder(controller)

  /**
  * CircleCI will post to this route when a release happens
  *
  * TODO: Make this generic
  */
  server.post('/release', function(req, res, next) {
    const {stage, name, branch, version} = req.body
    const changelog = req.files.changelog

    if (changelog) {
      fs.readFile(changelog.path, 'utf8', (err, data) => {
        fs.unlink(changelog.path, T)

        const releases = data.toString().split(/<a name.*<\/a>/)
        const release = rm(trim(releases[1]))
        const changelogUrl = `https://github.com/SparksNetwork/sparks-backend/blob/v${version}/CHANGELOG.md`

        slack.chat.postMessage(
          '#z-dev',
          `${name} version ${version} released to ${stage}`,
          {
            as_user: true,
            attachments: [
              {
                text: 'ok',
                fields: [
                  {
                    title: 'Stage',
                    value: stage,
                    short: true,
                  },
                  {
                    title: 'Version',
                    value: version,
                    short: true,
                  },
                ],
              },
              {
                title: 'Changelog',
                title_link: changelogUrl,
                text: release,
              },
            ],
          }
        )
      })
    }

    res.send({ok: true})
    next()
  })

  return function(cb) {
    bot.startRTM(function(err, bot, payload) {
      cb(err, bot)
    })
  }
}

export {createBot}
