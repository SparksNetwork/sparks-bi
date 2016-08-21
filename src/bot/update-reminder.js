import Promise from 'bluebird'
import {
  propEq, prop, mergeAll, contains, reject, allPass, filter, find, compose, trim, not,
} from 'ramda'
import moment from 'moment'

const TEN_MINUTES = 1000 * 60 * 10

/**
 * @param options.channel
 * @param options.team
 */
export function UpdateReminder(controller, slack, options) {
  const {storage} = controller
  let dailyUpdateChannel
  let users

  slack.channels.list().then(({channels}) =>
    dailyUpdateChannel = channels.find(propEq('name', options.channel))
  )

  async function getTeam() {
    return await storage.teams.getAsync(options.team)
  }

  async function getUser(userId) {
    return await Promise.all([
      slack.users.info(userId).then(prop('user')),
      slack.users.getPresence(userId),
      storage.users.getAsync(userId).then(u => u || {id: userId}),
    ])
    .then(mergeAll())
  }

  async function getTeamUsers() {
    const team = await getTeam()
    return await Promise.all(team.users.map(id => getUser(id)))
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

  function usersLastUpdateMessage(user) {
    if (user.lastUpdateAt) {
      const m = moment(user.lastUpdateAt)
      return `${user.name} last gave an update ${m.fromNow()}: ${user.lastUpdate}`
    } else {
      return `${user.name} has never given an update`
    }
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

    checkTimer() // eslint-disable-line
  }

  function checkTimer() {
    setTimeout(checkUpdates, TEN_MINUTES)
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
    const user = await getUser(userId)
    bot.reply(message, usersLastUpdateMessage(user))
  })

  controller.hears([/^who.*updated/, /^show.*updates/], ['direct_message', 'direct_mention'], async function(bot, message) {
    if (message.event === 'direct_mention' && message.channel !== dailyUpdateChannel.id) { return }

    const team = await getTeam()
    const users = await getTeamUsers()

    const updates = users
      .filter(prop('lastUpdateAt'))
      .filter(u => moment(u.lastUpdateAt).isAfter(moment().add(-24, 'h')))
      .map(user => `*${user.name}*: ${user.lastUpdate}`)

    const notUpdated = users
      .filter(u =>
        not(u.lastUpdateAt && moment(u.lastUpdateAt).isAfter(moment().add(-24, 'h'))))
      .map(usersLastUpdateMessage)

    if (updates.length === 0) {
      bot.reply(message, `Nobody has updated today!`)
    } else {
      bot.reply(message, updates.join(`\n`))
    }

    if (notUpdated.length > 0) {
      bot.reply(message, notUpdated.join(`\n`))
    }
  })
}
