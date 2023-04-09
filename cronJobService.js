const CronJobManager = require('cron-job-manager')
var webexService = require('./WebexHelperService')
const logger = require('./logging')
const manager = new CronJobManager()

const timerPattern = "* * * * 1-5";
const cronJobId = "cronJobId";

const functionToExecute = async function () {
  try {
    logger.info('Calling postCulturesInSpaces method by cronjob');
    webexService.webexService.postCulturesInSpaces();
  } catch (e) {
    logger.error("error in cronjob -->>" + e.stack);
  }

}

manager.add(cronJobId, timerPattern, () => {
  logger.info("CronJob Executed.")
  functionToExecute();
},
  {
    timezone: "Asia/Kolkata"
  }
);

const startJob = function () {
  manager.start(cronJobId)
  logger.info('cronjob started');
}

module.exports = {
  startJob
}