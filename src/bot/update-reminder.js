import Promise from 'bluebird'
import {
  propEq, prop, mergeAll, contains, reject, allPass, filter, find, compose, trim,
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
