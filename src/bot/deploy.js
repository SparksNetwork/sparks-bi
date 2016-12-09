import axios from 'axios'
import {trim} from 'ramda'
const token = process.env['TRAVIS_CI']
const client = axios.create({
  baseURL: 'https://api.travis-ci.org',
  headers: {
    'Travis-API-Version': '3',
    'Authorization': `token ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
})

export default function Deploy(controller) {
  console.log('loading deploy')
  controller.describe({
    name: 'Deploy',
    examples: ['deploy feat-123 to staging']
  })
  controller.hears([/^deploy (.+) to (.+)/], ['direct_message', 'direct_mention'], async function(bot, message) {
    const [,branch,stage] = message.match.map(trim)

    const body = {
      request: {
        branch: branch,
        config: {
          env: {
            deploy_to: stage
          }
        }
      }
    }

    bot.reply(message, `Deploying ${branch} to ${stage}`)

    const response = await client.post('/repo/SparksNetwork%2Fsparks-frontend/requests', {
      data: JSON.stringify(body)
    })
  })
}