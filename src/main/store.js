const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const { fetchHistoricalNews } = require("./collectors/news");
const { fetchAlphaVantageData, queueRequest } = require("./collectors/alpha");

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
        log.log(`addTickers() called with ${tickers.length} items.`);
        let newTickers = [];
        let newSessionTickers = [];

        for (const ticker of tickers) {
            const key = ticker.Symbol;
            log.log(`Processing ticker: ${key}`);

            // Handle dailyData
            if (!this.dailyData.has(key)) {
                log.log(`Adding new ticker to dailyData: ${key}`);
                this.dailyData.set(key, { ...ticker, Count: 1, News: [] });
                newTickers.push(key);

                // Fetch historical news for new tickers
                log.log(`Fetching historical news for ${key}...`);
                fetchHistoricalNews(key)
                    .then((news) => {
                        if (news && news.length > 0) {
                            log.log(`Successfully fetched ${news.length} historical news items for ${key}.`);
                            this.addNews(news);
                        } else {
                            log.log(`No historical news found for ${key}.`);
                        }
                    })
                    .catch((error) => {
                        log.log(`Failed to fetch historical news for ${key}: ${error.message}`);
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
                log.log(`Updated ticker in dailyData: ${key} (Count: ${existingTicker.Count})`);
            }

            // Handle sessionData
            if (!this.sessionData.has(key)) {
                log.log(`Adding new ticker to sessionData: ${key}`);
                let sessionTicker = { ...ticker, Count: 1 };

                if (this.dailyData.has(key)) {
                    let dailyTicker = this.dailyData.get(key);
                    if (dailyTicker.News) sessionTicker.News = [...dailyTicker.News];
                    if (dailyTicker.overview) sessionTicker.overview = dailyTicker.overview; // ✅ Copy overview
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
                log.log(`Updated ticker in sessionData: ${key} (Count: ${existingTicker.Count})`);
            }
        }

        if (newTickers.length > 0) {
            log.log(`Queuing Alpha Vantage data requests: ${newTickers.join(", ")}`);
            newTickers.forEach((ticker) => queueRequest(ticker));
        }

        log.log(`addTickers() completed. Total tickers in sessionData: ${this.sessionData.size}, in dailyData: ${this.dailyData.size}`);
        this.emit("update");
    }

    addNews(newsItems) {
        log.log(`addNews() called`);
        if (!newsItems) {
            log.log("No news items provided.");
            return;
        }

        const normalizedNews = Array.isArray(newsItems) ? newsItems : [newsItems];

        if (normalizedNews.length === 0) {
            log.log("No valid news items to store.");
            return;
        }

        const timestampedNews = normalizedNews.map((News) => ({
            ...News,
            storedAt: Date.now(),
            symbols: Array.isArray(News.symbols) ? News.symbols : [],
        }));

        this.newsList.push(...timestampedNews);
        log.log(`Stored ${timestampedNews.length} new articles in global list.`);

        timestampedNews.forEach((News) => {
            News.symbols.forEach((symbol) => {
                log.log(`Processing news for ticker: ${symbol}`);

                if (this.dailyData.has(symbol)) {
                    let ticker = this.dailyData.get(symbol);
                    ticker.News = ticker.News || [];

                    const existingHeadlines = new Set(ticker.News.map((n) => n.headline));
                    if (!existingHeadlines.has(News.headline)) {
                        ticker.News.push(News);
                        log.log(`Added news to ${symbol} in dailyData (Total: ${ticker.News.length})`);
                    }
                }

                if (this.sessionData.has(symbol)) {
                    let ticker = this.sessionData.get(symbol);
                    ticker.News = ticker.News || [];

                    const existingHeadlines = new Set(ticker.News.map((n) => n.headline));
                    if (!existingHeadlines.has(News.headline)) {
                        ticker.News.push(News);
                        log.log(`Added news to ${symbol} in sessionData (Total: ${ticker.News.length})`);
                    }
                }
            });
        });

        this.emit("newsUpdated", { newsItems: timestampedNews });
    }

    updateOverview(symbol, updateData) {
        log.log(`updateOverview() called for ${symbol}`);

        if (!this.dailyData.has(symbol)) {
            log.warn(`Attempted to update non-existing ticker: ${symbol}`);
            return;
        }

        let dailyTicker = this.dailyData.get(symbol);
        Object.assign(dailyTicker, updateData);
        this.dailyData.set(symbol, dailyTicker);

        if (this.sessionData.has(symbol)) {
            let sessionTicker = this.sessionData.get(symbol);
            Object.assign(sessionTicker, updateData);
            this.sessionData.set(symbol, sessionTicker);
        }

        log.log(`Updated ticker ${symbol} with new data: ${JSON.stringify(updateData)}`);
        this.emit("update");
    }

    getAllNews() {
        log.log("getAllNews() called");
        return this.newsList;
    }

    getAllTickers(listType) {
        log.log(`getAllTickers() called (List type: ${listType})`);
        const data = listType === "session" ? this.sessionData : this.dailyData;
        return Array.from(data.values());
    }

    clearSessionData() {
        log.log("Clearing session data...");
        this.sessionData.clear();
        log.log("Current sessionData after clear:", Array.from(this.sessionData.entries()));
        this.emit("sessionCleared");
    }

    cleanupOldNews() {
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
