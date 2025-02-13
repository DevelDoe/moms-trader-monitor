const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);

class Store extends EventEmitter {
    constructor() {
        super();
        this.sessionData = new Map(); // Resets on clear
        this.dailyData = new Map(); // Stores all tickers for the full day
        this.newsList = []; // ✅ Store all news in a single list

        setInterval(() => {
            this.cleanupOldNews();
        }, 60 * 1000); // Runs every 60 seconds
    }

    addTickers(tickers) {
        tickers.forEach((ticker) => {
            const key = ticker.Symbol;

            // ✅ Ensure `hasNews` always exists (default: false)
            if (!this.dailyData.has(key)) {
                this.dailyData.set(key, { ...ticker, count: 1, hasNews: false });
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

            if (!this.sessionData.has(key)) {
                this.sessionData.set(key, { ...ticker, count: 1, hasNews: false });
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
        });

        this.emit("update");
    }

    
    addNews(newsItems) {
        if (!newsItems) {
            log.warn("[store.js] ❌ No news items provided.");
            return;
        }
    
        // ✅ Ensure `newsItems` is always an array
        if (!Array.isArray(newsItems)) {
            log.warn("[store.js] ⚠️ newsItems is not an array. Wrapping it.");
            newsItems = [newsItems]; // 🔥 Wrap in array
        }
    
        if (newsItems.length === 0) {
            log.warn("[store.js] ❌ No valid news items to store.");
            return;
        }
    
        const timestampedNews = newsItems.map((news) => ({
            ...news,
            storedAt: Date.now(),
            symbols: Array.isArray(news.symbols) ? news.symbols : [], // ✅ Ensure symbols is always an array
        }));
    
        this.newsList.push(...timestampedNews);
        log.log(`[store.js] 📥 Stored ${newsItems.length} new articles.`);
    
        // ✅ Update `hasNews` for tickers that have relevant news
        timestampedNews.forEach((news) => {
            news.symbols.forEach((symbol) => {
                if (this.dailyData.has(symbol)) {
                    this.dailyData.get(symbol).hasNews = true;
                }
                if (this.sessionData.has(symbol)) {
                    this.sessionData.get(symbol).hasNews = true;
                }
            });
        });
    
        this.emit("newsUpdated", { newsItems: timestampedNews });
    }
    

    // ✅ Retrieve all stored news
    getAllNews() {
        return this.newsList;
    }

    getAllTickers(listType) {
        const data = listType === "session" ? this.sessionData : this.dailyData;
        return Array.from(data.values());
    }

    getAvailableAttributes(listType) {
        const tickers = this.getAllTickers(listType);
        if (tickers.length === 0) return [];

        return Object.keys(tickers[0]).filter((attr) => attr !== "Symbol");
    }

    clearSessionData() {
        this.sessionData.clear();
        log.log("Session data cleared");
        this.emit("sessionCleared");
    }

    cleanupOldNews() {
        const TWENTY_MINUTES = 20 * 60 * 1000;
        const now = Date.now();

        const beforeCleanup = this.newsList.length;
        this.newsList = this.newsList.filter((news) => now - news.storedAt <= TWENTY_MINUTES);
        const afterCleanup = this.newsList.length;

        log.log(`Cleaned up old news. Before: ${beforeCleanup}, After: ${afterCleanup}`);
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
