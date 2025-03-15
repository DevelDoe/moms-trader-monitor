const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const { fetchHistoricalNews } = require("./collectors/news");

class Store extends EventEmitter {
    constructor() {
        super();
        log.log("Store instance initialized");

        this.symbols = new Map();
        this.sessionData = new Map(); // Resets on clear
        this.dailyData = new Map(); // Stores all tickers for the full day
        this.newsList = []; // Store all news in a single list

        setInterval(() => {
            this.cleanupOldNews();
        }, 60 * 1000); // Runs every 60 seconds
    }

    updateSymbols(symbolList) {
        this.symbols = new Map(symbolList.map((s) => [s.symbol, s]));
        log.log(`[updateSymbols] Stored ${this.symbols.size} symbols.`);
        // log.log('DATA', 'Symbollist: ', this.symbols)

        // Queue fetching news for each symbol to prevent overloading the API
        (async () => {
            for (const symbol of this.symbols.keys()) {
                await fetchHistoricalNews(symbol); // Calls queued request system
            }
        })();
    }

    addMtpAlerts(jsonString) {
        try {
            const parsedData = JSON.parse(jsonString);
            const { symbol, direction, change_percent, price, volume } = parsedData;
    
            if (!symbol || price === undefined || volume === undefined) {
                log.warn(`[addMtpAlerts] Missing required fields for symbol ${symbol || "unknown"}.`);
                return;
            }
    
            log.log(`[addMtpAlerts] Adding MTP alert for ${symbol}`);
    
            let isNewHigh = false;
    
            // Check if symbol exists in dailyData, if not, initialize it
            if (!this.dailyData.has(symbol)) {
                log.log(`[addMtpAlerts] Adding new ticker to dailyData: ${symbol}`);
    
                // Initialize symbol in dailyData
                this.dailyData.set(symbol, {
                    Symbol: symbol,
                    Price: price,
                    highestPrice: price,
                    Direction: direction || "UNKNOWN",
                    alertChangePercent: Math.abs(change_percent).toFixed(2),
                    cumulativeUpChange: direction === "UP" ? parseFloat(change_percent.toFixed(2)) : 0,
                    cumulativeDownChange: direction === "DOWN" ? parseFloat(change_percent.toFixed(2)) : 0,
                    fiveMinVolume: volume,
                });
    
                // After adding the symbol, check for news related to this symbol
                this.attachNews(symbol);
    
            } else {
                let existingTicker = this.dailyData.get(symbol);

                // Update cumulative changes
                let newCumulativeUp = existingTicker.cumulativeUpChange || 0;
                let newCumulativeDown = existingTicker.cumulativeDownChange || 0;

                if (direction === "UP") {
                    newCumulativeUp += change_percent;
                } else {
                    newCumulativeDown += change_percent;
                }

                // Limit to 2 decimal places
                existingTicker.cumulativeUpChange = parseFloat(newCumulativeUp.toFixed(2));
                existingTicker.cumulativeDownChange = parseFloat(newCumulativeDown.toFixed(2));
                existingTicker.alertChangePercent = Math.abs(change_percent).toFixed(2);

                // Update price and direction
                existingTicker.Direction = direction || existingTicker.Direction;
                existingTicker.Price = price;

                // Update highestPrice if the new price is greater than the recorded one
                if (price > existingTicker.highestPrice) {
                    existingTicker.highestPrice = price;
                    isNewHigh = true;
                }
                existingTicker.fiveMinVolume = volume;
    
                this.dailyData.set(symbol, existingTicker);
                log.log(`[addMtpAlerts] Updated ${symbol} in dailyData. UpChange: ${existingTicker.cumulativeUpChange}%, DownChange: ${existingTicker.cumulativeDownChange}%`);
            }
    
            // Handle sessionData similarly:
            if (!this.sessionData.has(symbol)) {
                log.log(`[addMtpAlerts] Adding new ticker to sessionData: ${symbol}`);
                this.sessionData.set(symbol, {
                    Symbol: symbol,
                    Price: price,
                    highestPrice: price,
                    Direction: direction || "UNKNOWN",
                    alertChangePercent: Math.abs(change_percent).toFixed(2),
                    cumulativeUpChange: direction === "UP" ? parseFloat(change_percent.toFixed(2)) : 0,
                    cumulativeDownChange: direction === "DOWN" ? parseFloat(change_percent.toFixed(2)) : 0,
                    fiveMinVolume: volume,
                });
    
                // After adding the symbol, check for news related to this symbol
                this.attachNews(symbol);
    
            } else {
                let existingTicker = this.sessionData.get(symbol);

                // Update cumulative changes
                let newCumulativeUp = existingTicker.cumulativeUpChange || 0;
                let newCumulativeDown = existingTicker.cumulativeDownChange || 0;

                if (direction === "UP") {
                    newCumulativeUp += change_percent;
                } else {
                    newCumulativeDown += change_percent;
                }

                // Limit to 2 decimal places
                existingTicker.cumulativeUpChange = parseFloat(newCumulativeUp.toFixed(2));
                existingTicker.cumulativeDownChange = parseFloat(newCumulativeDown.toFixed(2));
                existingTicker.alertChangePercent = Math.abs(change_percent).toFixed(2);

                // Update price and direction
                existingTicker.Direction = direction || existingTicker.Direction;
                existingTicker.Price = price;

                // Update highestPrice if the new price is greater
                if (price > existingTicker.highestPrice) {
                    existingTicker.highestPrice = price;
                }

                existingTicker.fiveMinVolume = volume;

                this.sessionData.set(symbol, existingTicker);
                log.log(`[addMtpAlerts] Updated ${symbol} in sessionData. UpChange: ${existingTicker.cumulativeUpChange}%, DownChange: ${existingTicker.cumulativeDownChange}%`);
            }
    
            // Emit update event for new high
            if (isNewHigh) {
                this.emit("new-high-price", { symbol, price });
            }

            // Emit store update event separately (no feedback loop)
            log.log("[addMtpAlerts] store update!");
            this.emit("lists-update");
    
        } catch (error) {
            log.error(`[addMtpAlerts] Failed to process MTP alert: ${error.message}`);
        }
    }
    
