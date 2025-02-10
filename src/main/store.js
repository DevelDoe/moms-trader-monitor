const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);

class Store extends EventEmitter {
    constructor() {
        super();
        this.sessionTickers = new Map();
        this.dailyTickers = new Map();
    }

    addTickers(tickers, listType) {
        let updated = false;
        let nrUpdates = 0;
        let newEntries = 0;

        const dataStore = listType === "session" ? this.sessionData : this.dailyData;

        tickers.forEach((ticker) => {
            const key = ticker.Symbol; // Unique key: Symbol only
            if (this.data.has(key)) {
                // Update the existing ticker
                let existingTicker = this.data.get(key);
                existingTicker.count = (existingTicker.count || 1) + 1;
                existingTicker.Price = ticker.Price;
                existingTicker.ChangePercent = ticker.ChangePercent;
                existingTicker.FiveM = ticker.FiveM;
                existingTicker.Float = ticker.Float;
                existingTicker.Volume = ticker.Volume;
                existingTicker.SprPercent = ticker.SprPercent;
                existingTicker.Time = ticker.Time;
                existingTicker.HighOfDay = ticker.HighOfDay;
                this.data.set(key, existingTicker);
                updated = true;
                nrUpdates += 1;
            } else {
                // Add a new ticker with an initial count of 1
                ticker.count = 1;
                this.data.set(key, ticker);
                updated = true;
                newEntries += 1;
            }
        });

        if (updated) {
            log.log(`${nrUpdates} updated entries`);
            log.log(`${newEntries} new unique entries`);
            this.emit("update");
        }
    }

    getAllTickers() {
        return Array.from(this.data.values());
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
