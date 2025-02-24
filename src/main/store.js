const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const { fetchHistoricalNews } = require("./collectors/news");
const { queueRequest, searchCache } = require("./collectors/alpha");
const { connectMTP, getSymbolMeta } = require("./collectors/mtp");

class Store extends EventEmitter {
    constructor() {
        super();
        log.log("Store instance initialized");

        this.sessionData = new Map(); // Resets on clear
        this.dailyData = new Map(); // Stores all tickers for the full day
        this.newsList = []; // Store all news in a single list

        setInterval(() => {
            this.cleanupOldNews();
        }, 60 * 1000); // Runs every 60 seconds
    }

    async addTickers(tickers) {
        log.bounce("INFO", `[addTickers] called with ${tickers.length} items.`);
        let newTickers = [];
        let newSessionTickers = [];

        for (const ticker of tickers) {
            const key = ticker.Symbol;
            log.log(`[addTickers] Processing ticker: ${key}`);

            // Handle dailyData
            if (!this.dailyData.has(key)) {
                log.log(`[addTickers] Adding new ticker to dailyData: ${key}`);
                this.dailyData.set(key, { ...ticker, Count: 1, News: [] });
                newTickers.push(key);

                // Fetch historical news for new tickers
                log.log(`[addTickers] Fetching historical news for ${key}...`);
                fetchHistoricalNews(key)
                    .then((news) => {
                        if (news && news.length > 0) {
                            log.log(`[addTickers][fetchHistoricalNews]  Successfully fetched ${news.length} historical news items for ${key}.`);
                            this.addNews(news);
                        } else {
                            log.log(`[addTickers][fetchHistoricalNews]  No historical news found for ${key}.`);
                        }
                    })
                    .catch((error) => {
                        log.log(`[addTickers][fetchHistoricalNews] Failed to fetch historical news for ${key}: ${error.message}`);
                    });
            } else {
                let existingTicker = this.dailyData.get(key);
                existingTicker.Count++;

                Object.keys(ticker).forEach((attr) => {
                    if (ticker[attr] !== undefined) {
                        existingTicker[attr] = ticker[attr];
                    }
                });

                this.dailyData.set(key, existingTicker);
                log.log(`[addTickers]  Updated ticker in dailyData: ${key} (Count: ${existingTicker.Count})`);
            }

            // Handle sessionData
            if (!this.sessionData.has(key)) {
                log.log(`[addTickers] Adding new ticker to sessionData: ${key}`);
                let sessionTicker = { ...ticker, Count: 1 };

                if (this.dailyData.has(key)) {
                    let dailyTicker = this.dailyData.get(key);
                    if (dailyTicker.News) sessionTicker.News = [...dailyTicker.News];
                    if (dailyTicker.meta) sessionTicker.meta = dailyTicker.meta; // ✅ Copy meta
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
                log.log(`[addTickers] Updated ticker in sessionData: ${key} (Count: ${existingTicker.Count})`);
            }
        }

        if (newTickers.length > 0) {
            log.log(`[addTickers] Queuing data requests: ${newTickers.join(", ")}`);
            newTickers.forEach((ticker) => {
                searchCache(ticker);
                queueRequest(ticker);
                getSymbolMeta(ticker)
                    .then((data) => {
                        if (data) {
                            log.log(`[addTickers][mtp] meta data for Symbol ${data.symbol} fetched!`);
                        } else {
                            log.warn("[addTickers][mtp] No data found for the symbol.");
                        }
                    })
                    .catch((err) => {
                        log.error("[addTickers][mtp] Error:", err);
                    });
            });
        }

        log.log(`[addTickers] completed. Total tickers in sessionData: ${this.sessionData.size}, in dailyData: ${this.dailyData.size}`);
        this.emit("update");
    }

    addNews(newsItems) {
        log.log(`[addNews] called`);
        if (!newsItems) {
            log.warn("[addNews] No news items provided.");
            return;
        }

        const normalizedNews = Array.isArray(newsItems) ? newsItems : [newsItems];

        if (normalizedNews.length === 0) {
            log.warn("[addNews] No valid news items to store.");
            return;
        }

        const timestampedNews = normalizedNews.map((News) => ({
            ...News,
            storedAt: Date.now(),
            symbols: Array.isArray(News.symbols) ? News.symbols : [],
        }));

        this.newsList.push(...timestampedNews);
        log.log(`[addNews] Stored ${timestampedNews.length} new articles in global list.`);

        log.log(`[addNews] processing timestampedNews articles:`);
        timestampedNews.forEach((News) => {
            News.symbols.forEach((symbol) => {
                log.log(`[addNews][timestampedNews.forEach] Processing news for ticker: ${symbol}`);

                if (this.dailyData.has(symbol)) {
                    let ticker = this.dailyData.get(symbol);
                    ticker.News = ticker.News || [];

                    // ✅ **Avoid duplicate news by checking headlines**
                    const existingHeadlines = new Set(ticker.News.map((n) => n.headline));
                    if (!existingHeadlines.has(News.headline)) {
                        ticker.News.push(News);
                        log.log(`[addNews][timestampedNews.forEach] Added news to ${symbol} in dailyData (Total: ${ticker.News.length})`);
                        this.dailyData.set(symbol, ticker); // ✅ Ensure data is stored
                    } else {
                        log.log(`[addNews][timestampedNews.forEach] Skipping duplicate news for ${symbol}: ${News.headline}`);
                    }
                }

                if (this.sessionData.has(symbol)) {
                    let ticker = this.sessionData.get(symbol);
                    ticker.News = ticker.News || [];

                    // ✅ **Check for duplicates before adding**
                    const existingHeadlines = new Set(ticker.News.map((n) => n.headline));
                    if (!existingHeadlines.has(News.headline)) {
                        ticker.News.push(News);
                        log.log(`[addNews][timestampedNews.forEach] Added news to ${symbol} in sessionData (Total: ${ticker.News.length})`);
                        this.sessionData.set(symbol, ticker); // ✅ Ensure data is stored
                    } else {
                        log.log(`[addNews][timestampedNews.forEach] Skipping duplicate news for ${symbol}: ${News.headline}`);
                    }
                }
            });
        });

        this.emit("newsUpdated", { newsItems: timestampedNews });
    }

    updateMeta(symbol, updateData) {
        log.log(`[updateMeta] called for ${symbol} with updateData:`);

        if (!this.dailyData.has(symbol)) {
            log.warn(`[updateMeta] Attempted to update non-existing ticker: ${symbol}`);
            return;
        }

        let dailyTicker = this.dailyData.get(symbol);

        // Function to capitalize only the first letter of a key
        const capitalizeFirstLetter = (str) => str.charAt(0).toUpperCase() + str.slice(1);

        // Function to capitalize keys in an object
        const capitalizeKeys = (obj) => {
            return Object.fromEntries(Object.entries(obj).map(([key, value]) => [capitalizeFirstLetter(key), value]));
        };

        // Extract meta and other keys
        let { meta = {}, ...rest } = updateData;

        // Capitalize keys before merging
        let capitalizedMeta = capitalizeKeys(meta);
        let capitalizedRest = capitalizeKeys(rest);

        // Merge into `meta` properly
        dailyTicker.meta = {
            ...(dailyTicker.meta || {}),
            ...capitalizedMeta,
            ...capitalizedRest,
        };

        // Ensure the symbol is properly stored at the root level
        dailyTicker.Symbol = symbol;

        this.dailyData.set(symbol, dailyTicker);

        if (this.sessionData.has(symbol)) {
            let sessionTicker = this.sessionData.get(symbol);
            sessionTicker.meta = {
                ...(sessionTicker.meta || {}),
                ...capitalizedMeta,
                ...capitalizedRest,
            };
            this.sessionData.set(symbol, sessionTicker);
        }

        log.log(`[updateMeta] Updated ticker ${symbol} with new data`);
        log.bounce("DATA", "[updateMeta] final object", JSON.stringify(dailyTicker));
        this.emit("update");
    }

    getAllNews() {
        log.log("[getAllNews] called");
        return this.newsList;
    }

    getAllTickers(listType) {
        log.bounce("INFO", `[getAllTickers] called (List type: ${listType})`);
        const data = listType === "session" ? this.sessionData : this.dailyData;
        return Array.from(data.values());
    }

    clearSessionData() {
        log.log("[clearSessionData] called");
        this.sessionData.clear();
        log.log("[clearSessionData] Current sessionData after clear:", Array.from(this.sessionData.entries()));
        this.emit("sessionCleared");
    }

    cleanupOldNews() {
        log.log("[cleanupOldNews] called");
        const TWENTY_MINUTES = 20 * 60 * 1000;
        const now = Date.now();

        const beforeCleanup = this.newsList.length;
        this.newsList = this.newsList.filter((News) => now - News.storedAt <= TWENTY_MINUTES);
        const afterCleanup = this.newsList.length;

        if (beforeCleanup !== afterCleanup) {
            log.log(`Cleaned up old news from global list. Before: ${beforeCleanup}, After: ${afterCleanup}`);
        }
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
