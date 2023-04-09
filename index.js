var framework = require('webex-node-bot-framework')
var webhook = require('webex-node-bot-framework/webhook')
var express = require('express')
var bodyParser = require('body-parser')
var webexService = require('./WebexHelperService')
var cronService = require('./cronJobService')
const logger = require('./logging');
var app = express()
app.use(bodyParser.json())
app.use(express.static('images'))
const config = require('./config.json')
var traits = require('./traits')
var dbService = require('./DatabaseOperation')
var helperCard = require('./helperCard')
const BotError = require('./BotException')


var framework = new framework(config)
framework.start()
logger.info('Starting framework, please wait...')

framework.on('initialized', async function () {
  try {
    logger.info('framework is all fired up! [Press CTRL-C to quit]')

    //creating table if not present
    logger.info('Creating Tables')
    await dbService.dbService.create();

    await dbService.dbService.populateTraits(traits);

    //Statring the schedular to post future PTOs
    logger.info('Starting Cron Job')
    cronService.startJob();
    logger.info('Cron Job Started')
  } catch (e) {
    console.log("ERROR: ", e);
  }
});


framework.on('spawn', (bot, id, actorId) => {
  if (!actorId) {
    console.log(
      `While starting up, the framework found our bot in a space called: ${bot.room.title}`
    )
  } else {
    var emailId;
    var msg =
      '\n_From now onwards I will be taking care of posting PTO message to your favourite spaces.'
    bot.webex.people
      .get(actorId)
      .then(user => {
        emailId = user.emails[0]
        msg = `**PTO Notification Bot here!** 🎉 ${msg}`
      })
      .catch(e => {
        console.error(
          `Failed to lookup user details in framwork.on("spawn"): ${e.message}`
        )
        msg = `Hello there. ${msg}`
      })
      .finally(() => {
        if (bot.isDirect) {
          return
        } else {
          let botName = bot.person.displayName
          msg += `\nPlease ping me personally to get more details._ 🙂`
          bot.say('markdown', msg)
        }
      })
  }
})

let responded = false


//configure the culture bot settings
framework.hears(/^1$|^culture_bot configure$/, async function (bot, trigger) {

  logger.info('Start configuring culture bot...');
  responded = true;
  var roomspace = await bot.webex.rooms.get({ id: bot.room.id })
  if (roomspace.type === 'group') {
    logger.info(`User input: ${trigger.text}`);
    try {
      await webexService.webexService.configureBot(bot);
    } catch (e) {
      bot.say('Error while fetching culture bot configuration, Please try again');
      if (e instanceof BotError) {
        logger.error('Error while fetching culture bot configuration. ' + 'Error Message: ' + e.message + ' Error type: ' + e.type);
      } else {
        logger.error('Error while fetching culture bot configuration' + e.stack);
      }
    }
  } else {
    bot
      .say(`Sorry, I didn't get that.`)
      .then(() => sendHelpInSpace(bot))
      .catch(e =>
        console.error(`Problem in the unexepected command hander: ${e.message}`)
      )
  }

})


//help command handler
framework.hears(
  /^5$|help|what can i (do|say)|what (can|do) you do/i,
  async function (bot, trigger) {
    logger.info(`someone needs help! They asked ${trigger.text}`)
    responded = true
    var roomspace = await bot.webex.rooms.get({ id: bot.room.id })
    if (roomspace.type === 'group') {
      logger.info(`catch-all handler fired for user input: ${trigger.text}`)
      bot
        .say(`Sorry, I didn't get that.`)
        .then(() => sendHelpInSpace(bot))
        .catch(e =>
          console.error(`Problem in the unexepected command hander: ${e.message}`)
        )
    } else {

      sendHelp(bot, trigger.person.displayName)

    }

  }
)



//submit template handler
framework.on('attachmentAction', async function (bot, trigger) {
  try {

    // Check if Action is trigerred from backupListCard
    logger.info("inputs : " + JSON.stringify(trigger.attachmentAction.inputs));
    var trait_type = trigger.attachmentAction.inputs.trait_type;
    var configureSubmitted = (trait_type === undefined) ? false : true;

    if (configureSubmitted) {
      logger.info('configureSubmitted');
      var inputs = trigger.attachmentAction.inputs;
      var roomspace = await bot.webex.rooms.get({ id: bot.room.id });
      logger.info("Post " + inputs.trait_type + " to " + roomspace.id + " " + inputs.frequency);
      let schedule = {};
      schedule.spaceId = roomspace.id;
      schedule.frequency = inputs.frequency;
      schedule.trait_type = inputs.trait_type;

      await webexService.webexService.createOrUpdateSchedule(schedule);
      bot.say("Configuration Successful").catch(err => logger.info(err));
    } else {
      bot.reply("Invalid input");
    }
  } catch (e) {
    bot.reply(trigger.attachmentAction, 'Error while submitting, Please try again');
    if (e instanceof BotError) {
      logger.error('Error While submitting ' + 'Error Message: ' + e.message + ' Error type: ' + e.type)
    } else {
      logger.error('Error While submitting ' + e.stack)
    }
  }
})



//Notsupported command handler
framework.hears(/.*/, async function (bot, trigger) {
  var roomspace = await bot.webex.rooms.get({ id: bot.room.id })
  if (roomspace.type === 'group') {
    if (!responded) {
      logger.info(`catch-all handler fired for user input: ${trigger.text}`)
      bot
        .say(`Sorry, I didn't get that.`)
        .then(() => sendHelpInSpace(bot))
        .catch(e =>
          logger.error(`Problem in the unexepected command hander: ${e.message}`)
        )
    }
  } else {
    if (!responded) {
      logger.info(`catch-all handler fired for user input: ${trigger.text}`)
      bot
        .say(`Sorry, I didn't get that.`)
        .then(async () => sendHelp(bot, trigger.person.displayName))
        .catch(e =>
          logger.error(`Problem in the unexepected command hander: ${e.message}`)
        )
    }
  }


  responded = false
})



// 1:1 help command handler
async function sendHelp(bot, displayName) {

  var helperCardCloneObject = JSON.parse(JSON.stringify(helperCard));
  var textWithName = helperCardCloneObject.body[1].text.replace("{personName}", displayName)

  helperCardCloneObject.body[1].text = textWithName

  var roomMembers = await bot.webex.memberships.list({ roomId: bot.room.id });
  for (const roomMember of roomMembers) {

    if (roomMember.personId === bot.person.id) {
      continue;
    }
    await bot.dmCard(`${roomMember.personEmail}`, helperCardCloneObject, "Help Message From PTO Notification Bot");
  }

}

// space help command handler
function sendHelpInSpace(bot) {
  bot.say(
    'markdown',
    'You can say:',
    '\n' +
    '**welcomeMembers** to send space members a 1:1 welcome message. \n\n'
  )
}


app.get('/', function (req, res) {
  res.send(`I'm alive.`)
})

app.post('/', webhook(framework))

var server = app.listen(config.port, function () {
  framework.debug('framework listening on port %s', config.port)
})

process.on('SIGINT', function () {
  framework.debug('stoppping...')
  server.close()
  framework.stop().then(function () {
    process.exit()
  })
})

module.exports.framework = framework
