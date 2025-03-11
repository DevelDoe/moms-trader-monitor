const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const { fetchHistoricalNews } = require("./collectors/news");
const { queueRequest, searchCache } = require("./collectors/alpha");
const { getSymbolMeta } = require("./collectors/mtp");

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

    /**
     * Handles incoming WebSocket data from MTP and updates the store
     * @param {string} jsonString - JSON string containing the MTP alert
     */
    addMtpAlerts(jsonString) {
        try {
            const parsedData = JSON.parse(jsonString);

            // Extract alert data
            const { symbol, direction, change_percent, price, volume } = parsedData;

            if (!symbol || price === undefined || volume === undefined) {
                log.warn(`[addMtpAlerts] Missing required fields for symbol ${symbol || "unknown"}.`);
                return;
            }

            log.log(`[addMtpAlerts] Adding MTP alert for ${symbol}`);

            
            // === Handle dailyData ===
            if (!this.dailyData.has(symbol)) {
                log.log(`[addMtpAlerts] Adding new ticker to dailyData: ${symbol}`);
                this.dailyData.set(symbol, {
                    Symbol: symbol,
                    Price: price,
                    highestPrice: price, // Initialize highestPrice with current price
                    Direction: direction || "UNKNOWN",
                    alertChangePercent: Math.abs(change_percent).toFixed(2),
                    cumulativeUpChange: direction === "UP" ? parseFloat(change_percent.toFixed(2)) : 0,
                    cumulativeDownChange: direction === "DOWN" ? parseFloat(change_percent.toFixed(2)) : 0,
                    fiveMinVolume: volume,
                });
                // Fetch Meta Data
                getSymbolMeta(symbol)
                    .then((data) => {
                        if (data) {
                            log.log(`[addMtpAlerts] Meta data for ${symbol} fetched!`);
                            this.updateMeta(symbol, data);
                        } else {
                            log.warn(`[addMtpAlerts] No meta data found for ${symbol}.`);
                        }
                    })
                    .catch((err) => {
                        log.error(`[addMtpAlerts] Error fetching meta data for ${symbol}: ${err.message}`);
                    });

                // ✅ Restore Alpha metadata fetching (if missing)
                searchCache(symbol);
                queueRequest(symbol);

                // Fetch News
                fetchHistoricalNews(symbol)
                    .then((news) => {
                        if (news && news.length > 0) {
                            log.log(`[addMtpAlerts] Successfully fetched ${news.length} news items for ${symbol}.`);
                            this.addNews(news);
                        } else {
                            log.log(`[addMtpAlerts] No historical news found for ${symbol}.`);
                        }
                    })
                    .catch((err) => {
                        log.error(`[addMtpAlerts] Error fetching news for ${symbol}: ${err.message}`);
                    });
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
                }
                existingTicker.fiveMinVolume = volume;

                this.dailyData.set(symbol, existingTicker);
                log.log(`[addMtpAlerts] Updated ${symbol} in dailyData. UpChange: ${existingTicker.cumulativeUpChange}%, DownChange: ${existingTicker.cumulativeDownChange}%`);
            }

            // === Handle sessionData ===
            if (!this.sessionData.has(symbol)) {
                log.log(`[addMtpAlerts] Adding new ticker to sessionData: ${symbol}`);
                this.sessionData.set(symbol, {
                    Symbol: symbol,
                    Price: price,
                    highestPrice: price, // Initialize highestPrice here as well
                    Direction: direction || "UNKNOWN",
                    alertChangePercent: Math.abs(change_percent).toFixed(2),
                    cumulativeUpChange: direction === "UP" ? parseFloat(change_percent.toFixed(2)) : 0,
                    cumulativeDownChange: direction === "DOWN" ? parseFloat(change_percent.toFixed(2)) : 0,
                    fiveMinVolume: volume,
                });
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

            // === Debounced emit("update") ===
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(() => {
                log.log("[addMtpAlerts] Emitting update event (debounced).");
                this.emit("update");
            }, 50); // Adjust debounce time as needed
        } catch (error) {
            log.error(`[addMtpAlerts] Failed to process MTP alert: ${error.message}`);
        }
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
            return Object.fromEntries(Object.entries(obj).map(([key, value]) => [capitalizeFirstLetter(key === "Price" ? "ClosePrice" : key), value]));
        };

        // ✅ Capitalize and merge all data directly at root level
        let capitalizedUpdateData = capitalizeKeys(updateData);
        Object.assign(dailyTicker, capitalizedUpdateData);

        // Ensure the symbol remains correctly stored
        dailyTicker.Symbol = symbol;

        this.dailyData.set(symbol, dailyTicker);

        if (this.sessionData.has(symbol)) {
            let sessionTicker = this.sessionData.get(symbol);
            Object.assign(sessionTicker, capitalizedUpdateData);
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
