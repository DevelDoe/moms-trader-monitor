const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const { fetchHistoricalNews, subscribeToSymbolNews } = require("./collectors/news");
const { computeBuffsForSymbol, calculateVolumeImpact, getHeroBuff } = require("./utils/buffLogic");
const { DateTime } = require("luxon");

const path = require("path");
const fs = require("fs");
const os = require("os");

const isDevelopment = process.env.NODE_ENV === "development";

const debugXp = false;
const debug = false;

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

function getNewsSentimentBuff(headline, buffList, bullishList, bearishList, blockList = []) {
    const lower = headline.toLowerCase();

    // Blocked?
    if (blockList.some((term) => lower.includes(term.toLowerCase()))) {
        return null;
    }

    const isBullish = bullishList.some((term) => lower.includes(term.toLowerCase()));
    const isBearish = bearishList.some((term) => lower.includes(term.toLowerCase()));

    if (isBullish && isBearish) {
        // Cancel out — return neutral
        return (
            buffList.find((b) => b.key === "hasNews") || {
                key: "hasNews",
                icon: "😼",
                desc: "Catalyst in play — recent news may affect momentum",
                score: 200,
                isBuff: true,
            }
        );
    }

    if (isBullish) {
        return (
            buffList.find((b) => b.key === "hasBullishNews") || {
                key: "hasBullishNews",
                icon: "😺",
                desc: "Bullish news - may affect momentum",
                score: 300,
                isBuff: true,
            }
        );
    }

    if (isBearish) {
        return (
            buffList.find((b) => b.key === "hasBearishNews") || {
                key: "hasBearishNews",
                icon: "🙀",
                desc: "Bearish news - may affect momentum",
                score: -200,
                isBuff: false,
            }
        );
    }

    // No sentiment, but still relevant
    return (
        buffList.find((b) => b.key === "hasNews") || {
            key: "hasNews",
            icon: "😼",
            desc: "Catalyst in play — recent news may affect momentum",
            score: 200,
            isBuff: true,
        }
    );
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
        this.newsList = [];
        this.xpState = new Map();

        const today = getMarketDateString();
        const lastClear = loadStoreMeta();

        if (lastClear !== today) {
            this.xpState.clear();
            this.newsList = [];
            log.log("🧨 Full store reset at boot (new day)");

            this.emit("store-nuke");
            saveStoreMeta(today);
        } else {
            log.log("✅ Store is up to date — no daily reset needed");
        }

        // ✅ Start the XP reset timer!
        this.startXpResetScheduler();
    }

    getBuffFromJson(key) {
        return buffs.find((b) => b.key === key);
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

    addEvent(alert) {
        try {
            const { symbol, direction, change_percent, price, volume } = alert;

            if (!symbol || price === undefined || volume === undefined) {
                log.warn(`[addEvent] Missing required fields for symbol ${symbol || "unknown"}.`);
                return;
            }

            if (debug) log.log(`[addEvent] Processing alert for ${symbol}`);

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

        const event = this.transformToFocusEvent(alert);

        ticker.lastEvent = {
            hp: event.hp,
            dp: event.dp,
            xp: alert.volume || 0,
        };

        const xpDelta = this.calculateXp(ticker, event);

        ticker.firstXpTimestamp = ticker.firstXpTimestamp || Date.now();
        ticker.totalXpGained = (ticker.totalXpGained || 0) + xpDelta;

        ticker.buffs = ticker.buffs || {};
        ticker.buffs.volume = calculateVolumeImpact(alert.volume, alert.price, buffs);

        // ✅ Use buff.json for bounceBack
        if (event.dp > 0 && event.hp > 0) {
            const bounceBuff = this.getBuffFromJson("bounceBack");
            if (bounceBuff) ticker.buffs.bounceBack = bounceBuff;
        } else {
            delete ticker.buffs.bounceBack;
        }

        // ✅ Use buff.json for newHigh
        if (isNewHigh) {
            const highBuff = this.getBuffFromJson("newHigh");
            if (highBuff) ticker.buffs.newHigh = highBuff;
        } else {
            delete ticker.buffs.newHigh;
        }

        if (debugXp)
            log.log(`[store] ${symbol} about to emit:`, {
                xp: ticker.xp,
                totalXpGained: ticker.totalXpGained,
                calculatedXpDelta: xpDelta,
            });

        this.emit("hero-updated", [
            {
                hero: symbol,
                buffs: ticker.buffs,
                highestPrice: ticker.highestPrice,
                lastEvent: ticker.lastEvent,
                xp: ticker.xp,
                lv: ticker.lv,
                price: ticker.Price || ticker.price || 0,
                totalXpGained: ticker.totalXpGained || 0,
                firstXpTimestamp: ticker.firstXpTimestamp || Date.now(), // fallback to now just in case
            },
        ]);

        // 🧠 ADD THIS:
        this.xpState.set(symbol, {
            xp: ticker.totalXpGained || 0,
            lv: ticker.lv || 1,
        });

        if (debug) log.log(`[store] Emitted hero-updated for: ${event.hero}`);
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
    }

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
            const newsBuff = getNewsSentimentBuff(newsItem.headline, buffs, bullishList, bearishList, blockList);

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
                ticker.buffs = ticker.buffs || {};

                // Remove any existing opposing news buff first
                if (newsBuff.key === "bullishNews") {
                    delete ticker.buffs["bearishNews"];
                } else if (newsBuff.key === "bearishNews") {
                    delete ticker.buffs["bullishNews"];
                }

                // Apply only if not already both
                const hasBullish = "bullishNews" in ticker.buffs;
                const hasBearish = "bearishNews" in ticker.buffs;

                if (!(hasBullish && hasBearish)) {
                    ticker.buffs[newsBuff.key] = newsBuff;
                }

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

    updateXp(symbol, xp, lv) {
        this.xpState.set(symbol, { xp, lv });

        log.log(`[XP] Updated ${symbol}: XP ${xp}, LV ${lv}`);
        this.emit("xp-updated", { symbol, xp, lv });
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

    applyFloatAdjustment(baseXp, floatShares) {
        const safeFloat = floatShares || 1_000_000;

        if (safeFloat < 1_000_000) {
            // 📈 Small float (<1M): Slight XP boost up to +15%
            const scale = 1.0 + ((1_000_000 - safeFloat) / 1_000_000) * 0.15;
            const cappedScale = Math.min(scale, 1.15); // Max boost = +15%
            return Math.round(baseXp * cappedScale);
        } else if (safeFloat >= 100_000_000) {
            // 📉 Large float (>100M): Max XP reduction −10%
            return Math.round(baseXp * 0.9);
        } else {
            // 📉 Smooth curve (1M–100M): Linearly reduce XP up to −10%
            const scale = 1.0 - ((safeFloat - 1_000_000) / 99_000_000) * 0.1;
            return Math.round(baseXp * scale);
        }
    }

    calculateXp(ticker, event) {
        const hp = event.hp || 0;
        const dp = event.dp || 0;
        const totalMove = hp + dp;
        const strength = event.strength || 0;

        // 🚨 NEW: Require minimum strength
        const minimumStrength = 1000; // adjust this threshold as needed
        if (strength < minimumStrength) {
            if (debugXp) {
                console.log(`⚡ [${ticker.symbol}] Skipped XP gain - Strength too low (${strength})`);
            }
            return 0; // No XP awarded
        }

        let baseXp = totalMove * 10;

        // 📈 Apply volume buff (existing)
        const volumeBuff = getHeroBuff(ticker, "volume");
        const volMult = volumeBuff?.multiplier ?? 1;
        baseXp = baseXp * volMult;

        // 🧠 NEW: Apply float adjustment
        const floatShares = ticker.floatValue || 1_000_000; // default safe fallback
        const finalXp = this.applyFloatAdjustment(baseXp, floatShares);

        // 📚 Store XP
        ticker.totalXpGained = (ticker.totalXpGained || 0) + finalXp;
        ticker.xp = (ticker.xp || 0) + finalXp;

        ticker.lv = Math.max(1, ticker.lv || 1);

        const getRequiredXp = (level) => {
            if (level <= 1) return 0;
            let requiredXp = 0;
            for (let i = 1; i < level; i++) {
                requiredXp += i * 1000;
            }
            return requiredXp;
        };

        let requiredXp = getRequiredXp(ticker.lv + 1);

        while (ticker.totalXpGained >= requiredXp) {
            ticker.lv += 1;
            requiredXp = getRequiredXp(ticker.lv + 1);
            if (debug) console.log(`✨ ${ticker.symbol} leveled up to LV ${ticker.lv}!`);
        }

        if (debugXp) {
            console.log(`⚡⚡⚡ [${ticker.symbol}] XP BREAKDOWN ⚡⚡⚡`);
            console.log(`📜 ALERT → HP: ${hp.toFixed(2)} | DP: ${dp.toFixed(2)} | Strength: ${strength.toLocaleString()}`);
            console.log(`💖 Base XP                     ${baseXp.toFixed(2)}`);
            if (volumeBuff?.desc) {
                console.log(`🏷️ Buff: ${volumeBuff.desc.padEnd(26)} x${volMult.toFixed(2)}`);
            }
            console.log(`⚖️ Float Factor                Float: ${floatShares.toLocaleString()} Adjusted XP: ${finalXp}`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log(`🎯 XP GAINED                   ${finalXp}`);
            console.log(`🎼 CURRENT LV →                ${ticker.lv}`);
            console.log(`🎼 TOTAL XP →                  ${ticker.totalXpGained}`);
        }

        return finalXp;
    }

    startXpResetScheduler() {
        const resetTimes = ["03:59", "09:29", "15:59"]; // EST times

        setInterval(() => {
            // Get current time in America/New_York
            const now = DateTime.now().setZone("America/New_York");
            const current = now.toFormat("HH:mm"); // Always "HH:mm"

            if (resetTimes.includes(current)) {
                log.log(`🔄 XP Reset triggered at ${current} EST`);
                this.resetXpAndLv();
            }
        }, 60_000); // Check every minute
    }

    resetXpAndLv() {
        log.log("🧹 Resetting XP and LV for all tickers");

        for (const symbol of this.symbols.keys()) {
            const ticker = this.symbols.get(symbol);
            if (!ticker) continue;

            ticker.xp = 0;
            ticker.lv = 1;
            ticker.totalXpGained = 0;

            this.updateXp(symbol, 0, 1);
        }

        this.xpState.clear();
        this.emit("xp-reset");
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
