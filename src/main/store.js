const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const { fetchHistoricalNews, subscribeToSymbolNews } = require("./collectors/news");
const { computeBuffsForSymbol, calculateVolumeImpact } = require("./utils/buffLogic");
const { DateTime } = require("luxon");

const path = require("path");
const fs = require("fs");

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
        log.warn("⚠️ Failed to load settings:", err.message);
        blockList = [];
        bullishList = [];
        bearishList = [];
    }

    try {
        const buffsRaw = fs.readFileSync(BUFFS_FILE, "utf-8");
        buffs = JSON.parse(buffsRaw);
    } catch (err) {
        log.warn("⚠️ Failed to load buffs:", err.message);
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

function asTime(v) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
}

function collapseMSVArray(arr) {
    if (!Array.isArray(arr)) return arr;
    if (arr.length === 0) return undefined;
    if (!arr.every((x) => x && typeof x === "object" && "value" in x)) return arr;

    // choose the item with latest updatedAt (or last item if no timestamps)
    let best = null;
    for (const it of arr) {
        const t = asTime(it.updatedAt);
        if (!best || t >= best.t) best = { t, v: it.value };
    }
    return best ? best.v : arr;
}

function deepLatest(value) {
    if (Array.isArray(value)) {
        // Try to collapse MSV; if not MSV, map children
        const collapsed = collapseMSVArray(value);
        if (collapsed !== value) return collapsed;
        return value.map(deepLatest);
    }
    if (value && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deepLatest(v);
        return out;
    }
    return value;
}

function normalizeSymbol(raw) {
    if (!raw || typeof raw !== "object") return raw;
    const flat = deepLatest(raw);
    if (flat.symbol) flat.symbol = String(flat.symbol).toUpperCase();
    return flat;
}

class Store extends EventEmitter {
    constructor() {
        super();
        log.log("Store instance initialized");

        loadSettingsAndBuffs();

        this.symbols = new Map();
        this.newsList = [];
        this.xpState = new Map();
        this.trackedTickers = [];

        this.user = {
            id: null,
            role: null,
            permissions: [],
            token: null,
            loggedInAt: null,
        };

        this._needsDailyReset = false;

        const today = getMarketDateString();
        const lastClear = loadStoreMeta();

        if (lastClear !== today) {
            this._needsDailyReset = true;
            this.xpState.clear();
            this.newsList = [];

            log.log("🧨 Full store reset at boot (new day)");

            this.emit("store-nuke");
            saveStoreMeta(today);
        } else {
            log.log("✅ Store is up to date — no daily reset needed");
        }

        this.startXpResetScheduler();
    }

    getTrackedTickers() {
        return this.trackedTickers.slice();
    }

    setTrackedTickers(list, maxLen = 25) {
        const up = (s) => String(s || "").toUpperCase();

        const clean = Array.isArray(list) ? list.map(up) : [];
        // dedupe in-order + cap
        const seen = new Set();
        const next = [];
        for (const s of clean) {
            if (!seen.has(s)) {
                seen.add(s);
                next.push(s);
                if (next.length >= (Number(maxLen) || 25)) break;
            }
        }

        // no change? bail
        const same = next.length === this.trackedTickers.length && next.every((v, i) => v === this.trackedTickers[i]);
        if (same) return this.trackedTickers;

        this.trackedTickers = next;
        this.emit("tracked-update", this.trackedTickers);
        return this.trackedTickers;
    }

    getBuffFromJson(key) {
        return buffs.find((b) => b.key === key);
    }

    nuke() {
        this.xpState.clear();
        this.newsList = [];

        log.warn("🔥 Manual nuke: Store state cleared");

        this.emit("store-nuke");
    }

    applyFull(items, version = 0) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return;

        const prev = this.symbols;
        const next = new Map();

        for (const raw of list) {
            const s = normalizeSymbol(raw);
            if (!s?.symbol) continue;

            const old = prev.get(s.symbol) || {};
            const sessionCarry = {
                xp: old.xp ?? 0,
                lv: old.lv ?? 1,
                totalXpGained: old.totalXpGained ?? 0,
                firstXpTimestamp: old.firstXpTimestamp,
                lastEvent: old.lastEvent,
                buffs: old.buffs ?? computeBuffsForSymbol(s, buffs, blockList),
            };
            next.set(s.symbol, { ...s, ...sessionCarry });
        }

        this.symbols = next;

