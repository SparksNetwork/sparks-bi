import {test} from 'ramda'
import limdu from 'limdu'

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

function randPhrase(phrases) {
  const idx = Math.round(Math.random() * (phrases.length - 1))
  return phrases[idx]
}

export default function Greeter(controller) {
  const {fb} = controller

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

  controller.hears([/^classify (.+) in (.+) as (.+)$/], ['direct_message', 'direct_mention'], function(bot, message) {
    const [, text, child, label] = message.match

    fb.child('botkitClassifier').child(child)
      .push({text, label})
      .then(() =>
        bot.reply(message, `OK, classified ${text} as ${label}`))
      .catch(err =>
        bot.reply(message, `ERROR, ${err}`))
  })

  controller.hears([/(good\s+)?morning[!.,]?\s*$/i], ['ambient', 'direct_message', 'message_received'], function(bot, message) {
    const goodBad = function(text) {
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
          convo.ask('And is that good or bad?', goodBad(text))
        }

        convo.next()
      })
    }

    bot.startConversation(message, askHow)
  })
}

