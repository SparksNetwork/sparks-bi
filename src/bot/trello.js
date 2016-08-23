import assert from 'assert'
import Promise from 'bluebird'
import {
  flatten,
  contains,
  propEq,
  prop,
  eqProps,
  path,
  pathOr,
  merge,
  mergeAll,
  test,
} from 'ramda'
import TrelloClient from 'node-trello'

const KEY = process.env.TRELLO_KEY
const TOKEN = process.env.TRELLO_TOKEN
const URL = process.env.URL

const trelloClient = new TrelloClient(KEY, TOKEN)
const trello = {}

for (let method of ['get', 'put', 'post']) {
  trello[method] = Promise.promisify(trelloClient::trelloClient[method])
}

async function createWebhook(name) {
  const boards = await trello.get('/1/members/me/boards')
  const board = boards.find(propEq('name', name))
  const webhooks = await trello.get(`/1/tokens/${TOKEN}/webhooks`)
  const webhook = webhooks.find(propEq('description', 'hermes'))

  if (!webhook) {
    const newWebHook = await trello.post(`/1/tokens/${TOKEN}/webhooks`, {
      description: 'hermes',
      callbackURL: `${URL}/trello`,
      idModel: board.id,
    })

    console.log(newWebHook)
  } else {
    console.log('webhook found')
  }
}

async function getCardComments(id) {
  const card = await trello.get(`/1/cards/${id}`, {actions: 'commentCard'})
  return card.actions.filter(propEq('type', 'commentCard'))
}

export default function Trello(controller, options) {
  const {server, slack, storage} = controller
  const {board: boardName, lists} = options
  let board

  async function getTrelloLists() {
    const names = lists.map(prop('name'))
    return (await trello.get(`/1/boards/${board.id}/lists`, {
      cards: 'none',
    })).filter(list => contains(list.name, names))
  }

  async function alertListChange(card, action, list) {
    const {alert} = list
    const team = await storage.teams.getAsync(alert.team)
    const url = `https://trello.com/c/${card.shortLink}`

    const comments = await getCardComments(card.id)
    const pr = comments.map(pathOr('', ['data', 'text']))
      .find(test(/github.*pull/))

    const users = await Promise.all(
      team.users.map(id => slack.users.info(id).then(prop('user'))))

    const usersHandles = users.map(prop('name')).map(name => `@${name}`).join(' ')
    const message = `${usersHandles} Card ${card.name} has moved to ${list.label} ${url}`

    slack.chat.postMessage(`#${alert.channel}`, message, {
      as_user: true,
      parse: 'full',
      attachments: pr ? [
        {fields: [{title: 'Pull Request', value: pr}]},
      ] : [],
    })
  }

  function reactToChange(lists) {
    return async function reactToChange({action}) {
      const listBefore = path(['data', 'listBefore'], action)
      const listAfter = path(['data', 'listAfter'], action)
      if (listBefore && listAfter && eqProps('id', listBefore, listAfter)) {
        return
      }
      const card = path(['data', 'card'], action)
      if (!card) { return }

      const list = lists.find(propEq('name', listAfter.name))

      if (list && list.alert) {
        await alertListChange(card, action, merge(listAfter, list))
      }
    }
  }

  async function getTrelloMemberId(bot, message) {
    const user = await Promise.all([
      slack.users.info(message.user).then(prop('user')),
      storage.users.getAsync(message.user),
    ]).then(mergeAll)

    if (user.trelloMemberId) {
      return user.trelloMemberId
    }

    const boardMembers = await trello.get(`/1/boards/${board.id}/members`)
    const matchMember = boardMembers.find(propEq('username', user.name))

    if (matchMember) {
      await storage.users.save({id: user.id, trelloMemberId: matchMember.id})
      return matchMember.id
    }

    const question = `I need to know who you are on trello. Choose one of the usernames, or type STOP:\n${boardMembers.map(prop('username')).join(', ')}`

    const convoP = new Promise(resolve => {
      async function trelloReply(response, convo) {
        const givenName = response.text.trim()
        if (test(/STOP/, givenName)) { resolve(null); convo.next(); return }

        const givenUser = boardMembers.find(propEq('username', givenName))

        if (givenUser) {
          await storage.users.saveAsync({id: user.id, trelloMemberId: givenUser.id})
          resolve(givenUser.id)
        } else {
          resolve(null)
        }

        convo.next()
      }

      bot.startConversation(message, (response, convo) => convo.ask(question, trelloReply))
    })

    return await convoP
  }

  const assignConvo = memberId => (next, card) => async function(response, convo) {
    if (test(/[Yy](?:es)?/, response.text)) {
      if (memberId) {
        convo.say('OK, I\'m assigning it to you')
        await trello.post(`/1/cards/${card.id}/idMembers`, {value: memberId})
      } else {
        convo.say('Nada')
      }
    } else {
      next(response, convo)
    }
    convo.next()
  }

  const cardConvo = (memberId, lists) => (next, card) => (response, convo) => {
    const list = lists.find(propEq('id', card.idList))
    const listName = list.name.split('-')[0].trim()
    const message = `You could work on *${card.name}* in *${listName}*\n${card.shortUrl} (yes/no?)`
    convo.ask(message, assignConvo(memberId)(next, card))
  }

  controller.describe({
    name: 'What next',
    examples: ['what should I work on?', 'What should I do now?'],
  })
  controller.hears([/what (now|next)/i, /what should I work on/i, /what should I do/i], ['direct_message', 'direct_mention'], async function(bot, message) {
    bot.reply(message, 'Let me take a look for you')
    const memberId = await getTrelloMemberId(bot, message)

    const lists = (await getTrelloLists()).reverse()

    const cards = flatten(await Promise.all(
      lists.map(list =>
        trello.get(`/1/lists/${list.id}/cards`, {filter: 'open', members: true})
      )
    ))

    const convo = cards
      .filter(card => card.members.length === 0)
      .reverse()
      .reduce(cardConvo(memberId, lists), function(response, convo) {
        convo.say('There\'s nothing else')
      })

    bot.startConversation(message, convo)
  })

  server.post('/trello', function(req, res, next) {
    const body = req.body
    reactToChange(lists)(body)
    res.send({ok: true})
    return next()
  })

  /**
  * Used by trello to verify webhook works
  */
  server.head('/trello', function(req, res, next) {
    res.send(200, 'ok')
    return next()
  })

  return async function() {
    board = (await trello.get(`/1/members/me/boards`)).find(propEq('name', boardName))
    assert(board, 'Board not found!')

    try {
      createWebhook(boardName)
    } catch (err) {
      console.log('Error creating trello webhook', err)
    }
  }
}