        // ⬇️ Match old behavior
        if (isDevelopment) {
            const keys = Array.from(this.symbols.keys());
            subscribeToSymbolNews(keys);
            (async () => {
                for (const symbol of keys) {
                    await fetchHistoricalNews(symbol);
                    await sleep(200);
                }
            })();
        }

        this.emit("lists-update");
    }

    addSymbols(items = []) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return;

        const prev = this.symbols;
        let changed = false;
        const newlyAdded = [];

        for (const raw of list) {
            const s = normalizeSymbol(raw);
            if (!s?.symbol) continue;

            const old = prev.get(s.symbol) || {};
            const sessionCarry = {
                xp: old.xp ?? 0,
                lv: old.lv ?? 1,
                totalXpGained: old.totalXpGained ?? 0,
                firstXpTimestamp: old.firstXpTimestamp,
                lastEvent: old.lastEvent,
                buffs: old.buffs ?? computeBuffsForSymbol(s, buffs, blockList),
            };

            const nextVal = { ...s, ...sessionCarry };
            if (!prev.has(s.symbol)) newlyAdded.push(s.symbol);

            prev.set(s.symbol, nextVal);
            changed = true;
        }

        if (newlyAdded.length) {
            subscribeToSymbolNews(newlyAdded);
            (async () => {
                for (const sym of newlyAdded) {
                    await fetchHistoricalNews(sym);
                    await sleep(200);
                }
            })();
        }

        if (changed) this.emit("lists-update");
    }

    addEvent(alert) {
        try {
            const symbol = alert.hero;
            const price = alert.price;
            const volume = alert.one_min_volume ?? 0;

            if (!symbol || price === undefined || volume === undefined) {
                log.warn(`[addEvent] Missing required fields for symbol ${symbol || "unknown"}.`);
                return;
            }

            if (debug) log.log(`[addEvent] Processing alert for ${symbol}`);

            const direction = alert.hp > 0 ? "UP" : alert.dp > 0 ? "DOWN" : "NEUTRAL";
            const change_percent = alert.hp || alert.dp || 0;

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

            // Merge & normalize the alert
            const mergedData = {
                ...baseData,
                Symbol: symbol,
                Price: price,
                Direction: direction || "UNKNOWN",
                // alertChangePercent: Math.abs(change_percent).toFixed(2),
                // cumulativeUpChange: (baseData.cumulativeUpChange || 0) + (direction === "UP" ? parseFloat(change_percent.toFixed(2)) : 0),
                // cumulativeDownChange: (baseData.cumulativeDownChange || 0) + (direction === "DOWN" ? parseFloat(change_percent.toFixed(2)) : 0),
                // fiveMinVolume: volume,
            };

            this.symbols.set(symbol, mergedData);

            // Apply RPG-style buffs + event metadata
            const isHighOfDay = alert.isHighOfDay === true;
            this.applyRpgEventMeta(symbol, alert, isHighOfDay);

            // Emit general update
            this.emit("lists-update");
        } catch (error) {
            log.error(`[addEvent] Failed to process event: ${error.message}`);
        }
    }

    requiredTotalXpForLevel(level) {
        if (level <= 1) return 0;
        return ((level - 1) * level * 10_000) / 2;
    }

    calculateXp(ticker, event) {
        // backend already did: xp = round(price * (hp|dp) * strength * penalties)
        const xp = Number.isFinite(event?.xp) ? Math.max(0, Math.round(event.xp)) : 0;
        if (xp === 0) return;

        // normalize existing values to ints (optional safety)
        ticker.totalXpGained = Math.trunc(ticker.totalXpGained ?? 0) + xp;
        ticker.xp = Math.trunc(ticker.xp ?? 0) + xp;
        ticker.lv = Math.max(1, Math.trunc(ticker.lv ?? 1));

        // level up as many steps as needed
        while (ticker.totalXpGained >= this.requiredTotalXpForLevel(ticker.lv + 1)) {
            ticker.lv += 1;
            if (debug) log.log(`✨ ${ticker.symbol} leveled up to LV ${ticker.lv}!`);
        }

        if (debugXp) {
            const hp = event.hp || 0,
                dp = event.dp || 0,
                strength = event.strength || 0;
            log.log(`⚡ [${ticker.symbol}] XP +${xp} | hp:${hp.toFixed(2)} dp:${dp.toFixed(2)} strength:${strength.toLocaleString()}`);
        }
    }

    applyRpgEventMeta(symbol, alert) {
        const ticker = this.symbols.get(symbol);
        if (!ticker) return;

        this.calculateXp(ticker, alert); // this mutates ticker.xp/totalXpGained/lv
        ticker.firstXpTimestamp = ticker.firstXpTimestamp || Date.now();

        // 🔊 buffs
        ticker.buffs = ticker.buffs || {};
        ticker.buffs.volume = calculateVolumeImpact(alert.one_min_volume, alert.price, buffs);

        // if (ticker.lastEvent) {
        //     if (ticker.lastEvent.dp > 0 && alert.hp > 0) {
        //         const bounceBuff = this.getBuffFromJson("bounceBack");
        //         if (bounceBuff) ticker.buffs.bounceBack = bounceBuff;
        //     } else {
        //         delete ticker.buffs.bounceBack;
        //     }
        // } else {
        //     delete ticker.buffs.bounceBack;
        // }

        // Use alert directly (no transform)
        ticker.lastEvent = {
            hp: alert.hp || 0,
            dp: alert.dp || 0,
            xp: Math.max(0, Math.round(alert.xp || 0)),
        };

        if (alert.isHighOfDay) {
            const highBuff = this.getBuffFromJson("newHigh");
            if (highBuff) ticker.buffs.newHigh = highBuff;
        } else {
            delete ticker.buffs.newHigh;
        }

        if (debugXp) {
            log.log(`[store] ${symbol} about to emit:`, {
                xp: ticker.xp,
                totalXpGained: ticker.totalXpGained,
                xpAdded: Math.max(0, Math.round(alert.xp || 0)),
            });
        }

        this.emit("hero-updated", {
            hero: symbol,
            buffs: ticker.buffs,
            highestPrice: ticker.highestPrice,
            lastEvent: ticker.lastEvent,
            xp: ticker.xp,
            lv: ticker.lv,
            price: ticker.Price || ticker.price || 0,
            totalXpGained: ticker.totalXpGained || 0,
            firstXpTimestamp: ticker.firstXpTimestamp || Date.now(),
        });

        this.xpState.set(symbol, {
            xp: ticker.totalXpGained || 0,
            lv: ticker.lv || 1,
        });

        if (debug) log.log(`[store] Emitted hero-updated for: ${symbol}`);
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
        // log.log(`[addNews] called for ${symbol}`);

        const existingIds = new Set(this.newsList.map((n) => n.id));
        const existingHeadlines = new Set(this.newsList.map((n) => n.headline));

        const filteredNews = newsItems.filter((news) => {
            if (existingIds.has(news.id)) return false;
            if (existingHeadlines.has(news.headline)) return false;

            // ⛔ Block multi-symbol news
            if (news.symbols.length > 1) {
                // log.log(`[addNews] Skipping multi-symbol headline: "${news.headline}"`);
                return false;
            }

            // ⛔ Block by blockList
            const sanitized = news.headline.toLowerCase().trim();
            const isBlocked = blockList.some((word) => sanitized.includes(word.toLowerCase().trim()));
            if (isBlocked) {
                // log.log(`[addNews] Blocked by blockList: "${news.headline}"`);
                return false;
            }

            return true;
        });

        if (filteredNews.length === 0) {
            // log.log("[addNews] No new news items to process.");
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
                if (newsBuff.key === "hasBullishNews") {
                    delete ticker.buffs["hasBearishNews"];
                } else if (newsBuff.key === "hasBearishNews") {
                    delete ticker.buffs["hasBullishNews"];
                }

                // Apply only if not already both
                const hasBullish = "hasBullishNews" in ticker.buffs;
                const hasBearish = "hasBearishNews" in ticker.buffs;

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
                // log.log(`[buffs] ${newsBuff.icon} ${newsBuff.key} added for: ${sym}`);
            });
        });

        this.emit("newsUpdated", { newsItems: timestampedNews });
        this.emit("lists-update");
    }

    getAllNews() {
        // log.log("[getAllNews] called");
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

        // log.log(`[XP] Updated ${symbol}: XP ${xp}, LV ${lv}`);
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

    startXpResetScheduler() {
        const resetTimes = ["03:59", "09:29", "14:30"]; // EST times

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

    resetXpAndLv({ quiet = false } = {}) {
        for (const [symbol, ticker] of this.symbols) {
            if (!ticker) continue;
            ticker.xp = 0;
            ticker.lv = 1;
            ticker.totalXpGained = 0;
            ticker.firstXpTimestamp = undefined;

            if (quiet) {
                this.xpState.set(symbol, { xp: 0, lv: 1 });
            } else {
                this.updateXp(symbol, 0, 1); // emits per-symbol event
            }
        }
        this.emit("xp-reset");
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
