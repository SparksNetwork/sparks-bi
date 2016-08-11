import Botkit from 'botkit'
import {WebClient} from '@slack/client'
import {createStorage} from './bot-store'
import limdu from 'limdu'
import {test, keys, prop, propEq, find, trim} from 'ramda'
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

function createBot(fb, server) {
  const controller = Botkit.slackbot({
    storage: createStorage({fb}),
    // debug: true,
  })
  const bot = controller.spawn({
    token: process.env.SLACK_TOKEN,
  })

  const TextClassifier = limdu.classifiers.multilabel.BinaryRelevance.bind(0, {
    binaryClassifierType: limdu.classifiers.Winnow.bind(0, {retrain_count: 10})
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
    const askHow = function(response, convo) {
      convo.ask(`${randPhrase(MORNINGS)} How are you today?`, function(response, convo) {
        const text = response.text
        const label = intentClassifier.classify(text)[0]

        if (label) {
          const reply = randPhrase(label === 'good' ? POSITIVES : NEGATIVES)
          convo.say(reply)
        } else {
          convo.ask('And is that good or bad?', function(response, convo) {
            const label = test(/good/, response.text) ? 'good' : 'bad'
            classifierRef.push({text, label})
            convo.say('I shall remember')
            convo.next()
          })
        }

        convo.next()
      })
    }

    bot.startConversation(message, askHow)
  })

  /**
  * CircleCI will post to this route when a release happens
  *
  * TODO: Make this generic
  */
  server.post('/release', function (req, res, next) {
    const {stage, name, branch, version} = req.body
    const changelog = req.files.changelog

    if (changelog) {
      fs.readFile(changelog.path, 'utf8', (err, data) => {
        fs.unlink(changelog.path, () => {})

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
                    short: true
                  },
                  {
                    title: 'Version',
                    value: version,
                    short: true
                  }
                ]
              },
              {
                title: 'Changelog',
                title_link: changelogUrl,
                text: release
              }
            ]
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
