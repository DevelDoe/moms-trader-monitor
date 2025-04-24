const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const { fetchHistoricalNews, subscribeToSymbolNews } = require("./collectors/news");
const { computeBuffsForSymbol, calculateVolumeImpact, getHeroBuff } = require("./utils/buffLogic");

const path = require("path");
const fs = require("fs");
const os = require("os");

const isDevelopment = process.env.NODE_ENV === "development";

const debugXp = false;

// ✅ Declare SETTINGS_FILE before logging it
const SETTINGS_FILE = isDevelopment ? path.join(__dirname, "../data/settings.dev.json") : path.join(require("electron").app.getPath("userData"), "settings.json");

const BUFFS_FILE = path.join(__dirname, "../data/buffs.json");

let buffs = [];
let blockList = [];
let bullishList = [];
let bearishList = [];

function loadSettingsAndBuffs() {
    try {
        const settingsRaw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        const settings = JSON.parse(settingsRaw);

        blockList = settings.news?.blockList || [];
        bullishList = settings.news?.bullishList || [];
        bearishList = settings.news?.bearishList || [];
    } catch (err) {
        console.warn("⚠️ Failed to load settings:", err.message);
        blockList = [];
        bullishList = [];
        bearishList = [];
    }

    try {
        const buffsRaw = fs.readFileSync(BUFFS_FILE, "utf-8");
        buffs = JSON.parse(buffsRaw);
    } catch (err) {
        console.warn("⚠️ Failed to load buffs:", err.message);
        buffs = [];
    }
}

