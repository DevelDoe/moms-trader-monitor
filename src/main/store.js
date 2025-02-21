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

    addTickers(tickers) {
        log.log(`addTickers() called with ${tickers.length} items.`);
        let newTickers = []; // ✅ Track new tickers
        let updatedTickers = []; // ✅ Track updated tickers
    
        tickers.forEach((ticker) => {
            const key = ticker.Symbol;
    
            if (!this.dailyData.has(key)) {
                // ✅ New ticker
                this.dailyData.set(key, { ...ticker, Count: 1, News: [] });
                newTickers.push(key); // Add to new tickers list
            } else {
                // ✅ Updated ticker
                let existingTicker = this.dailyData.get(key);
                existingTicker.Count++;
    
                // Check if any significant attribute has changed
                const hasUpdates = Object.keys(ticker).some((attr) => {
                    return ticker[attr] !== undefined && ticker[attr] !== existingTicker[attr];
                });
    
                if (hasUpdates) {
                    updatedTickers.push(key); // Add to updated tickers list
                }
    
                // Update the existing ticker data
                Object.keys(ticker).forEach((attr) => {
                    if (ticker[attr] !== undefined) {
                        existingTicker[attr] = ticker[attr];
                    }
                });
    
                this.dailyData.set(key, existingTicker);
            }
    
            // ✅ Handle session data
            if (!this.sessionData.has(key)) {
                this.sessionData.set(key, { ...ticker, Count: 1, News: [] });
            } else {
                let existingTicker = this.sessionData.get(key);
                existingTicker.Count++;
    
                Object.keys(ticker).forEach((attr) => {
                    if (ticker[attr] !== undefined) {
                        existingTicker[attr] = ticker[attr];
                    }
                });
    
                this.sessionData.set(key, existingTicker);
            }
        });
    
        // ✅ Fetch news for new tickers
        if (newTickers.length > 0) {
            log.log(`Fetching news for new tickers: ${newTickers.join(", ")}`);
            newTickers.forEach((ticker) => {
                fetchHistoricalNews(ticker);
            });
        }

        // Fetch general data from alpha for new tickers
        if (newTickers.length > 0) {
            log.log(`Fetching general data from ALpha for new tickers: ${newTickers.join(", ")}`);
        
            for (const ticker of newTickers) {
                fetchAlphaVantageData(ticker).then((data) => {
                    log.log(`Alpha Vantage Data for ${ticker}:`, data);
                }); // ✅ Fetch and log response
            }
        }
    
        // ✅ Fetch news for updated tickers
        if (updatedTickers.length > 0) {
            log.log(`Fetching news for updated tickers: ${updatedTickers.join(", ")}`);
            updatedTickers.forEach((ticker) => {
                fetchHistoricalNews(ticker);
            });
        }
    
        this.emit("update");
    }

    addNews(newsItems) {
        if (!newsItems) {
            log.warn("No news items provided.");
            return;
        }

        // ✅ Ensure `newsItems` is always an array
        const normalizedNews = Array.isArray(newsItems) ? newsItems : [newsItems];

        if (normalizedNews.length === 0) {
            log.warn("No valid news items to store.");
            return;
        }

        const timestampedNews = normalizedNews.map((News) => ({
            ...News,
            storedAt: Date.now(),
            symbols: Array.isArray(News.symbols) ? News.symbols : [], // ✅ Ensure symbols is always an array
        }));

        this.newsList.push(...timestampedNews);
        log.log(`Stored ${timestampedNews.length} new articles in global list.`);

        // ✅ Update tickers with unique news items
        timestampedNews.forEach((News) => {
            News.symbols.forEach((symbol) => {
                if (this.dailyData.has(symbol)) {
                    let ticker = this.dailyData.get(symbol);

                    // ✅ Prevent duplicate headlines
                    const existingHeadlines = new Set(ticker.News.map((n) => n.headline));
                    if (!existingHeadlines.has(News.headline)) {
                        ticker.News.push(News);
                        log.log(`Added news to ${symbol} (Total: ${ticker.News.length})`);
                    } else {
                        log.log(`Skipped duplicate news for ${symbol}"`);
                    }

                    this.dailyData.set(symbol, ticker);
                }

                if (this.sessionData.has(symbol)) {
                    let ticker = this.sessionData.get(symbol);

                    const existingHeadlines = new Set(ticker.News.map((n) => n.headline));
                    if (!existingHeadlines.has(News.headline)) {
                        ticker.News.push(News);
                        log.log(`Added news to ${symbol} (Total: ${ticker.News.length})`);
                    } else {
                        log.log(`Skipped duplicate news for ${symbol}"`);
                    }

                    this.sessionData.set(symbol, ticker);
                }
            });
        });

        this.emit("newsUpdated", { newsItems: timestampedNews });
    }

    getAllNews() {
        return this.newsList;
    }

    getAllTickers(listType) {
        const data = listType === "session" ? this.sessionData : this.dailyData;
        return Array.from(data.values());
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
        this.newsList = this.newsList.filter((News) => now - News.storedAt <= TWENTY_MINUTES);
        const afterCleanup = this.newsList.length;

        log.log(`Cleaned up old news from global list. Before: ${beforeCleanup}, After: ${afterCleanup}`);
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
