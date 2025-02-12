const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);

class Store extends EventEmitter {
    constructor() {
        super();
        this.sessionData = new Map(); // Resets on clear
        this.dailyData = new Map(); // Stores all tickers for the full day
        this.newsData = new Map(); // ✅ New: Stores news per ticker
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
                existingTicker.count++;

                Object.keys(ticker).forEach((attr) => {
                    if (ticker[attr] !== undefined) {
                        existingTicker[attr] = ticker[attr];
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
                existingTicker.count++;

                Object.keys(ticker).forEach((attr) => {
                    if (ticker[attr] !== undefined) {
                        existingTicker[attr] = ticker[attr];
                    }
                });

                this.sessionData.set(key, existingTicker);
            }

            // ✅ Initialize news storage for the ticker if not present
            if (!this.newsData.has(key)) {
                this.newsData.set(key, []);
            }
        });

        this.emit("update");
    }

    // ✅ Update news for a specific ticker
    updateNews(ticker, newsItems) {
        if (!this.newsData.has(ticker)) {
            this.newsData.set(ticker, []);
        }

        const existingNews = this.newsData.get(ticker);
        this.newsData.set(ticker, [...existingNews, ...newsItems]);

        this.emit("newsUpdated", { ticker, newsItems });
    }

    // ✅ Retrieve news for a specific ticker
    getNews(ticker) {
        return this.newsData.get(ticker) || [];
    }

    // ✅ Retrieve all tickers along with their news (optional)
    getAllTickers(listType) {
        return listType === "session"
            ? Array.from(this.sessionData.values())
            : Array.from(this.dailyData.values()).map((ticker) => ({
                  ...ticker,
                  news: this.getNews(ticker.Symbol), // Include news
              }));
    }

    getAvailableAttributes(listType) {
        const tickers = this.getAllTickers(listType);
        if (tickers.length === 0) return [];

        return Object.keys(tickers[0]).filter((attr) => attr !== "Symbol" && attr !== "count");
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
