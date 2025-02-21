const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const { fetchHistoricalNews } = require("./collectors/news");
const { fetchAlphaVantageData } = require("./collectors/alpha"); // ✅ Import Alpha function

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

    /**
     * ✅ Adds tickers to session and daily lists
     */
    addTickers(tickers) {
        log.log(`addTickers() called with ${tickers.length} items.`);
        let newTickers = []; // ✅ Track new tickers
        let updatedTickers = []; // ✅ Track updated tickers

        tickers.forEach((ticker) => {
            const key = ticker.Symbol;

            // ✅ Maintain daily data (persists all day)
            if (!this.dailyData.has(key)) {
                this.dailyData.set(key, { ...ticker, Count: 1, News: [] });
                newTickers.push(key);
            } else {
                let existingTicker = this.dailyData.get(key);
                existingTicker.Count++; // ✅ Increase the count in daily
                Object.keys(ticker).forEach((attr) => {
                    if (ticker[attr] !== undefined) {
                        existingTicker[attr] = ticker[attr];
                    }
                });
                this.dailyData.set(key, existingTicker);
                updatedTickers.push(key);
            }

            // ✅ Handle session data (resets when cleared)
            if (!this.sessionData.has(key)) {
                let sessionTicker = { Symbol: ticker.Symbol, Count: 1 };

                // ✅ Inherit `about` and `news` if available in dailyData
                if (this.dailyData.has(key)) {
                    let dailyTicker = this.dailyData.get(key);
                    sessionTicker.about = dailyTicker.about || {}; // ✅ Copy `about`
                    sessionTicker.News = [...(dailyTicker.News || [])]; // ✅ Copy `news`
                    log.log(`Attached about & news to ${key} in session list.`);
                }

                this.sessionData.set(key, sessionTicker);
                log.log(`✅ Added ${key} to sessionData.`);
            } else {
                let existingTicker = this.sessionData.get(key);
                existingTicker.Count++; // ✅ Increase session count
                Object.keys(ticker).forEach((attr) => {
                    if (ticker[attr] !== undefined) {
                        existingTicker[attr] = ticker[attr]; // ✅ Overwrite only if value exists
                    }
                });
                this.sessionData.set(key, existingTicker);
            }
        });

        // ✅ Fetch news & Alpha Vantage data for new tickers
        if (newTickers.length > 0) {
            log.log(`Fetching news & data for new tickers: ${newTickers.join(", ")}`);
            newTickers.forEach((ticker) => {
                fetchHistoricalNews(ticker);
                fetchAlphaVantageData(ticker);
            });
        }

        this.emit("update");
    }

    updateTicker(symbol, updates) {
        if (!this.dailyData.has(symbol)) {
            log.warn(`⚠️ Ticker ${symbol} not found in dailyData. Skipping update.`);
            return;
        }
    
        let ticker = this.dailyData.get(symbol);
    
        // ✅ Merge `about` data without overwriting other properties
        if (updates.about) {
            ticker.about = { ...ticker.about, ...updates.about };
            log.log(`📌 Updated ${symbol} with additional 'about' data.`);
        }
    
        this.dailyData.set(symbol, ticker);
    
        // ✅ If ticker is also in sessionData, update it there as well
        if (this.sessionData.has(symbol)) {
            let sessionTicker = this.sessionData.get(symbol);
            sessionTicker.about = { ...sessionTicker.about, ...updates.about };
            this.sessionData.set(symbol, sessionTicker);
            log.log(`📌 Also updated ${symbol} in sessionData.`);
        }
    
        this.emit("update");
    }
    

    /**
     * ✅ Clear sessionData only (does not affect dailyData)
     */
    clearSessionData() {
        this.sessionData.clear();
        log.log("✅ Session data cleared.");
        this.emit("sessionCleared");
    }

    /**
     * ✅ Fetches all tickers
     */
    getAllTickers(listType) {
        const data = listType === "session" ? this.sessionData : this.dailyData;
        return Array.from(data.values());
    }

    /**
     * ✅ Cleanup old news
     */
    cleanupOldNews() {
        const TWENTY_MINUTES = 20 * 60 * 1000;
        const now = Date.now();

        const beforeCleanup = this.newsList.length;
        this.newsList = this.newsList.filter((News) => now - News.storedAt <= TWENTY_MINUTES);
        const afterCleanup = this.newsList.length;

        log.log(`📰 Cleaned up old news. Before: ${beforeCleanup}, After: ${afterCleanup}`);
    }
}

// ✅ Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
