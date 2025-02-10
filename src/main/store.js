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
        let updated = false;
        let nrUpdates = 0;
        let newEntries = 0;

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
                updated = true;
                nrUpdates += 1;
            } else {
                ticker.count = 1;
                this.dailyData.set(key, ticker);
                newEntries += 1;
                updated = true;
            }


             if (this.sessionData.has(key)) {
                let existingTicker = this.sessionData.get(key);
                existingTicker.count = (existingTicker.count || 1) + 1;
                existingTicker.Price = ticker.Price;
                existingTicker.ChangePercent = ticker.ChangePercent;
                existingTicker.FiveM = ticker.FiveM;
                existingTicker.Float = ticker.Float;
                existingTicker.Volume = ticker.Volume;
                existingTicker.SprPercent = ticker.SprPercent;
                existingTicker.Time = ticker.Time;
                existingTicker.HighOfDay = ticker.HighOfDay;
                this.sessionData.set(key, existingTicker);
                updated = true;
                nrUpdates += 1;
            } else {
                ticker.count = 1;
                this.sessionData.set(key, ticker);
                newEntries += 1;
                updated = true;
            }

        });

        if (updated) {
            log.log(`[DAILY] ${nrUpdates} updated entries, ${newEntries} new entries`);
            this.emit("update");
        }
    }

    getAllTickers(listType) {
        return listType === "session"
            ? Array.from(this.sessionData.values())
            : Array.from(this.dailyData.values());
    }

    clearSessionData() {
        this.sessionData.clear();
        log.log("🧹 Session data cleared");
        this.emit("sessionCleared");
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
