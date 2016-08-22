import Promise from 'bluebird'
import Botkit from 'botkit'
import {WebClient} from '@slack/client'
import {createStorage} from './bot-store'
import {keys, is, type} from 'ramda'

const slack = new WebClient(process.env.SLACK_TOKEN)

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

  controller.fb = fb
  controller.slack = slack
  controller.server = server

  const plugins = []

  const startRTM = Promise.promisify(bot::bot.startRTM)

  async function start() {
    const bot = await startRTM()

    for (let plugin of plugins) {
      if (plugin) { await plugin() }
    }

    return bot
  }

  function use(fnOrName, options) {
    const fn = is(String, fnOrName) ?
      require('./' + fnOrName).default :
        fnOrName

    return plugins.push(fn(controller, options))
  }

  return {
    use,
    start,
  }
}

export {createBot}
