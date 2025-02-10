const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);

class Store extends EventEmitter {
    constructor() {
        super();
        this.sessionData = new Map();  // Resets on clear
        this.dailyData = new Map();    // Stores all tickers for the full day
    }

    addTickers(tickers) {
        let dailyUpdated = 0;
        let dailyNewEntries = 0;
        let sessionUpdated = 0;
        let sessionNewEntries = 0;

        tickers.forEach((ticker) => {
            const key = ticker.Symbol;

            // ✅ Update or add in `dailyData`
            if (this.dailyData.has(key)) {
                let existingTicker = this.dailyData.get(key);
                existingTicker.count = (existingTicker.count || 1) + 1;
                existingTicker.Price = ticker.Price;
                existingTicker.ChangePercent = ticker.ChangePercent;
                existingTicker.FiveM = ticker.FiveM;
                existingTicker.Float = ticker.Float;
                existingTicker.Volume = ticker.Volume;
                existingTicker.SprPercent = ticker.SprPercent;
                existingTicker.Time = ticker.Time;
                existingTicker.HighOfDay = ticker.HighOfDay;
                this.dailyData.set(key, existingTicker);
                dailyUpdated += 1;
            } else {
                ticker.count = 1;  // ✅ Daily count starts at 1 if new
                this.dailyData.set(key, { ...ticker });
                dailyNewEntries += 1;
            }

            // ✅ Restart `sessionData` count at `1` after reset
            if (this.sessionData.has(key)) {
                let existingTicker = this.sessionData.get(key);
                existingTicker.count += 1;  // ✅ Keep session count increasing until reset
                existingTicker.Price = ticker.Price;
                existingTicker.ChangePercent = ticker.ChangePercent;
                existingTicker.FiveM = ticker.FiveM;
                existingTicker.Float = ticker.Float;
                existingTicker.Volume = ticker.Volume;
                existingTicker.SprPercent = ticker.SprPercent;
                existingTicker.Time = ticker.Time;
                existingTicker.HighOfDay = ticker.HighOfDay;
                this.sessionData.set(key, existingTicker);
                sessionUpdated += 1;
            } else {
                ticker.count = 1;  // ✅ Restart count at 1 if session was cleared
                this.sessionData.set(key, { ...ticker });
                sessionNewEntries += 1;
            }
        });

        // ✅ Log changes
        if (dailyUpdated || dailyNewEntries) {
            log.log(`[DAILY] ${dailyUpdated} updated, ${dailyNewEntries} new`);
        }
        if (sessionUpdated || sessionNewEntries) {
            log.log(`[SESSION] ${sessionUpdated} updated, ${sessionNewEntries} new`);
        }

        this.emit("update");
    }

    getAllTickers(listType) {
        return listType === "session"
            ? Array.from(this.sessionData.values())
            : Array.from(this.dailyData.values());
    }

    clearSessionData() {
        this.sessionData.clear();
        log.log("🧹 Session data cleared, count will restart at 1.");
        this.emit("sessionCleared");
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
