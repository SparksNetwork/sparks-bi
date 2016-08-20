import Promise from 'bluebird'
import {
  compose, uniq, append, trim, path,
} from 'ramda'

function addToArray(item) {
  return compose(
    uniq,
    append(item),
    ary => ary || []
  )
}

export function Teams(controller, slack) {
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

