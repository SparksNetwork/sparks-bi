import Promise from 'bluebird'
import assert from 'assert'
import {
  compose, uniq, append, trim, mergeAll, prop,
} from 'ramda'

function addToArray(item) {
  return compose(
    uniq,
    append(item),
    ary => ary || []
  )
}

export default function Teams(controller) {
  const {storage, slack} = controller

  async function getTeam(teamId) {
    assert(teamId, 'No teamId')
    return await storage.teams.getAsync(teamId)
  }

  async function getTeamUsers(teamId) {
    const team = await getTeam(teamId)

    return await Promise.all(team.users.map(id => Promise.all([
      slack.users.info(id).then(prop('user')),
      slack.users.getPresence(id),
      storage.users.getAsync(id),
    ]).then(mergeAll)))
  }

  async function listOfUsersMessage(teamId) {
    const users = await getTeamUsers(teamId)
    console.log(users)
    return `The ${teamId} team has the users ${users.map(prop('name')).join(', ')}`
  }

  async function addUserToTeam(teamId, userId) {
    const team = await storage.teams.getAsync(teamId) || {id: teamId}
    const user = await storage.users.getAsync(userId) || {id: userId}

    team.users = addToArray(userId)(team.users)
    user.teams = addToArray(teamId)(user.teams)

    await storage.teams.saveAsync(team)
    await storage.users.saveAsync(user)

    const {channel: {id: channelId}} = await slack.im.open(userId)
    const listMessage = await listOfUsersMessage(teamId)

    slack.chat.postMessage(channelId, `You've been added to team ${teamId} and I'll message you team events.\n${listMessage}`, {as_user: true})
  }

  controller.describe({
    name: 'Add to team',
    examples: ['add jeremy to the dev team', 'add bob to accounts team'],
  })
  controller.hears([/^add <@(.+)> to (?:the )?(.+) team/], ['direct_message', 'direct_mention'], async function(bot, message) {
    const [,userId,teamId] = message.match.map(trim)
    await addUserToTeam(teamId, userId)

    const {user: {name}} = await slack.users.info(userId)
    bot.reply(message, `Added ${name} to ${teamId}`)
  })

  controller.describe({
    name: 'Add myself to team',
    examples: ['add myself to dev team', 'add me to accounts team']
  })
  controller.hears([/^add (?:myself|me) to (.+) team/], ['direct_message', 'direct_mention'], async function(bot, message) {
    const [,teamId] = message.match.map(trim)
    await addUserToTeam(teamId, message.user)
  })

  controller.describe({
    name: 'Who is in team',
    examples: ['who is in dev team', 'describe the accounts team']
  })
  controller.hears([/^(who is in|describe) (?:the )?(.+) team/], ['direct_message', 'direct_mention'], async function(bot, message) {
    const [,,teamId] = message.match.map(trim)
    const team = await storage.teams.getAsync(teamId)

    if (team) {
      bot.reply(message, await listOfUsersMessage(teamId))
    } else {
      bot.reply(message, `Cannot find a team named ${teamId}`)
    }
  })
}

