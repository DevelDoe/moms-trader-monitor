const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);

class Store extends EventEmitter {
    constructor() {
        super();
        this.sessionData = new Map();  // Temporary list, resets when triggered
        this.dailyData = new Map();    // Permanent list, keeps all tickers of the day
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
                ticker.count = 1;  // Start count at 1
                this.dailyData.set(key, { ...ticker });
                dailyNewEntries += 1;
            }

            // ✅ Update or add in `sessionData` (independent count)
            if (this.sessionData.has(key)) {
                let existingTicker = this.sessionData.get(key);
                existingTicker.count = (existingTicker.count || 1) + 1;  // Session count is separate
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
                ticker.count = 1;  // Reset count in session
                this.sessionData.set(key, { ...ticker });
                sessionNewEntries += 1;
            }
        });

        // ✅ Log both session and daily updates separately
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
        log.log("🧹 Session data cleared, count reset");
        this.emit("sessionCleared");
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
