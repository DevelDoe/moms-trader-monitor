const EventEmitter = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
// const { fetchHistoricalNews, subscribeToSymbolNews } = require("../../dump/news"); // Removed - news now handled by oracle.js
const { computeBuffsForSymbol, calculateVolumeImpact } = require("./utils/buffLogic");
const { DateTime } = require("luxon");

// Import news store functions
let getBlockList, getBullishList, getBearishList;
try {
    const newsStore = require("./electronStores");
    getBlockList = newsStore.getBlockList;
    getBullishList = newsStore.getBullishList;
    getBearishList = newsStore.getBearishList;
} catch (err) {
    log.warn("⚠️ Could not import news store functions:", err.message);
    getBlockList = () => [];
    getBullishList = () => [];
    getBearishList = () => [];
}

const path = require("path");
const fs = require("fs");

const isDevelopment = process.env.NODE_ENV === "development";

const debugXp = false;
const debug = false;

// ✅ Declare SETTINGS_FILE before logging it
const SETTINGS_FILE = isDevelopment ? path.join(__dirname, "../data/settings.dev.json") : path.join(require("electron").app.getPath("userData"), "settings.json");

const BUFFS_FILE = path.join(__dirname, "../data/buffs.json");

let buffs = [];

function loadSettingsAndBuffs() {
    try {
        const buffsRaw = fs.readFileSync(BUFFS_FILE, "utf-8");
        buffs = JSON.parse(buffsRaw);
    } catch (err) {
        log.warn("⚠️ Failed to load buffs:", err.message);
        buffs = [];
    }
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
        this.xpState = new Map();
        this.trackedTickers = [];
        this.hodTopList = [];
        this._newsHydrationComplete = false; // Track when news hydration is done

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
        this.hodTopList = [];

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
                buffs: old.buffs ?? this._computeBuffsForSymbol(s, false), // Skip news buffs during initial load
            };
            next.set(s.symbol, { ...s, ...sessionCarry });
        }

        this.symbols = next;

        // ⬇️ News now handled by oracle.js - no longer subscribing to Alpaca news here
        // if (!isDevelopment) {
        //     const keys = Array.from(this.symbols.keys());
        //     subscribeToSymbolNews(keys);
        //     (async () => {
        //         for (const symbol of keys) {
        //             await fetchHistoricalNews(symbol);
        //             await sleep(200);
        //         }
        //     })();
        // }

        this.emit("lists-update");
    }

    addSymbols(items = []) {
        log.log(`[addSymbols] Hydrated ${items.length} new symbol(s):`, items);

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
                buffs: old.buffs ?? this._computeBuffsForSymbol(s, false), // Skip news buffs during initial load
            };

            const nextVal = { ...s, ...sessionCarry };
            if (!prev.has(s.symbol)) newlyAdded.push(s.symbol);

            prev.set(s.symbol, nextVal);
            changed = true;
        }

        if (newlyAdded.length) {
            // News now handled by oracle.js - no longer subscribing to Alpaca news here
            // subscribeToSymbolNews(newlyAdded);
            // (async () => {
            //     for (const sym of newlyAdded) {
            //         await fetchHistoricalNews(sym);
            //         await sleep(200);
            //     }
            // })();
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

    attachNewsToSymbol(newsItem, symbol) {
        const ticker = this.symbols.get(symbol);
        if (!ticker) {
            // log.log(`[attachNewsToSymbol] Symbol '${symbol}' not found in store`);
            return;
        }

        // Attach news to symbol
        ticker.News = ticker.News || [];
        if (!ticker.News.some((n) => n.id === newsItem.id)) {
            ticker.News.push(newsItem);
            log.log(`📰 [STORE] Attached news to ${symbol}: "${newsItem.headline?.substring(0, 50)}..."`);
        }

        // Recompute all buffs for this symbol (including news sentiment)
        log.log(`🔄 [STORE] Recomputing buffs for ${symbol} after news attachment`);
        this.recomputeBuffsForSymbol(symbol);
    }

    _computeBuffsForSymbol(symbolData, includeNews = true) {
        // Skip news buff computation during initial loading to avoid flooding logs
        const skipNewsIfNoData = !includeNews || !this._newsHydrationComplete;
        return computeBuffsForSymbol(symbolData, buffs, getBlockList(), skipNewsIfNoData);
    }

    recomputeBuffsForSymbol(symbol) {
        const ticker = this.symbols.get(symbol);
        if (!ticker) return;

        // Recompute all buffs using the main buff system
        const newBuffs = this._computeBuffsForSymbol(ticker, true);
        
        // Debug: Log if news buff was computed (only for news buffs to reduce noise)
        if (newBuffs.news) {
            log.log(`🎯 [STORE] ${symbol} got news buff: ${newBuffs.news.key} (${newBuffs.news.desc})`);
        }
        
        // Update the ticker's buffs
        ticker.buffs = newBuffs;
        this.symbols.set(symbol, ticker);

        // Emit buff update
        this.emit("buffs-updated", [
            {
                symbol: symbol,
                buffs: ticker.buffs,
                highestPrice: ticker.highestPrice,
                lastEvent: ticker.lastEvent,
            },
        ]);
        
        // Only log buff updates for symbols with news buffs to reduce noise
        if (newBuffs.news) {
            log.log(`📤 [STORE] Emitted buffs-updated for ${symbol} with ${Object.keys(newBuffs).length} buffs (including news buff)`);
        }
    }

    attachFilingToSymbol(filingItem, symbol) {
        const ticker = this.symbols.get(symbol);
        if (!ticker) {
            // log.log(`[attachFilingToSymbol] Symbol '${symbol}' not found in store`);
            return;
        }

        // Attach filing to symbol
        ticker.Filings = ticker.Filings || [];
        if (!ticker.Filings.some((f) => f.id === filingItem.id)) {
            ticker.Filings.push(filingItem);
        }

        // Recompute all buffs for this symbol (including filing buff)
        this.recomputeBuffsForSymbol(symbol);
    }

    clearAllNews() {
        log.log("[clearAllNews] Clearing all news data from all symbols");
        let clearedCount = 0;
        
        for (const [symbol, ticker] of this.symbols) {
            if (ticker.News && ticker.News.length > 0) {
                ticker.News = [];
                clearedCount++;
                // Recompute buffs since news affects sentiment
                this.recomputeBuffsForSymbol(symbol);
            }
        }
        
        log.log(`[clearAllNews] Cleared news from ${clearedCount} symbols`);
        this.emit("news-cleared");
    }

    markNewsHydrationComplete() {
        this._newsHydrationComplete = true;
        log.log("✅ [STORE] News hydration complete - news buffs will now be computed for all symbols");
    }

    clearAllFilings() {
        log.log("[clearAllFilings] Clearing all filing data from all symbols");
        let clearedCount = 0;
        
        for (const [symbol, ticker] of this.symbols) {
            if (ticker.Filings && ticker.Filings.length > 0) {
                ticker.Filings = [];
                clearedCount++;
                // Recompute buffs since filings affect sentiment
                this.recomputeBuffsForSymbol(symbol);
            }
        }
        
        log.log(`[clearAllFilings] Cleared filings from ${clearedCount} symbols`);
        this.emit("filings-cleared");
    }

    fetchNews() {
        // News now handled by oracle.js - no longer subscribing to Alpaca news here
        log.log(`[fetchNews] News fetching now handled by oracle.js`);
        // const symbols = Array.from(this.symbols.keys());
        // subscribeToSymbolNews(symbols);
        // log.log(`[subscribeToNews] Subscribed to news for ${symbols.length} symbols.`);
        // (async () => {
        //     for (const symbol of this.symbols.keys()) {
        //         await fetchHistoricalNews(symbol);
        //         await sleep(200); // ⏳ Add 500ms delay between requests
        //     }
        // })();
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
        const resetTimes = ["04:00", "09:30", "15:00", "16:00"]; // EST times

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

    updateTrophyData(trophyData) {
        // log.log(`[updateTrophyData] Received trophy data:`, trophyData);
        this.trophyData = trophyData;
        this.emit("trophy-updated", trophyData);
    }

    getTrophyData() {
        return this.trophyData || [];
    }

    updateHodTopList(hodList) {
        if (!Array.isArray(hodList)) {
            log.warn("[updateHodTopList] Invalid HOD list data received");
            return;
        }

        this.hodTopList = hodList;
        // log.log(`[updateHodTopList] Updated HOD list with ${hodList.length} symbols`);
        
        // Emit event for any listeners
        this.emit("hod-list-updated", hodList);
    }

    updateHodPrice(priceData) {
        if (!priceData || (!priceData.symbol && !priceData.name)) {
            log.warn("[updateHodPrice] Invalid price data received");
            return;
        }

        const symbol = (priceData.symbol || priceData.name || '').toUpperCase();
        if (!symbol) {
            log.warn("[updateHodPrice] No valid symbol in price data");
            return;
        }

        // Find the symbol in the HOD list and update its price
        const hodItem = this.hodTopList.find(item => 
            (item.symbol || item.name || '').toUpperCase() === symbol
        );

        if (hodItem) {
            // Update price and related fields
            if (Number.isFinite(priceData.price)) {
                hodItem.price = priceData.price;
            }
            
            // Update session high if provided and higher than current
            if (Number.isFinite(priceData.session_high) && priceData.session_high > (hodItem.session_high || 0)) {
                hodItem.session_high = priceData.session_high;
            }
            
            // Update percentage below high if provided
            if (Number.isFinite(priceData.pct_below_high)) {
                hodItem.pct_below_high = priceData.pct_below_high;
            } else if (Number.isFinite(hodItem.session_high) && hodItem.session_high > 0) {
                // Calculate percentage below high if not provided
                hodItem.pct_below_high = ((hodItem.session_high - hodItem.price) / hodItem.session_high) * 100;
            }
            
            // Update at_high flag if provided
            if (typeof priceData.at_high === 'boolean') {
                hodItem.at_high = priceData.at_high;
            }
            
            // Update last_updated timestamp if provided
            if (Number.isFinite(priceData.last_updated)) {
                hodItem.last_updated = priceData.last_updated;
            }

            // log.log(`[updateHodPrice] Updated ${symbol} price to $${priceData.price} (${hodItem.pct_below_high?.toFixed(2)}% below high)`);
            
            // Emit event for any listeners
            this.emit("hod-price-updated", priceData);
        } else {
            // log.log(`[updateHodPrice] Price update for ${symbol} - not in current HOD list`);
        }
    }

    getHodTopList() {
        return this.hodTopList.slice(); // Return a copy
    }
}

// Singleton instance
const tickerStore = new Store();
module.exports = tickerStore;
