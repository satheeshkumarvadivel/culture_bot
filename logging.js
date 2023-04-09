const { format, createLogger, transports } = require('winston');
const { timestamp, combine, printf, json } = format;


const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

const logger = createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json(),
    logFormat
  ),
  transports: [new transports.File({ filename: 'logs/error.log', levelOnly: true, level: 'error', maxsize: 5000000 }),
  new transports.File({ filename: 'logs/info.log', maxsize: 5000000 })],
});


module.exports = logger