const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);

class Store extends EventEmitter {
    constructor() {
        super();
        this.sessionData = new Map(); // Resets on clear
        this.dailyData = new Map();   // Stores all tickers for the full day
    }

    addTickers(tickers) {
        tickers.forEach((ticker) => {
            const key = ticker.Symbol;

            // ✅ Handle Daily Data
            if (!this.dailyData.has(key)) {
                ticker.count = 1;
                this.dailyData.set(key, { ...ticker });
            } else {
                let existingTicker = this.dailyData.get(key);
                existingTicker.count++; // ✅ Increment count

                Object.keys(ticker).forEach((attr) => {
                    if (ticker[attr] !== undefined) {
                        existingTicker[attr] = ticker[attr]; // ✅ Merge only defined values
                    }
                });

                this.dailyData.set(key, existingTicker);
            }

            // ✅ Handle Session Data
            if (!this.sessionData.has(key)) {
                ticker.count = 1;
                this.sessionData.set(key, { ...ticker });
            } else {
                let existingTicker = this.sessionData.get(key);
                existingTicker.count++; // ✅ Increment count

                Object.keys(ticker).forEach((attr) => {
                    if (ticker[attr] !== undefined) {
                        existingTicker[attr] = ticker[attr]; // ✅ Merge only defined values
                    }
                });

                this.sessionData.set(key, existingTicker);
            }
        });

        this.emit("update");
    }

    getAllTickers(listType) {
        return listType === "session"
            ? Array.from(this.sessionData.values())
            : Array.from(this.dailyData.values());
    }

    getAvailableAttributes(listType) {
        const tickers = this.getAllTickers(listType);
        if (tickers.length === 0) return [];

        return Object.keys(tickers[0]).filter(
            (attr) => attr !== "Symbol" && attr !== "count"
        );
    }

    clearSessionData() {
        this.sessionData.clear();
        log.log("Session data cleared");
        this.emit("sessionCleared");
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;

