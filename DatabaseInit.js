
const sqlitedb = require('better-sqlite3');
const logger = require('./logging')
const BotError = require('./BotException')
var DbConnection = function () {

    var db = null
    var instance = 0

    async function DbConnect() {
        try {
            let _db = new sqlitedb('./pto.db', { verbose: console.log })
            return _db
        } catch (e) {
            throw new BotError(`error while connecting to db  --> ` + e.stack,"DB")
        }
    }
    
    async function Get() {
        try {
            instance++
            if (db != null) {
                return db
            } else {
                logger.info(`getting new db connection`)
                db = await DbConnect();
                return db
            }
        } catch (e) {
            throw new BotError(`error while getting new db connection --> ` + e.stack,"DB")
        }
    }

    return {
        Get: Get
    }
}


module.exports = DbConnection()