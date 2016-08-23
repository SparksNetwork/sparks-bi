const evts = {
  direct_message: 'direct message',
  direct_mention: 'mention @hermes',
  ambient: 'any channel message',
}

export default function Help(controller) {
  controller.describe({
    name: 'Help',
    examples: ['help'],
  })
  controller.hears([/^help$/, /help\s*(.*)?/], ['direct_mention', 'direct_message'], async function(bot, message) {
    bot.reply(message, 'Available commands:')

    controller.commands.forEach(command => {
      const description = command.events.map(e => evts[e]).join(', ')
      const cmdMessage = `*${command.name}*: ${description}`
      bot.reply(message, cmdMessage)

      if (command.examples) {
        const examples = command.examples.map(ex => '`' + ex + '`').join(', ')
        bot.reply(message, `  _examples_: ${examples}`)
      }
    })
  })
}