    // This function checks and attaches any news for the symbol in dailyData and sessionData
    attachNews(symbol) {
        log.log(`[attachNews] Checking for news for symbol: ${symbol}`);
        const newsItems = this.newsList.filter(news => news.symbols.includes(symbol));
    
        newsItems.forEach(newsItem => {
            // Add news to dailyData if not already present
            let ticker = this.dailyData.get(symbol) || {};
            ticker.News = ticker.News || [];
            if (!ticker.News.some(existingNews => existingNews.id === newsItem.id)) {
                ticker.News.push(newsItem);
                this.dailyData.set(symbol, ticker);
            }
    
            // Add news to sessionData if available
            if (this.sessionData.has(symbol)) {
                let sessionTicker = this.sessionData.get(symbol);
                sessionTicker.News = sessionTicker.News || [];
                if (!sessionTicker.News.some(existingNews => existingNews.id === newsItem.id)) {
                    sessionTicker.News.push(newsItem);
                    this.sessionData.set(symbol, sessionTicker);
                }
            }
        });
    }

    addNews(newsItems, symbol) {
        log.log(`[addNews] called for ${symbol}`);

        // Add timestamp to each news item
        const timestampedNews = newsItems.map((news) => ({
            ...news,
            storedAt: Date.now(),
            symbols: Array.isArray(news.symbols) ? news.symbols : [],
        }));

        // ✅ Store all news globally in `newsList`
        this.newsList.push(...timestampedNews);

        // Process news items and attach them to dailyData and sessionData if not already present
        timestampedNews.forEach((newsItem) => {
            if (newsItem.symbols.includes(symbol)) {
                // Check for duplicate news in dailyData
                let ticker = this.dailyData.get(symbol) || {};
                ticker.News = ticker.News || [];

                if (!ticker.News.some((existingNews) => existingNews.id === newsItem.id)) {
                    ticker.News.push(newsItem); // Add unique news to dailyData
                    this.dailyData.set(symbol, ticker);
                }

                // Check for duplicate news in sessionData
                if (this.sessionData.has(symbol)) {
                    let sessionTicker = this.sessionData.get(symbol);
                    sessionTicker.News = sessionTicker.News || [];

                    if (!sessionTicker.News.some((existingNews) => existingNews.id === newsItem.id)) {
                        sessionTicker.News.push(newsItem); // Add unique news to sessionData
                        this.sessionData.set(symbol, sessionTicker);
                    }
                }
            }
        });

        // Emit event after adding news
        this.emit("newsUpdated", { newsItems: timestampedNews });
    }

    updateMeta(symbol, updateData) {
        log.log(`[updateMeta] called for ${symbol} with updateData:`);

        if (!this.dailyData.has(symbol)) {
            log.warn(`[updateMeta] Attempted to update non-existing ticker: ${symbol}`);
            return;
        }

        let dailyTicker = this.dailyData.get(symbol);

        // Ensure the 'meta' field exists and update it
        dailyTicker.meta = dailyTicker.meta || {};
        Object.assign(dailyTicker.meta, updateData.meta);

        // Ensure the symbol remains correctly stored
        dailyTicker.Symbol = symbol;
        this.dailyData.set(symbol, dailyTicker);

        if (this.sessionData.has(symbol)) {
            let sessionTicker = this.sessionData.get(symbol);
            sessionTicker.meta = sessionTicker.meta || {};
            Object.assign(sessionTicker.meta, updateData.meta);
            this.sessionData.set(symbol, sessionTicker);
        }

        log.log(`[updateMeta] Updated ticker ${symbol} with new metadata under 'meta' subcategory.`);
        log.bounce("DATA", `[updateMeta] final object`, JSON.stringify(dailyTicker));
        // this.emit("meta-update");
    }

    getAllNews() {
        log.log("[getAllNews] called");
        return this.newsList;
    }

    getAllSymbols() {
        log.log("[getAllSymbols] called");
        return Array.from(this.symbols.values());
    }

    getSymbol(symbol) {
        log.log(`[getSymbol] called for: ${symbol}`);
        return this.symbols.get(symbol) || null;
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
