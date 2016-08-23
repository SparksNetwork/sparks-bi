import Promise from 'bluebird'
import Botkit from 'botkit'
import {WebClient} from '@slack/client'
import {createStorage} from './bot-store'
import {keys, is, nth} from 'ramda'

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
  controller.commands = []

  const hears = controller::controller.hears

  let currentDescription
  let currentPlugin

  controller.describe = function(description) {
    currentDescription = description
  }
  controller.hears = function(...rest) {
    if (currentDescription) {
      currentDescription.events = nth(-2, rest)
      currentDescription.plugin = currentPlugin
      controller.commands.push(currentDescription)
    }
    currentDescription = null
    return hears(...rest)
  }

  const plugins = []
  const startRTM = Promise.promisify(bot::bot.startRTM)

  async function start() {
    const bot = await startRTM()

    for (let plugin of plugins) {
      if (plugin) { await plugin() }
    }

    return bot
  }

  function useFunction(fn, options) {
    currentPlugin = options.name || fn.name
    return plugins.push(fn(controller, options))
  }

  function useRequire(name, options) {
    useFunction(require('./' + name).default, {name, ...options})
  }

  function use(fnOrName, options) {
    return is(String, fnOrName) ?
      useRequire(fnOrName, options) :
      useFunction(fnOrName, options)
  }

  return {
    use,
    start,
  }
}

export {createBot}