function getNewsSentimentBuff(headline, buffs, bullishList, bearishList) {
    const lower = headline.toLowerCase();

    if (bullishList.some((term) => lower.includes(term.toLowerCase()))) {
        return buffs.find((b) => b.key === "hasBullishNews");
    }
    if (bearishList.some((term) => lower.includes(term.toLowerCase()))) {
        return buffs.find((b) => b.key === "hasBearishNews");
    }
    return buffs.find((b) => b.key === "hasNews");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const META_FILE = path.join(__dirname, "../data/store.meta.json");

function saveStoreMeta(date) {
    try {
        fs.writeFileSync(META_FILE, JSON.stringify({ date }), "utf-8");
    } catch (err) {
        log.warn("⚠️ Failed to save store meta file:", err.message);
    }
}

function loadStoreMeta() {
    try {
        const raw = fs.readFileSync(META_FILE, "utf-8");
        return JSON.parse(raw).date || null;
    } catch {
        return null;
    }
}

function getMarketDateString() {
    const now = new Date();
    const offset = -5 * 60; // EST offset in minutes
    const localOffset = now.getTimezoneOffset();
    const est = new Date(now.getTime() + (localOffset - offset) * 60000);
    return est.toISOString().split("T")[0];
}

class Store extends EventEmitter {
    constructor() {
        super();
        log.log("Store instance initialized");

        loadSettingsAndBuffs();

        this.symbols = new Map();
        // this.sessionData = new Map();
        // this.dailyData = new Map();
        this.newsList = [];
        this.xpState = new Map();

        const today = getMarketDateString();
        const lastClear = loadStoreMeta();

        if (lastClear !== today) {
            this.xpState.clear();
            // this.sessionData.clear();
            // this.dailyData.clear();
            this.newsList = [];

            log.log("🧨 Full store reset at boot (new day)");

            this.emit("store-nuke");

            saveStoreMeta(today);
            this.startXpDecay();
        } else {
            log.log("✅ Store is up to date — no daily reset needed");
        }
    }

    nuke() {
        this.xpState.clear();
        // this.sessionData.clear();
        // this.dailyData.clear();
        this.newsList = [];

        log.warn("🔥 Manual nuke: Store state cleared");

        this.emit("store-nuke");
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

                // ✅ Compute `shortPercentOfFloat ^ floatHeldByInstitutions
                const shortPercentOfFloat = floatShares > 0 ? parseFloat(((sharesShort / floatShares) * 100).toFixed(2)) : 0.0;
                const floatHeldByInstitutions = parseFloat((floatShares * institutionsFloatPercentHeld).toFixed(2));

                // ✅ Compute buffs
                const computedBuffs = computeBuffsForSymbol(s, buffs, blockList);

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
                        buffs: computedBuffs, // ⬅️ Inject here
                    },
                ];
            })
        );

        log.log(`[updateSymbols] Symbols list updated. Total symbols:`, this.symbols.size);

        if (!isDevelopment) {
            subscribeToSymbolNews(Array.from(this.symbols.keys()));

            (async () => {
                for (const symbol of this.symbols.keys()) {
                    await fetchHistoricalNews(symbol);
                    await sleep(200); // ⏳ Add 500ms delay between requests
                }
            })();
        }
    }

    // addMtpAlerts(jsonString) {
    //     try {
    //         const parsedData = JSON.parse(jsonString);
    //         const { symbol, direction, change_percent, price, volume } = parsedData;

    //         if (!symbol || price === undefined || volume === undefined) {
    //             log.warn(`[addMtpAlerts] Missing required fields for symbol ${symbol || "unknown"}.`);
    //             return;
    //         }

    //         log.log(`[addMtpAlerts] Adding MTP alert for ${symbol}`);

    //         let isNewHigh = false;

    //         // Fetch base data from this.symbols if available
    //         const baseData = this.symbols.get(symbol) || {};

    //         // Prepare merged data
    //         const mergedData = {
    //             ...baseData, // Merge any existing attributes from this.symbols
    //             Symbol: symbol,
    //             Price: price,
    //             highestPrice: baseData.highestPrice || price, // Keep highest price if already tracked
    //             Direction: direction || "UNKNOWN",
    //             alertChangePercent: Math.abs(change_percent).toFixed(2),
    //             cumulativeUpChange: direction === "UP" ? parseFloat(change_percent.toFixed(2)) : 0,
    //             cumulativeDownChange: direction === "DOWN" ? parseFloat(change_percent.toFixed(2)) : 0,
    //             fiveMinVolume: volume,
    //         };

    //         // **Update dailyData**
    //         if (!this.dailyData.has(symbol)) {
    //             log.log(`[addMtpAlerts] Adding new ticker to dailyData: ${symbol}`);
    //             this.dailyData.set(symbol, mergedData);
    //             this.attachNews(symbol);
    //         } else {
    //             let existingTicker = this.dailyData.get(symbol);

    //             // Update cumulative changes
    //             let newCumulativeUp = existingTicker.cumulativeUpChange || 0;
    //             let newCumulativeDown = existingTicker.cumulativeDownChange || 0;

    //             if (direction === "UP") {
    //                 newCumulativeUp += change_percent;
    //             } else {
    //                 newCumulativeDown += change_percent;
    //             }

    //             existingTicker.cumulativeUpChange = parseFloat(newCumulativeUp.toFixed(2));
    //             existingTicker.cumulativeDownChange = parseFloat(newCumulativeDown.toFixed(2));
    //             existingTicker.alertChangePercent = Math.abs(change_percent).toFixed(2);
    //             existingTicker.Direction = direction || existingTicker.Direction;
    //             existingTicker.Price = price;

    //             if (price > existingTicker.highestPrice) {
    //                 existingTicker.highestPrice = price;
    //                 isNewHigh = true;
    //             }

    //             existingTicker.fiveMinVolume = volume;
    //             this.dailyData.set(symbol, existingTicker);
    //             log.log(`[addMtpAlerts] Updated ${symbol} in dailyData.`);
    //         }

    //         // **Update sessionData**
    //         if (!this.sessionData.has(symbol)) {
    //             // log.log(`[addMtpAlerts] Adding new ticker to sessionData: ${symbol}`);
    //             // this.sessionData.set(symbol, mergedData);
    //             log.log("attacing news");
    //             this.attachNews(symbol);
    //         } else {
    //             let existingTicker = this.sessionData.get(symbol);

    //             let newCumulativeUp = existingTicker.cumulativeUpChange || 0;
    //             let newCumulativeDown = existingTicker.cumulativeDownChange || 0;

    //             if (direction === "UP") {
    //                 newCumulativeUp += change_percent;
    //             } else {
    //                 newCumulativeDown += change_percent;
    //             }

    //             existingTicker.cumulativeUpChange = parseFloat(newCumulativeUp.toFixed(2));
    //             existingTicker.cumulativeDownChange = parseFloat(newCumulativeDown.toFixed(2));
    //             existingTicker.alertChangePercent = Math.abs(change_percent).toFixed(2);
    //             existingTicker.Direction = direction || existingTicker.Direction;
    //             existingTicker.Price = price;

    //             if (price > existingTicker.highestPrice) {
    //                 existingTicker.highestPrice = price;
    //             }

    //             existingTicker.fiveMinVolume = volume;
    //             this.sessionData.set(symbol, existingTicker);
    //             log.log(`[addMtpAlerts] Updated ${symbol} in sessionData.`);
    //         }

    //         // ✅ Sync symbol map if not already there
    //         if (!this.symbols.has(symbol)) {
    //             this.symbols.set(symbol, {
    //                 symbol,
    //                 price,
    //                 statistics: {}, // or fetched later
    //                 ownership: {},
    //                 profile: {},
    //             });
    //         }

    //         // Emit update event for new high
    //         if (isNewHigh) {
    //             this.emit("new-high-price", {
    //                 symbol,
    //                 price,
    //                 direction: direction || "UP",
    //                 change_percent: change_percent || 0,
    //                 fiveMinVolume: volume || 0,
    //                 type: "new-high-price",
    //             });
    //         }

    //         // 🔁 Update dynamic buffs
    //         const ticker = this.symbols.get(symbol);
    //         if (ticker) {
    //             ticker.buffs = ticker.buffs || {};

    //             // 🧠 Save last event
    //             ticker.lastEvent = {
    //                 hp: direction === "UP" ? change_percent : 0,
    //                 dp: direction === "DOWN" ? change_percent : 0,
    //                 xp: volume || 0,
    //             };

    //             ticker.buffs.volume = calculateVolumeImpact(volume, price, buffs);

    //             // 🔁 Bounce Back Buff (inline)
    //             if (ticker.lastEvent.dp > 0 && ticker.lastEvent.hp > 0) {
    //                 ticker.buffs.bounceBack = {
    //                     key: "bounceBack",
    //                     icon: "🔁",
    //                     desc: "Recovering — stock is bouncing back after a downtrend",
    //                     score: 5,
    //                     isBuff: true,
    //                 };
    //             } else {
    //                 delete ticker.buffs.bounceBack;
    //             }

    //             // 📈 New High Buff (inline)
    //             if (isNewHigh) {
    //                 ticker.buffs.newHigh = {
    //                     key: "newHigh",
    //                     icon: "📈",
    //                     desc: "New high",
    //                     score: 10,
    //                     isBuff: true,
    //                 };
    //             } else {
    //                 delete ticker.buffs.newHigh;
    //             }

    //             this.emit("buffs-updated", [
    //                 {
    //                     symbol,
    //                     buffs: ticker.buffs,
    //                     highestPrice: ticker.highestPrice,
    //                     lastEvent: ticker.lastEvent,
    //                 },
    //             ]);
    //             log.log(`[buffs] Emitted buffs-updated for: ${symbol}`);
    //         }

    //         // 📢 Store update
    //         log.log("[addMtpAlerts] store update!");
    //         this.emit("lists-update");
    //     } catch (error) {
    //         log.error(`[addMtpAlerts] Failed to process MTP alert: ${error.message}`);
    //     }
    // }

    addEvent(alert) {
        try {
            const { symbol, direction, change_percent, price, volume } = alert;

            if (!symbol || price === undefined || volume === undefined) {
                log.warn(`[addEvent] Missing required fields for symbol ${symbol || "unknown"}.`);
                return;
            }

            log.log(`[addEvent] Processing alert for ${symbol}`);

            // Ensure symbol is tracked
            if (!this.symbols.has(symbol)) {
                this.symbols.set(symbol, {
                    symbol,
                    price,
                    statistics: {},
                    ownership: {},
                    profile: {},
                });
            }

            const baseData = this.symbols.get(symbol);
            const isNewHigh = price > (baseData.highestPrice || 0);

            // Merge & normalize the alert
            const mergedData = {
                ...baseData,
                Symbol: symbol,
                Price: price,
                highestPrice: isNewHigh ? price : baseData.highestPrice || price,
                Direction: direction || "UNKNOWN",
                alertChangePercent: Math.abs(change_percent).toFixed(2),
                cumulativeUpChange: (baseData.cumulativeUpChange || 0) + (direction === "UP" ? parseFloat(change_percent.toFixed(2)) : 0),
                cumulativeDownChange: (baseData.cumulativeDownChange || 0) + (direction === "DOWN" ? parseFloat(change_percent.toFixed(2)) : 0),
                fiveMinVolume: volume,
            };

            this.symbols.set(symbol, mergedData);

            // Apply RPG-style buffs + event metadata
            this.applyRpgEventMeta(symbol, alert, isNewHigh);

            // Emit general update
            this.emit("lists-update");

            // Emit new high signal
            if (isNewHigh) {
                this.emit("new-high-price", {
                    symbol,
                    price,
                    direction: direction || "UP",
                    change_percent: change_percent || 0,
                    fiveMinVolume: volume || 0,
                    type: "new-high-price",
                });
            }
        } catch (error) {
            log.error(`[addEvent] Failed to process event: ${error.message}`);
        }
    }

    // Rest of your existing functions remain exactly the same
    transformToFocusEvent(alert) {
        const isUp = alert.direction.toUpperCase() === "UP";
        const change = Math.abs(alert.change_percent || 0);

        return {
            hero: alert.symbol,
            hp: isUp ? change : 0,
            dp: isUp ? 0 : change,
            strength: alert.volume,
            price: alert.price,
        };
    }

    applyRpgEventMeta(symbol, alert, isNewHigh = false) {
        const ticker = this.symbols.get(symbol);
        if (!ticker) return;

        // 🎮 Convert to RPG-style event
        const event = this.transformToFocusEvent(alert);

        // 🧠 Save last event in RPG terms
        ticker.lastEvent = {
            hp: event.hp,
            dp: event.dp,
            xp: alert.volume || 0,
        };

        this.calculateXp(ticker, event);

        // 🎯 Initialize and update buffs
        ticker.buffs = ticker.buffs || {};
        ticker.buffs.volume = calculateVolumeImpact(alert.volume, alert.price, buffs);

        // 🔁 Bounce Back Buff
        if (event.dp > 0 && event.hp > 0) {
            ticker.buffs.bounceBack = {
                key: "bounceBack",
                icon: "🔁",
                desc: "Recovering — stock is bouncing back after a downtrend",
                score: 5,
                isBuff: true,
            };
        } else {
            delete ticker.buffs.bounceBack;
        }

        // 📈 New High Buff
        if (isNewHigh) {
            ticker.buffs.newHigh = {
                key: "newHigh",
                icon: "📈",
                desc: "New high",
                score: 10,
                isBuff: true,
            };
        } else {
            delete ticker.buffs.newHigh;
        }

        this.emit("hero-updated", [
            {
                hero: symbol,
                buffs: ticker.buffs,
                highestPrice: ticker.highestPrice,
                lastEvent: ticker.lastEvent,
                xp: ticker.xp,
                lv: ticker.lv,
            },
        ]);

        log.log(`[store] Emitted hero-updated for: ${event.hero}`);
    }

    // This function checks and attaches any news for the symbol in dailyData and sessionData
    attachNews(symbol) {
        log.log(`[attachNews] Checking for news for symbol: ${symbol}`);
        const newsItems = this.newsList.filter((news) => news.symbols.includes(symbol));

        if (!this.symbols.has(symbol)) return;

        const ticker = this.symbols.get(symbol);
        ticker.News = ticker.News || [];

        newsItems.forEach((newsItem) => {
            if (!ticker.News.some((n) => n.id === newsItem.id)) {
                ticker.News.push(newsItem);
            }
        });

        this.symbols.set(symbol, ticker);

        // newsItems.forEach((newsItem) => {
        //     // ✅ Only modify if symbol exists in dailyData
        //     if (this.dailyData.has(symbol)) {
        //         let ticker = this.dailyData.get(symbol);
        //         ticker.News = ticker.News || [];
        //         if (!ticker.News.some((n) => n.id === newsItem.id)) {
        //             ticker.News.push(newsItem);
        //             this.dailyData.set(symbol, ticker);
        //         }
        //     }

        //     // ✅ Only modify if exists in sessionData
        //     if (this.sessionData.has(symbol)) {
        //         let sessionTicker = this.sessionData.get(symbol);
        //         sessionTicker.News = sessionTicker.News || [];
        //         if (!sessionTicker.News.some((n) => n.id === newsItem.id)) {
        //             sessionTicker.News.push(newsItem);
        //             this.sessionData.set(symbol, sessionTicker);
        //         }
        //     }

        //     // ✅ Only modify if exists in symbols
        //     if (this.symbols.has(symbol)) {
        //         let symbolTicker = this.symbols.get(symbol);
        //         symbolTicker.News = symbolTicker.News || [];
        //         if (!symbolTicker.News.some((n) => n.id === newsItem.id)) {
        //             symbolTicker.News.push(newsItem);
        //             this.symbols.set(symbol, symbolTicker);
        //         }
        //     }
        // });
    }

    // addNews(newsItems, symbol) {
    //     log.log(`[addNews] called for ${symbol}`);

    //     const existingIds = new Set(this.newsList.map((n) => n.id));
    //     const existingHeadlines = new Set(this.newsList.map((n) => n.headline));

    //     const filteredNews = newsItems.filter((news) => {
    //         if (existingIds.has(news.id)) return false;
    //         if (existingHeadlines.has(news.headline)) return false;

    //         // ⛔ Block multi-symbol news
    //         if (news.symbols.length > 1) {
    //             log.log(`[addNews] Skipping multi-symbol headline: "${news.headline}"`);
    //             return false;
    //         }

    //         // ⛔ Block by blockList
    //         const sanitized = news.headline.toLowerCase().trim();
    //         const isBlocked = blockList.some((word) => sanitized.includes(word.toLowerCase().trim()));
    //         if (isBlocked) {
    //             log.log(`[addNews] Blocked by blockList: "${news.headline}"`);
    //             return false;
    //         }

    //         return true;
    //     });

    //     if (filteredNews.length === 0) {
    //         log.log("[addNews] No new news items to process.");
    //         return;
    //     }

    //     const timestampedNews = filteredNews.map((news) => ({
    //         ...news,
    //         storedAt: Date.now(),
    //         symbols: Array.isArray(news.symbols) ? news.symbols : [],
    //     }));

    //     this.newsList.push(...timestampedNews);

    //     timestampedNews.forEach((newsItem) => {
    //         // Attach news to daily/session data if it matches the incoming symbol
    //         if (newsItem.symbols.includes(symbol)) {
    //             const dailyTicker = this.dailyData.get(symbol);
    //             if (dailyTicker) {
    //                 dailyTicker.News = dailyTicker.News || [];
    //                 dailyTicker.News.push(newsItem);
    //             }

    //             const sessionTicker = this.sessionData.get(symbol);
    //             if (sessionTicker) {
    //                 sessionTicker.News = sessionTicker.News || [];
    //                 sessionTicker.News.push(newsItem);
    //             }
    //         }

    //         // 🎯 Check sentiment and attach buff
    //         const newsBuff = getNewsSentimentBuff(newsItem.headline, buffs, bullishList, bearishList);
    //         newsItem.symbols.forEach((sym) => {
    //             if (this.dailyData.has(sym) || this.sessionData.has(sym) || this.symbols.has(sym)) {
    //                 const ticker = this.symbols.get(sym);
    //                 if (!ticker) return;

    //                 ticker.buffs = ticker.buffs || {};
    //                 ticker.buffs[newsBuff.key] = newsBuff;

    //                 this.emit("buffs-updated", [
    //                     {
    //                         symbol: sym,
    //                         buffs: ticker.buffs,
    //                         highestPrice: ticker.highestPrice,
    //                         lastEvent: ticker.lastEvent,
    //                     },
    //                 ]);
    //                 log.log(`[buffs] ${newsBuff.icon} ${newsBuff.key} added for: ${sym}`);

    //                 this.attachNews(sym);
    //             } else {
    //                 log.log(`[addNews] Skipping symbol '${sym}' — not found in store`);
    //             }
    //         });
    //     });

    //     this.emit("newsUpdated", { newsItems: timestampedNews });
    //     this.emit("lists-update");
    // }

    addNews(newsItems, symbol) {
        log.log(`[addNews] called for ${symbol}`);

        const existingIds = new Set(this.newsList.map((n) => n.id));
        const existingHeadlines = new Set(this.newsList.map((n) => n.headline));

        const filteredNews = newsItems.filter((news) => {
            if (existingIds.has(news.id)) return false;
            if (existingHeadlines.has(news.headline)) return false;

            // ⛔ Block multi-symbol news
            if (news.symbols.length > 1) {
                log.log(`[addNews] Skipping multi-symbol headline: "${news.headline}"`);
                return false;
            }

            // ⛔ Block by blockList
            const sanitized = news.headline.toLowerCase().trim();
            const isBlocked = blockList.some((word) => sanitized.includes(word.toLowerCase().trim()));
            if (isBlocked) {
                log.log(`[addNews] Blocked by blockList: "${news.headline}"`);
                return false;
            }

            return true;
        });

        if (filteredNews.length === 0) {
            log.log("[addNews] No new news items to process.");
            return;
        }

        const timestampedNews = filteredNews.map((news) => ({
            ...news,
            storedAt: Date.now(),
            symbols: Array.isArray(news.symbols) ? news.symbols : [],
        }));

        this.newsList.push(...timestampedNews);

        timestampedNews.forEach((newsItem) => {
            // 🎯 Attach sentiment buff and link news to symbol if it's tracked
            const newsBuff = getNewsSentimentBuff(newsItem.headline, buffs, bullishList, bearishList);

            newsItem.symbols.forEach((sym) => {
                const ticker = this.symbols.get(sym);
                if (!ticker) {
                    log.log(`[addNews] Skipping symbol '${sym}' — not found in store`);
                    return;
                }

                // Attach news
                ticker.News = ticker.News || [];
                if (!ticker.News.some((n) => n.id === newsItem.id)) {
                    ticker.News.push(newsItem);
                }

                // Add sentiment buff
                ticker.buffs = ticker.buffs || {};
                ticker.buffs[newsBuff.key] = newsBuff;

                this.emit("buffs-updated", [
                    {
                        symbol: sym,
                        buffs: ticker.buffs,
                        highestPrice: ticker.highestPrice,
                        lastEvent: ticker.lastEvent,
                    },
                ]);
                log.log(`[buffs] ${newsBuff.icon} ${newsBuff.key} added for: ${sym}`);
            });
        });

        this.emit("newsUpdated", { newsItems: timestampedNews });
        this.emit("lists-update");
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

    getAllTickers() {
        log.bounce("INFO", "[getAllTickers] called (only 'symbols' supported)");
        return this.getAllSymbols();
    }

    // getAllTickers(listType) {
    //     log.bounce("INFO", `[getAllTickers] called (List type: ${listType})`);

    //     if (listType === "symbols") {
    //         return this.getAllSymbols();
    //     }

    //     // 🟡 Warn on deprecated usage
    //     // if (listType === "session") {
    //     //     log.warn("[getAllTickers] ⚠️ 'session' listType is deprecated and will be removed soon. Use 'symbols' instead.");
    //     //     return Array.from(this.sessionData.values());
    //     // }

    //     // if (listType === "daily") {
    //     //     log.warn("[getAllTickers] ⚠️ 'daily' listType is deprecated and will be removed soon. Use 'symbols' instead.");
    //     //     return Array.from(this.dailyData.values());
    //     // }

    //     // 🟥 Unknown type
    //     log.error(`[getAllTickers] ❌ Unknown listType '${listType}' — expected 'symbols'`);
    //     return [];
    // }

    updateXp(symbol, xp, lv) {
        this.xpState.set(symbol, { xp, lv });

        log.log(`[XP] Updated ${symbol}: XP ${xp}, LV ${lv}`);
        this.emit("xp-updated", { symbol, xp, lv });
    }

    // clearSessionData() {
    //     log.log("[clearSessionData] called");
    //     this.sessionData.clear();
    //     log.log("[clearSessionData] Current sessionData after clear:", Array.from(this.sessionData.entries()));
    //     this.emit("sessionCleared");
    // }

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

    calculateXp(ticker, event) {
        const hp = event.hp || 0;
        const dp = event.dp || 0;
        const totalMove = hp + dp;
        const strength = event.strength || 0;

        let baseXp = totalMove * 10;

        const volumeBuff = getHeroBuff(ticker, "volume");
        const volMult = volumeBuff?.multiplier ?? 1;

        const xpDelta = Math.round(baseXp * volMult);

        ticker.xp = (ticker.xp || 0) + xpDelta;

        ticker.lv = Math.max(1, ticker.lv || 1);
        let requiredXp = (ticker.lv + 1) * 1000;

        while (ticker.xp >= requiredXp) {
            ticker.xp -= requiredXp;
            ticker.lv += 1;
            if (debug) console.log(`✨ ${ticker.symbol} leveled up to LV ${ticker.lv}!`);
            requiredXp = (ticker.lv + 1) * 1000;
        }

        if (debugXp) {
            console.log(`⚡⚡⚡ [${ticker.symbol}] XP BREAKDOWN ⚡⚡⚡`);
            console.log(`📜 ALERT → HP: ${hp.toFixed(2)} | DP: ${dp.toFixed(2)} | Strength: ${strength.toLocaleString()}`);
            console.log(`💖 Base XP                     ${baseXp.toFixed(2)}`);
            if (volumeBuff?.desc) {
                console.log(`🏷️ Buff: ${volumeBuff.desc.padEnd(26)} x${volMult.toFixed(2)}`);
            } else {
                console.log(`🏷️ Volume Multiplier           x${volMult.toFixed(2)}`);
            }
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log(`🎯 XP GAINED                   ${xpDelta}`);
            console.log(`🎼 TOTAL XP →                  ${ticker.xp} (LV ${ticker.lv})`);
        }
    }

    startXpDecay() {
        const XP_DECAY_PER_MINUTE = 6.67;
        const XP_MIN_FLOOR = 300;

        setInterval(() => {
            for (const [symbol, xpData] of this.xpState.entries()) {
                let { xp, lv } = xpData;

                if (xp > XP_MIN_FLOOR) {
                    xp -= XP_DECAY_PER_MINUTE;
                    xp = Math.max(xp, XP_MIN_FLOOR);

                    // 🔁 Recalculate level based on remaining XP
                    let newLv = lv;
                    let tempXp = xp;
                    while (newLv > 1 && tempXp < (newLv - 1) * 1000) {
                        newLv -= 1;
                        tempXp += newLv * 1000; // restore xp from the level drop
                    }

                    // 🔁 Store updated state
                    if (newLv !== lv) {
                        this.updateXp(symbol, xp, newLv);
                    } else {
                        this.xpState.set(symbol, { xp, lv });
                    }
                }
            }
        }, 60000); // decay every 1 minute
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
