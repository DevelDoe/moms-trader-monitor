const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);

class Store extends EventEmitter {
    constructor() {
        super();
        this.sessionData = new Map(); // Resets on clear
        this.dailyData = new Map(); // Stores all tickers for the full day
        this.newsList = []; // ✅ Store all news 

        setInterval(() => {
            this.cleanupOldNews();
        }, 60 * 1000); // Runs every 60 seconds
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

    addNews(newsItems) {
        if (!Array.isArray(newsItems) || newsItems.length === 0) {
            log.warn("❌ No valid news items to store.");
            return;
        }

        const timestampedNews = newsItems.map((news) => ({
            ...news,
            storedAt: Date.now(), // ✅ Store timestamp
        }));

        this.newsList.push(...timestampedNews);

        log.log(`📥 Stored ${newsItems.length} new articles.`);

        // ✅ Emit a single batch update instead of per ticker
        this.emit("newsUpdated", { newsItems: timestampedNews });
    }

    getAllNews() {
        return Array.from(this.newsData.entries())
            .filter(([_, news]) => news.length > 0)
            .map(([ticker, news]) => ({ ticker, news }));
    }

    getAllTickers(listType) {
        const data = listType === "session" ? this.sessionData : this.dailyData;

        return Array.from(data.values()).map((ticker) => {
            ticker.hasNews = this.getTickerNews(ticker.Symbol).length > 0; // ✅ Boolean flag added to ticker object
            return ticker;
        });
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

    cleanupOldNews() {
        const TWENTY_MINUTES = 20 * 60 * 1000;
        const now = Date.now();

        this.newsData.forEach((newsArray, ticker) => {
            const filteredNews = newsArray.filter((news) => now - news.storedAt <= TWENTY_MINUTES);

            if (filteredNews.length > 0) {
                this.newsData.set(ticker, filteredNews);
            } else {
                this.newsData.delete(ticker); // Remove empty tickers
            }
        });

        log.log("Old news cleaned up");
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
