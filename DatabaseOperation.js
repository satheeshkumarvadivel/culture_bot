var DbConnection = require('./DatabaseInit')
const logger = require('./logging')
const BotError = require('./BotException')
const dbService = {

    async create() {
        try {
            let db = await DbConnection.Get();
            const createSchedulesQuery = "CREATE TABLE IF NOT EXISTS schedules([id] INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, [spaceid] NVARCHAR(120), [trait_type] NVARCHAR(20),[frequency] NVARCHAR(20), [time] NVARCHAR(10), [timezone] NVARCHAR(50), [last_posted_good_trait_id] INTEGER, [last_posted_bad_trait_id] INTEGER, [last_posted_trait_type] NVARCHAR(20))";
            const createTraitsQuery = "CREATE TABLE IF NOT EXISTS traits([id] INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,[trait] NVARCHAR(250),[trait_type] NVARCHAR(20))";
            logger.info("createSchedulesQuery: " + createSchedulesQuery);
            db.exec(createSchedulesQuery);
            logger.info("createTraitsQuery: " + createTraitsQuery);            
            db.exec(createTraitsQuery);
            logger.info("Tables created successfully.");
        } catch (e) {
            logger.info(e);
            throw new BotError("Error while creating table " + e.stack,"DB");
        }
    },

    async createSchedule(schedule) {
        try {
            logger.info("Creating culture bot configuration schedule.");
            let db = await DbConnection.Get();
            let insertScheduleQuery = db.prepare("INSERT INTO schedules (spaceid, trait_type, frequency, time, timezone, last_posted_good_trait_id, last_posted_bad_trait_id, last_posted_trait_type) VALUES(?, ?, ?, ?, ?, ?, ?, ?)");
            let last_posted_trait_type = schedule.trait_type;
            if (schedule.trait_type == 'all_traits') {
                last_posted_trait_type = 'BAD';
            }
            insertScheduleQuery.run(schedule.spaceId, schedule.trait_type, schedule.frequency, schedule.time, schedule.timezone, 0, 0, last_posted_trait_type);
            logger.info("Inserted schedule details into the database.");
            let sql = "SELECT * FROM schedules";
            var stmt = db.prepare(sql);
            for (var row of stmt.iterate()) {
                logger.info(JSON.stringify(row));
            }
        } catch (e) {
            logger.info(e);
            throw new BotError("Error while inserting schedules " + e.stack,"DB");
        }
    },

    async updateSchedule(schedule, id) {
        try {
            logger.info("Updating culture bot configuration schedule.");
            let db = await DbConnection.Get();
            let insertScheduleQuery = db.prepare("UPDATE schedules SET trait_type = ?, frequency = ?, time = ?, timezone = ?, last_posted_good_trait_id = ?, last_posted_bad_trait_id = ?, last_posted_trait_type = ? WHERE id = ?");
            insertScheduleQuery.run(schedule.trait_type, schedule.frequency, schedule.time, schedule.timezone, schedule.last_posted_good_trait_id, schedule.last_posted_bad_trait_id, schedule.last_posted_trait_type, id);
            logger.info("Updated schedules details into the database.");
            let sql = "SELECT * FROM schedules";
            var stmt = db.prepare(sql);
            for (var row of stmt.iterate()) {
                logger.info(JSON.stringify(row));
            }
        } catch (e) {
            throw new BotError("Error while updating schedules " + e.stack,"DB");
        }
    },

    async getScheduleBySpaceId(spaceId) {
        try {
            logger.info("Fetching culture bot configuration schedule for the spaceId : " + spaceId);
            let db = await DbConnection.Get();            
            let sql = "SELECT * FROM schedules where spaceid = '" + spaceId + "'";
            var stmt = db.prepare(sql);
            for (var row of stmt.iterate()) {
                logger.info(JSON.stringify(row));
                return row;
            }
        } catch (e) {
            throw new BotError("Error while fetching schedules " + e.stack, "DB");
        }
    },

    async getAllSchedules() {
        try {
            logger.info("Fetching all schedules");
            let db = await DbConnection.Get();            
            let sql = "SELECT * FROM schedules";
            var stmt = db.prepare(sql);
            let schedules = [];
            for (var row of stmt.iterate()) {
                logger.info(JSON.stringify(row));
                schedules.push(row);
            }
            return schedules;
        } catch (e) {
            logger.info(e);
            throw new BotError("Error while fetching schedules " + e.stack, "DB");
        }
    },

    async populateTraits(traits) {
        try {
            logger.info("Populating traits json into database.");
            let db = await DbConnection.Get();
            traits.forEach(trait => {
                let insertTraitQuery = db.prepare("INSERT INTO traits (trait, trait_type) VALUES(?,?)");
                insertTraitQuery.run(trait.trait, trait.trait_type);
            });
            logger.info("Inserted traits into the database.");

            let sql = "SELECT * FROM traits";
            var stmt = db.prepare(sql);
            for (var row of stmt.iterate()) {
                logger.info(row.trait_type + ":" + row.trait);
            }
        } catch (e) {
            logger.info(e);
            throw new BotError("Error while inserting " + e.stack,"DB")
        }
    },

    async getNextTraitByIdAndTraitType(id, trait_type) {
        try {
            logger.info("getNextTraitByIdAndTraitType()");
            let db = await DbConnection.Get();
            var sql = "SELECT * FROM traits where id > '" + id + "' AND trait_type = '" + trait_type + "' LIMIT 1";
            console.log("sql : " + sql);
            var stmt = db.prepare(sql);
            for (var row of stmt.iterate()) {
                logger.info(JSON.stringify(row));
                return row;
            }
        } catch (e) {
            logger.info(e);
            throw new BotError("Error while fetching schedules " + e.stack, "DB");
        }
    },

    async getTraitById(id) {
        try {
            logger.info("Fetching trait by id : " + id);
            let db = await DbConnection.Get();
            var sql = "SELECT * FROM traits where id = '" + id + "'";                        
            var stmt = db.prepare(sql);
            for (var row of stmt.iterate()) {
                logger.info(JSON.stringify(row));
                return row;
            }
        } catch (e) {
            logger.info(e);
            throw new BotError("Error while fetching schedules " + e.stack, "DB");
        }
    }

}
exports.dbService = dbService
