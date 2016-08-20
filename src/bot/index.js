import Promise from 'bluebird'
import Botkit from 'botkit'
import {WebClient} from '@slack/client'
import {createStorage} from './bot-store'
import moment from 'moment'
import {
  T, test, keys, prop, path, propEq, find, trim, compose, uniq, append,
  contains, mergeAll, filter, reject, allPass,
} from 'ramda'
import rm from 'remove-markdown'
import fs from 'fs'

import {Teams} from './teams'
import {UpdateReminder} from './update-reminder'
import {Greeter} from './greeter'

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

  Greeter(controller, fb)

  Teams(controller, slack)

  UpdateReminder(controller, slack, {
    channel: 'daily-update',
    team: 'dev',
  })

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
