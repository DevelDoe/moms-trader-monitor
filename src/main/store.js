const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const { fetchHistoricalNews } = require("./collectors/news");
const { fetchAlphaVantageData } = require("./collectors/alpha"); // ✅ Import Alpha Vantage collector

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

    async addTickers(tickers) {
        log.log(`addTickers() called with ${tickers.length} items.`);
        let newTickers = []; // ✅ Track new tickers for dailyData
        let newSessionTickers = []; // ✅ Track new tickers for sessionData
    
        for (const ticker of tickers) {
            const key = ticker.Symbol;
    
            // ✅ Handle dailyData independently
            if (!this.dailyData.has(key)) {
                this.dailyData.set(key, { ...ticker, Count: 1, News: [] });
                newTickers.push(key);
            } else {
                let existingTicker = this.dailyData.get(key);
                existingTicker.Count++;
                
                Object.keys(ticker).forEach((attr) => {
                    if (ticker[attr] !== undefined) {
                        existingTicker[attr] = ticker[attr];
                    }
                });

                this.dailyData.set(key, existingTicker);
            }

            // ✅ Handle sessionData independently, but copy `News` & `about` if available in `dailyData`
            if (!this.sessionData.has(key)) {
                let sessionTicker = { ...ticker, Count: 1 };

                if (this.dailyData.has(key)) {
                    let dailyTicker = this.dailyData.get(key);
                    
                    if (dailyTicker.News) sessionTicker.News = [...dailyTicker.News]; // ✅ Copy `News`
                    if (dailyTicker.about) sessionTicker.about = dailyTicker.about; // ✅ Copy `about`
                }

                this.sessionData.set(key, sessionTicker);
                newSessionTickers.push(key);
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
        }
    
        // ✅ Fetch news for new session tickers only
        if (newSessionTickers.length > 0) {
            log.log(`🚀 Fetching news for new session tickers: ${newSessionTickers.join(", ")}`);
            newSessionTickers.forEach((ticker) => {
                fetchHistoricalNews(ticker);
            });
        }

        // ✅ Fetch Alpha Vantage data for newly added tickers
        if (newTickers.length > 0) {
            log.log(`📊 Fetching Alpha Vantage data for new tickers: ${newTickers.join(", ")}`);
            for (const ticker of newTickers) {
                fetchAlphaVantageData(ticker).then((aboutData) => {
                    if (aboutData) {
                        log.log(`✅ Storing 'about' data for ${ticker}`);
                        
                        // ✅ Update dailyData with `about` details
                        if (this.dailyData.has(ticker)) {
                            let updatedTicker = this.dailyData.get(ticker);
                            updatedTicker.about = aboutData;
                            this.dailyData.set(ticker, updatedTicker);
                        }

                        // ✅ Ensure sessionData also gets `about` details if it exists
                        if (this.sessionData.has(ticker)) {
                            let updatedTicker = this.sessionData.get(ticker);
                            updatedTicker.about = aboutData;
                            this.sessionData.set(ticker, updatedTicker);
                        }

                        this.emit("update");
                    }
                });
            }
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

        // ✅ Attach news to tickers in BOTH dailyData and sessionData
        timestampedNews.forEach((News) => {
            News.symbols.forEach((symbol) => {
                if (this.dailyData.has(symbol)) {
                    let ticker = this.dailyData.get(symbol);

                    const existingHeadlines = new Set(ticker.News.map((n) => n.headline));
                    if (!existingHeadlines.has(News.headline)) {
                        ticker.News.push(News);
                        log.log(`Added news to ${symbol} (Total: ${ticker.News.length})`);
                    }

                    this.dailyData.set(symbol, ticker);
                }

                if (this.sessionData.has(symbol)) {
                    let ticker = this.sessionData.get(symbol);

                    const existingHeadlines = new Set(ticker.News.map((n) => n.headline));
                    if (!existingHeadlines.has(News.headline)) {
                        ticker.News.push(News);
                        log.log(`Added news to ${symbol} (Total: ${ticker.News.length})`);
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
        log.log("🧹 Clearing session data in store.js...");
        this.sessionData.clear();
        log.log("✅ Session data cleared successfully!");
    
        // ✅ Print sessionData to confirm it's empty
        log.log("🔍 Current sessionData after clear:", Array.from(this.sessionData.entries()));
    
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
