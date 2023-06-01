const dayjs = require('dayjs')
var utc = require('dayjs/plugin/utc')
var timezone = require('dayjs/plugin/timezone') // dependent on utc plugin
var toObject = require('dayjs/plugin/toObject')
var createPTOObject = require('./CreatePTO')
var configureTemplate = require('./configureTemplate.json')
var ptomessageToday = require('./PTOMessageToday')
var ptoListObject = require('./PTOList')
var backupListObject = require('./BackupListCard')
var dbService = require('./DatabaseOperation')
const logger = require('./logging');
var traitTemplate = require('./traitTemplate')
var index = require('./index')
const config = require('./config.json')

const webexService = {

  async configureBot(bot) {
    var configureCard = JSON.parse(JSON.stringify(configureTemplate));
    bot.sendCard(configureCard, "Configure Card");
  },

  async createOrUpdateSchedule(schedule) {
    logger.info("Checking if there is already a schedule for spaceId " + schedule.spaceId);
    let existingSchedule = await dbService.dbService.getScheduleBySpaceId(schedule.spaceId);
    if (existingSchedule && existingSchedule.spaceid == schedule.spaceId) {
      logger.info("Found existing schedule for the spaceId : " + schedule.spaceId);
      existingSchedule.trait_type = schedule.trait_type;
      existingSchedule.frequency = schedule.frequency;
      existingSchedule.time = schedule.time;
      existingSchedule.timezone = schedule.timezone;
      await dbService.dbService.updateSchedule(existingSchedule, existingSchedule.id);
    } else {
      await dbService.dbService.createSchedule(schedule);
    }
  },

  async postCulturesInSpaces() {
    dayjs.extend(utc);
    dayjs.extend(timezone);
    dayjs.extend(toObject);

    var traitCard = JSON.parse(JSON.stringify(traitTemplate));
    let schedules = await dbService.dbService.getAllSchedules();
    for (var schedule of schedules) {
      try {
        logger.info(schedule);

        let serverTime = new Date();
        logger.info("serverTime : " + serverTime);
        logger.info("Schedule Time : " + schedule.time + " " + schedule.timezone);
        let targetTime = dayjs(serverTime).tz(schedule.timezone);
        var date = targetTime.toObject();
        logger.info("date.toObject() : " + JSON.stringify(date));

        var day = targetTime.day();
        logger.info("targetTime.day() : " + day);

        if (schedule.frequency != 8 && day != schedule.frequency) {
          logger.info("Day does not match");
          continue;
        }

        if (date.hours != schedule.time.split(':')[0] || date.minutes != schedule.time.split(':')[1]) {
          continue;
        }
        
        var next_trait_id = 0;
        var next_trait_type = schedule.last_posted_trait_type;

        if (schedule.trait_type == 'all_traits') {
          if (schedule.last_posted_trait_type == 'GOOD') {
            next_trait_type = 'BAD';
            next_trait_id = schedule.last_posted_bad_trait_id;
          } else {
            next_trait_type = 'GOOD';
            next_trait_id = schedule.last_posted_good_trait_id;
          }
        } else {
          if (schedule.last_posted_trait_type == 'BAD') {
            next_trait_id = schedule.last_posted_bad_trait_id;
          } else {
            next_trait_id = schedule.last_posted_good_trait_id;
          }
        }
        
        let trait = await dbService.dbService.getNextTraitByIdAndTraitType(next_trait_id, next_trait_type);
        if (!trait || trait == null) {          
          trait = await dbService.dbService.getNextTraitByIdAndTraitType(0, next_trait_type);
        }
        traitCard.body[1].text = trait.trait;
        traitCard.body[0].columns[0].items[1].text = trait.title;
        traitCard.body[0].columns[0].items[0].url = 'https://proxy-int.broadcloudpbx.net/images/broadsoft/customercare/good_team_work.jpg';
        

        if (trait.trait_type == 'BAD') {
          traitCard.body[0].columns[0].items[0].url = 'https://proxy-int.broadcloudpbx.net/images/broadsoft/customercare/bad_team_work.jpeg';
        }
        
        const botObject = await index.framework.getBotByRoomId(schedule.spaceid);
        botObject.sendCard(traitCard);
        logger.info("Posted team traits to space");
        
        if (next_trait_type == 'GOOD') {
          schedule.last_posted_good_trait_id = trait.id;
        } else {
          schedule.last_posted_bad_trait_id = trait.id;
        }
        schedule.last_posted_trait_type = trait.trait_type;
        dbService.dbService.updateSchedule(schedule, schedule.id);
        logger.info("Updated last_posted_trait details in schedules");
      } catch (e) {
        logger.error('Error Occurred while posting cultures into space ' + e.stack);
      }
    }
    logger.info("Completed postCulturesInSpaces() method execution.");
  }

}

exports.webexService = webexService
