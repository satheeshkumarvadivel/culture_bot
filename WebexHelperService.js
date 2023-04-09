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
          return;
        }

        if (date.hours != schedule.time.split(':')[0] || date.minutes != schedule.time.split(':')[1]) {
          return;
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
        traitCard.body[0].columns[0].items[1].text = trait.trait_type + " TEAM MEMBER TRAIT";
        if (trait.trait_type == 'BAD') {
          traitCard.body[0].style = 'warning';
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
        logger.error('Error Occurred while posting cultures into space ' + e);
      }
    }
    logger.info("Completed postCulturesInSpaces() method execution.");
  },

  async generateBackupList(bot) {

    var backupListCloneObject = JSON.parse(JSON.stringify(backupListObject));
    var roomMembers = await bot.webex.memberships.list({ roomId: bot.room.id });
    for (const roomMember of roomMembers) {

      if (roomMember.personId === bot.person.id) {
        continue;
      }

      logger.info('generateBackupList cmd called by ' + roomMember.personEmail)
      let backuplist = {}

      backuplist = await dbService.dbService.fetchBackupList(roomMember.personEmail);

      let i = 1;

      if (backuplist != null) {
        for (const key in backuplist) {
          if (i <= 3) {
            backupListCloneObject.body[1].columns[0].items[i].value = key;
            backupListCloneObject.body[1].columns[1].items[i].value = backuplist[key];
            i++;
          }
        }
      }

      for (; i <= 3; i++) {
        backupListCloneObject.body[1].columns[0].items[i].value = '';
        backupListCloneObject.body[1].columns[1].items[i].value = '';

      }
      await bot.dmCard(`${roomMember.personEmail}`, backupListCloneObject, "Backup List");
    }
  },


  async generatePTOCardForFuture(bot) {

    var createPTOCloneObject = JSON.parse(JSON.stringify(createPTOObject));
    var roomMembers = await bot.webex.memberships.list({ roomId: bot.room.id });

    var currentDate = new Date();
    logger.info("currentDate -->>" + currentDate)
    var offset = currentDate.getTimezoneOffset() / 60;
    var diffIST = await this.getTimeZoneDiff(offset)
    currentDate.setTime(currentDate.getTime() + diffIST);
    logger.info("currentDate -->>" + currentDate)

    var day = ("0" + currentDate.getDate()).slice(-2);
    var month = ("0" + (currentDate.getMonth() + 1)).slice(-2);
    var year = currentDate.getFullYear();
    var date = year + "-" + month + "-" + day;

    createPTOCloneObject.body[1].columns[0].items[1].value = date
    createPTOCloneObject.body[1].columns[1].items[1].value = date


    for (const roomMember of roomMembers) {

      logger.info('generatePTOCardForFuture cmd called by ' + roomMember.personEmail)

      var spaceList = await dbService.dbService.fetchPTOList(roomMember.personEmail);

      if (roomMember.personId === bot.person.id) {
        continue;
      }

      var index = 1;
      for (const space of spaceList) {

        if (space.length > 0) {

          try {
            var roomInfo = await bot.webex.rooms.get({ id: space })

            createPTOCloneObject.body[5].columns[0].items.push({
              "type": "TextBlock",
              "text": "- " + roomInfo.title + "\r",
              "size": "Small"
            })
            index = index + 1;
          } catch (error) {
            logger.error('Error ' + error + ' Occurred while fetching roomInfo for ' + roomMember.personEmail)
            continue
          }
        }
      }
      createPTOCloneObject.body[4].text = "Selected Spaces to Post: " + "(" + (index - 1) + " Spaces )"
      if (createPTOCloneObject.body[5].columns[0].items.length == 0) {
        createPTOCloneObject.body[6].isVisible = true;

      }

      //Get Backup list
      await this.populateBackupInfo(roomMember.personEmail, createPTOCloneObject.actions[0].card.body[0].facts)

      await bot.dmCard(`${roomMember.personEmail}`, createPTOCloneObject, "PTO Card For Duration");

    }
  },
  // async generatePTOCardForToday(bot) {

  //   var createPTOTodayCloneObject = JSON.parse(JSON.stringify(createPTOTodayObject));
  //   var roomMembers = await bot.webex.memberships.list({ roomId: bot.room.id })

  //   for (const roomMember of roomMembers) {

  //     var spaceList = await dbService.dbService.fetchPTOList(
  //       roomMember.personEmail
  //     )

  //     if (roomMember.personId === bot.person.id) {
  //       continue
  //     }

  //     logger.info('generatePTOCardForToday Command called by ' + roomMember.personEmail)

  //     var index = 1
  //     for (const space of spaceList) {
  //       if (space.length > 0) {
  //         try {
  //           var roomInfo = await bot.webex.rooms.get({ id: space })
  //           createPTOTodayCloneObject.body[8].columns[0].items.push({
  //             type: 'TextBlock',
  //             text: '- ' + roomInfo.title + '\r',
  //             size: 'Small'
  //           })
  //           index = index + 1
  //         } catch (error) {
  //           logger.error('Error ' + error + ' Occurred while fetching roomInfo for ' + roomMember.personEmail)
  //           continue
  //         }


  //       }
  //     }
  //     createPTOTodayCloneObject.body[7].text = 'Selected Spaces to Post: ' + '(' + (index - 1) + ' Spaces )'
  //     if (createPTOTodayCloneObject.body[8].columns[0].items.length == 0) {
  //       createPTOTodayCloneObject.body[9].isVisible = true
  //     }


  //     //Get Backup list
  //     await this.populateBackupInfo(roomMember.personEmail, createPTOTodayCloneObject.actions[0].card.body[0].facts)

  //     await bot.dmCard(
  //       `${roomMember.personEmail}`,
  //       createPTOTodayCloneObject,
  //       'PTO Card For Today'
  //     )

  //   }
  // },
  async getTimeZoneDiff(ofsth1) {
    var ofsth2 = 33 / 6;
    var t = ofsth1 + ofsth2;
    return t * 60 * 60 * 1000;

  },
  async generatePTOForFuture() {

    var currentDate = new Date()
    var offset = currentDate.getTimezoneOffset() / 60;
    var diffIST = await this.getTimeZoneDiff(offset)
    currentDate.setTime(currentDate.getTime() + diffIST);
    logger.info('Current Time IST --> ' + currentDate)
    var r = await dbService.dbService.fetchData(currentDate);
    logger.info('fetched data --> ' + JSON.stringify(r))
    for (const data of r) {


      let avatar = data.avatar;

      var from = data.fromDatePTO
      var to = data.toDatePTO
      var message = data.message
      var name = data.name
      var em = data.emailId

      //Get Backup list
      await this.populateBackupInfo(em, ptoCloneMessage[0].content.actions[0].card.body[0].facts)


      ptoCloneMessage[0].content.body[0].items[0].columns[0].items[0].url = avatar
      ptoCloneMessage[0].content.body[0].items[0].columns[1].items[0].text = name
      ptoCloneMessage[0].content.body[0].items[0].columns[1].items[1].text = em
      ptoCloneMessage[0].content.body[0].items[0].columns[1].items[2].facts[0].value = from
      ptoCloneMessage[0].content.body[0].items[0].columns[1].items[2].facts[1].value = to
      ptoCloneMessage[0].content.body[0].items[0].columns[1].items[2].facts[2].value = message
      var dataList = await dbService.dbService.fetchPTOList(em);

      for (const da of dataList) {
        if (da.length > 0) {
          try {
            const botObject = await index.framework.getBotByRoomId(da);
            await botObject.webex.messages.create({ roomId: da, attachments: ptoCloneMessage, text: "PTO Card" })
            logger.info("posted");
          } catch (error) {
            logger.error('Error ' + error + ' Occurred while fetching bot instance for ' + em)
            continue
          }
        }
      }
    }
  },
  async generatePTOToday(bot, trigger, date_ob, em) {
    let avatar = trigger.person.avatar
      ? trigger.person.avatar
      : `${config.defaultProfileUrl}`
    var from_time = trigger.attachmentAction.inputs.from_time
    var to_time = trigger.attachmentAction.inputs.to_time
    var message = trigger.attachmentAction.inputs.pto_message
    var leave_type = trigger.attachmentAction.inputs.leave_type
    var name = trigger.person.displayName

    logger.info("from_time-->>" + from_time)
    logger.info("to_time-->>" + to_time)


    var day = ("0" + date_ob.getDate()).slice(-2);
    var month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    var year = date_ob.getFullYear();
    var date = year + "-" + month + "-" + day;

    if (!leave_type) {
      logger.info('Leave Type has to be selected!')
      bot.sayWithLocalFile('Try again!', './images/leave_type_to_be_selected.png')
      return
    }

    if (leave_type === "few_hours") {
      if (!from_time || !to_time) {
        logger.info('Timings should not be empty')
        //bot.reply(trigger.attachmentAction, 'Timings should not be empty')
        bot.sayWithLocalFile('Try again!', './images/timings_should_not_be_empty.png')
        return
      } else if (from_time.localeCompare(to_time) == 1 || from_time.localeCompare(to_time) == 0) {
        logger.info('Invalid Timings')
        bot.sayWithLocalFile('Try again!', './images/Invalid_timings.png')
        //bot.reply(trigger.attachmentAction, 'Invalid Timings')
        return
      }
      // else{
      //   var totalDuration = 0;
      //   var fromHour = parseInt(from_time.substring(0,2), 10)
      //   var toHour = parseInt(to_time.substring(0,2), 10)


      //   var fromMin = parseInt(from_time.substring(3,5), 10)
      //   var toMin = parseInt(to_time.substring(3,5), 10)

      //   var diffMin =  (60 - fromMin)+ toMin

      //   if(diffMin >= 60){
      //     totalDuration+=1;
      //   }

      //   totalDuration = totalDuration + (toHour - fromHour -  1);


      //   if(totalDuration > 2){
      //    bot.reply(trigger.attachmentAction, 'Duration should be less than 3 hours')
      //    return
      //   }

      // }
    }

    if (!message) {
      logger.info('Message should not be empty')
      bot.sayWithLocalFile('Try again!', './images/message_not_empty.png')
      //  bot.reply(trigger.attachmentAction, 'messgae should not be empty'))
      return
    }

    if (message.length > 100) {
      logger.info('Message should be less than 100 characters')
      bot.reply(
        trigger.message,
        './images/less_than_100_char.png'
      )
      return
    }


    if (leave_type === "full_day")
      leave_type = "Full Day"

    if (leave_type === "few_hours")
      leave_type = "Few hours"

    var ptomessageCloneToday = JSON.parse(JSON.stringify(ptomessageToday));

    ptomessageCloneToday[0].content.body[0].items[0].columns[0].items[0].url = avatar
    ptomessageCloneToday[0].content.body[0].items[0].columns[1].items[0].text = name
    ptomessageCloneToday[0].content.body[0].items[0].columns[1].items[1].text = em

    ptomessageCloneToday[0].content.body[0].items[0].columns[1].items[2].facts[0].value = date
    ptomessageCloneToday[0].content.body[0].items[1].columns[0].items[0].facts[0].value = message
    ptomessageCloneToday[0].content.body[0].items[1].columns[0].items[0].facts[1].value = leave_type

    ptomessageCloneToday[0].content.body[0].items[1].columns[0].items[1].facts[0].value = from_time
    ptomessageCloneToday[0].content.body[0].items[1].columns[0].items[1].facts[1].value = to_time

    if (leave_type != 'Few hours') {
      ptomessageCloneToday[0].content.body[0].items[1].columns[0].items[1].isVisible = false
    }
    var dataList = await dbService.dbService.fetchPTOList(em);

    if (dataList.length == 0) {
      //bot.reply(trigger.attachmentAction, "'Spaces to Post is empty.");
      bot.sayWithLocalFile('Try again!', './images/spaces_to_post_empty.png')
      return;
    }

    //Get Backup list
    await this.populateBackupInfo(em, ptomessageCloneToday[0].content.actions[0].card.body[0].facts)


    await this.postPTO(bot, dataList, ptomessageCloneToday)
    //bot.reply(trigger.attachmentAction, 'Successfully Posted')
    bot.sayWithLocalFile('Yayy!', './images/success_message.png')


  },
  async postPTO(bot, dataList, templateObject) {

    for (const da of dataList) {
      if (da.length > 0) {
        try {
          bot.webex.messages.create({ roomId: da, attachments: templateObject, text: "PTO Card" })
          logger.info("posted");
        } catch (error) {
          logger.error('Error ' + error + ' Occurred while Posting Messages')
          continue
        }
      }
    }


  },
  async postFuturePTOToday(bot, trigger, avatar, from, to, message, name, em) {
    logger.info('postFuturePTOToday called by ' + em)
    var ptoCloneMessage = JSON.parse(JSON.stringify(ptoMessage));

    //Get Backup list
    await this.populateBackupInfo(em, ptoCloneMessage[0].content.actions[0].card.body[0].facts);


    ptoCloneMessage[0].content.body[0].items[0].columns[0].items[0].url = avatar
    ptoCloneMessage[0].content.body[0].items[0].columns[1].items[0].text = name
    ptoCloneMessage[0].content.body[0].items[0].columns[1].items[1].text = em
    ptoCloneMessage[0].content.body[0].items[0].columns[1].items[2].facts[0].value = from
    ptoCloneMessage[0].content.body[0].items[0].columns[1].items[2].facts[1].value = to
    ptoCloneMessage[0].content.body[0].items[0].columns[1].items[2].facts[2].value = message
    var dataList = await dbService.dbService.fetchPTOList(em);

    await this.postPTO(bot, dataList, ptoCloneMessage)

  },
  async savePTORecord(bot, trigger, date_ob, em) {
    var isTimeAfter = false
    var isTimeBefore = false

    let avatar = trigger.person.avatar
      ? trigger.person.avatar
      : `${config.defaultProfileUrl}`
    var from = trigger.attachmentAction.inputs.from_date
    var to = trigger.attachmentAction.inputs.to_date
    var message = trigger.attachmentAction.inputs.pto_message
    var name = trigger.person.displayName


    var istDate = new Date(date_ob);

    logger.info("istDate + " + istDate)

    if (!message) {
      logger.info('Message should not be empty')
      bot.sayWithLocalFile('Try again!', './images/message_not_empty.png')
      //bot.reply(trigger.attachmentAction, 'Message should not be empty')
      return
    }

    if (message.length > 100) {
      logger.info('Message should be less than 100 characters')
      bot.sayWithLocalFile('Try again!', './images/less_than_100_char.png')
      // bot.reply(
      //   trigger.attachmentAction,
      //   'Message should be less than 100 characters'
      // )
      return
    }

    if (
      !from ||
      !to ||
      new Date(from).setHours(0, 0, 0, 0) < date_ob.setHours(0, 0, 0, 0) ||
      new Date(to).setHours(0, 0, 0, 0) < date_ob.setHours(0, 0, 0, 0) ||
      new Date(from).setHours(0, 0, 0, 0) > new Date(to).setHours(0, 0, 0, 0)
    ) {
      logger.info('Invalid Date')
      //bot.reply(trigger.attachmentAction, 'Invalid Date')
      bot.sayWithLocalFile('Try again!', './images/Invalid_Date.png')
      return
    }

    if (new Date(from).setHours(0, 0, 0, 0) == date_ob.setHours(0, 0, 0, 0)) {
      if (istDate.getHours() >= 9) {
        isTimeAfter = true;
        await this.postFuturePTOToday(bot, trigger, avatar, from, to, message, name, em)
      } else {
        isTimeBefore = true;
      }
    }

    var dataList = await dbService.dbService.fetchPTOList(em);

    if (dataList.length == 0) {
      // bot.reply(trigger.attachmentAction, "'Spaces to Post is empty.");
      bot.sayWithLocalFile('Try again!', './images/spaces_to_post_empty.png')
      return;
    }

    await dbService.dbService.insert(name, em, from, to, message, avatar)
    if (isTimeAfter) {
      bot.sayWithLocalFile('Yayy!', './images/posted_message_today_1.png')
      //bot.reply(trigger.attachmentAction, 'Successfully Posted your PTO message for today. Rest of your planned leave will be posted at 9AM IST each day.')
    } else if (isTimeBefore) {
      bot.sayWithLocalFile('Yayy!', './images/submitted_pto_request_2.png')
      //bot.reply(trigger.attachmentAction, 'Successfully Submitted your PTO request. PTO message will be posted at 9AM IST on all days of PTO including today.')
    } else {
      bot.sayWithLocalFile('Yayy!', './images/success_pto_req_3.png')
      //bot.reply(trigger.attachmentAction, 'Successfully Submitted your PTO request. PTO message will be posted on each day of your absence at 9AM IST.')
    }

  },
  async saveBackUpList(bot, trigger, em) {
    var initiative_name_1 = trigger.attachmentAction.inputs.initiative_name_1.trim()
    var initiative_name_2 = trigger.attachmentAction.inputs.initiative_name_2.trim()
    var initiative_name_3 = trigger.attachmentAction.inputs.initiative_name_3.trim()

    var backup_person_1 = trigger.attachmentAction.inputs.backup_person_1.trim()
    var backup_person_2 = trigger.attachmentAction.inputs.backup_person_2.trim()
    var backup_person_3 = trigger.attachmentAction.inputs.backup_person_3.trim()

    if ((initiative_name_1.length == 0 && backup_person_1.length > 0) || (initiative_name_1.length > 0 && backup_person_1.length == 0)) {
      bot.sayWithLocalFile('Try again!', './images/back_up_poc_incomplete.png')
      //bot.reply(trigger.attachmentAction, 'Backup POC details are incomplete.')
      return
    }

    if ((initiative_name_2.length == 0 && backup_person_2.length > 0) || (initiative_name_2.length > 0 && backup_person_2.length == 0)) {
      bot.sayWithLocalFile('Try again!', './images/back_up_poc_incomplete.png')
      //bot.reply(trigger.attachmentAction, 'Backup POC details incomplete.')
      return
    }

    if ((initiative_name_3.length == 0 && backup_person_3.length > 0) || (initiative_name_3.length > 0 && backup_person_3.length == 0)) {
      bot.sayWithLocalFile('Try again!', './images/back_up_poc_incomplete.png')
      //bot.reply(trigger.attachmentAction, 'Backup POC details incomplete.')
      return
    }


    await dbService.dbService.deleteData(em, 'BackupList')

    if (initiative_name_1.length > 0 && backup_person_1.length > 0) {
      await dbService.dbService.insertBackupList(
        em,
        initiative_name_1,
        backup_person_1
      )
    }
    if (initiative_name_2.length > 0 && backup_person_2.length > 0) {
      await dbService.dbService.insertBackupList(
        em,
        initiative_name_2,
        backup_person_2
      )
    }
    if (initiative_name_3.length > 0 && backup_person_3.length > 0) {
      await dbService.dbService.insertBackupList(
        em,
        initiative_name_3,
        backup_person_3
      )
    }
    bot.sayWithLocalFile('Yayy!', './images/poc_success.png')
    //bot.reply(trigger.attachmentAction, 'Successfully updated your Backup Point of Contact List.')
  },

  async savePTOList(bot, trigger, userInputs, em) {
    var roomIds = []
    for (var roomId in userInputs) {
      if (userInputs[roomId] == 'true') {
        roomIds.push(roomId)
      }
    }

    if (roomIds.length == 0) {
      await dbService.dbService.deleteData(em, 'FavPTOList')
      bot.sayWithLocalFile('Yayy!', './images/space_success.png')
      //bot.reply(trigger.attachmentAction, 'Successfully updated your Favourite Spaces List.')
      return
    }

    var roomIdsString = roomIds.join(',')
    await dbService.dbService.deleteData(em, 'FavPTOList')
    await dbService.dbService.insertPTOList(em, roomIdsString)
    bot.sayWithLocalFile('Yayy!', './images/space_success.png')
    //bot.reply(trigger.attachmentAction, 'Successfully updated your Favourite Spaces List.')

  },
  async populateBackupInfo(em, backUpListObject) {
    let backuplist = {}
    backuplist = await dbService.dbService.fetchBackupList(em)
    let i = 0

    if (backuplist != null) {
      for (const key in backuplist) {
        if (i < 3) {
          backUpListObject.push({
            "title": key,
            "value": backuplist[key]
          })
          i++
        }
      }
    }


  }


}

exports.webexService = webexService
