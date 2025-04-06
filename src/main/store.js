const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const { fetchHistoricalNews, subscribeToSymbolNews } = require("./collectors/news");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        // 🔥 Clear old symbols
        this.symbols.clear();

        this.symbols = new Map(
            symbolList.map((s) => {
                // Extract necessary values
                const sharesShort = s.statistics?.sharesShort ?? 0;
                const floatShares = s.statistics?.floatShares ?? 0;
                const institutionsFloatPercentHeld = s.ownership?.institutionsFloatPercentHeld ?? 0;

                // ✅ Compute `shortPercentOfFloat`
                const shortPercentOfFloat = floatShares > 0 ? parseFloat(((sharesShort / floatShares) * 100).toFixed(2)) : 0.0;

                // ✅ Compute `floatHeldByInstitutions`
                const floatHeldByInstitutions = parseFloat((floatShares * institutionsFloatPercentHeld).toFixed(2));

                // ✅ Attach computed values before storing
                return [
                    s.symbol,
                    {
                        ...s,
                        statistics: {
                            ...s.statistics,
                            shortPercentOfFloat,
                            floatHeldByInstitutions,
                        },
                    },
                ];
            })
        );

        log.log(`[updateSymbols] Symbols list updated. Total symbols:`, this.symbols.size);

        subscribeToSymbolNews(Array.from(this.symbols.keys()));

        (async () => {
            for (const symbol of this.symbols.keys()) {
                await fetchHistoricalNews(symbol);
                await sleep(200); // ⏳ Add 500ms delay between requests
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

            // Fetch base data from this.symbols if available
            const baseData = this.symbols.get(symbol) || {};

            // Prepare merged data
            const mergedData = {
                ...baseData, // Merge any existing attributes from this.symbols
                Symbol: symbol,
                Price: price,
                highestPrice: baseData.highestPrice || price, // Keep highest price if already tracked
                Direction: direction || "UNKNOWN",
                alertChangePercent: Math.abs(change_percent).toFixed(2),
                cumulativeUpChange: direction === "UP" ? parseFloat(change_percent.toFixed(2)) : 0,
                cumulativeDownChange: direction === "DOWN" ? parseFloat(change_percent.toFixed(2)) : 0,
                fiveMinVolume: volume,
            };

            // **Update dailyData**
            if (!this.dailyData.has(symbol)) {
                log.log(`[addMtpAlerts] Adding new ticker to dailyData: ${symbol}`);
                this.dailyData.set(symbol, mergedData);
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

                existingTicker.cumulativeUpChange = parseFloat(newCumulativeUp.toFixed(2));
                existingTicker.cumulativeDownChange = parseFloat(newCumulativeDown.toFixed(2));
                existingTicker.alertChangePercent = Math.abs(change_percent).toFixed(2);
                existingTicker.Direction = direction || existingTicker.Direction;
                existingTicker.Price = price;

                if (price > existingTicker.highestPrice) {
                    existingTicker.highestPrice = price;
                    isNewHigh = true;
                }

                existingTicker.fiveMinVolume = volume;
                this.dailyData.set(symbol, existingTicker);
                log.log(`[addMtpAlerts] Updated ${symbol} in dailyData.`);
            }

            // **Update sessionData**
            if (!this.sessionData.has(symbol)) {
                log.log(`[addMtpAlerts] Adding new ticker to sessionData: ${symbol}`);
                this.sessionData.set(symbol, mergedData);
                this.attachNews(symbol);
            } else {
                let existingTicker = this.sessionData.get(symbol);

                let newCumulativeUp = existingTicker.cumulativeUpChange || 0;
                let newCumulativeDown = existingTicker.cumulativeDownChange || 0;

                if (direction === "UP") {
                    newCumulativeUp += change_percent;
                } else {
                    newCumulativeDown += change_percent;
                }

                existingTicker.cumulativeUpChange = parseFloat(newCumulativeUp.toFixed(2));
                existingTicker.cumulativeDownChange = parseFloat(newCumulativeDown.toFixed(2));
                existingTicker.alertChangePercent = Math.abs(change_percent).toFixed(2);
                existingTicker.Direction = direction || existingTicker.Direction;
                existingTicker.Price = price;

                if (price > existingTicker.highestPrice) {
                    existingTicker.highestPrice = price;
                }

                existingTicker.fiveMinVolume = volume;
                this.sessionData.set(symbol, existingTicker);
                log.log(`[addMtpAlerts] Updated ${symbol} in sessionData.`);
            }

            // Emit update event for new high
            if (isNewHigh) {
                this.emit("new-high-price", {
                    symbol,
                    price,
                    direction: direction || "UP",
                    change_percent: change_percent || 0,
                    fiveMinVolume: volume || 0, // ✅ correct attr
                    type: "new-high-price",
                });
            }

            // Emit store update event
            log.log("[addMtpAlerts] store update!");
            this.emit("lists-update");

            // **Trigger metadata update**
            // this.updateMeta(symbol, { meta: baseData.meta || {} });
        } catch (error) {
            log.error(`[addMtpAlerts] Failed to process MTP alert: ${error.message}`);
        }
    }

    // This function checks and attaches any news for the symbol in dailyData and sessionData
    attachNews(symbol) {
        log.log(`[attachNews] Checking for news for symbol: ${symbol}`);
        const newsItems = this.newsList.filter((news) => news.symbols.includes(symbol));

        newsItems.forEach((newsItem) => {
            // ✅ Only modify if symbol exists in dailyData
            if (this.dailyData.has(symbol)) {
                let ticker = this.dailyData.get(symbol);
                ticker.News = ticker.News || [];
                if (!ticker.News.some((n) => n.id === newsItem.id)) {
                    ticker.News.push(newsItem);
                    this.dailyData.set(symbol, ticker);
                }
            }

            // ✅ Only modify if exists in sessionData
            if (this.sessionData.has(symbol)) {
                let sessionTicker = this.sessionData.get(symbol);
                sessionTicker.News = sessionTicker.News || [];
                if (!sessionTicker.News.some((n) => n.id === newsItem.id)) {
                    sessionTicker.News.push(newsItem);
                    this.sessionData.set(symbol, sessionTicker);
                }
            }

            // ✅ Only modify if exists in symbols
            if (this.symbols.has(symbol)) {
                let symbolTicker = this.symbols.get(symbol);
                symbolTicker.News = symbolTicker.News || [];
                if (!symbolTicker.News.some((n) => n.id === newsItem.id)) {
                    symbolTicker.News.push(newsItem);
                    this.symbols.set(symbol, symbolTicker);
                }
            }
        });
    }

    addNews(newsItems, symbol) {
        log.log(`[addNews] called for ${symbol}`);

        const timestampedNews = newsItems.map((news) => ({
            ...news,
            storedAt: Date.now(),
            symbols: Array.isArray(news.symbols) ? news.symbols : [],
        }));

        this.newsList.push(...timestampedNews);

        timestampedNews.forEach((newsItem) => {
            if (newsItem.symbols.includes(symbol)) {
                // ✅ Only mutate if symbol already exists in dailyData
                const dailyTicker = this.dailyData.get(symbol);
                if (dailyTicker) {
                    dailyTicker.News = dailyTicker.News || [];
                    if (!dailyTicker.News.some((existingNews) => existingNews.id === newsItem.id)) {
                        dailyTicker.News.push(newsItem);
                    }
                }

                // ✅ Same for sessionData
                const sessionTicker = this.sessionData.get(symbol);
                if (sessionTicker) {
                    sessionTicker.News = sessionTicker.News || [];
                    if (!sessionTicker.News.some((existingNews) => existingNews.id === newsItem.id)) {
                        sessionTicker.News.push(newsItem);
                    }
                }
            }

            // ✅ Only attach to existing tickers — don't create new ones accidentally
            newsItem.symbols.forEach((sym) => {
                if (this.dailyData.has(sym) || this.sessionData.has(sym) || this.symbols.has(sym)) {
                    this.attachNews(sym);
                } else {
                    log.debug(`[addNews] Skipping symbol '${sym}' — not found in store`);
                }
            });
        });

        this.emit("newsUpdated", { newsItems: timestampedNews });
    }

    getAllNews() {
        log.log("[getAllNews] called");
        return this.newsList;
    }

    fetchNews() {
        const symbols = Array.from(this.symbols.keys());
        subscribeToSymbolNews(symbols);
        log.log(`[subscribeToNews] Subscribed to news for ${symbols.length} symbols.`);
        (async () => {
            for (const symbol of this.symbols.keys()) {
                await fetchHistoricalNews(symbol);
                await sleep(200); // ⏳ Add 500ms delay between requests
            }
        })();
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
