const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const async = require("async");
const store = require("../store");
require("dotenv").config();
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);

const CACHE_FILE = path.join(__dirname, "../../data/alpha_data.json");
const COOLDOWN_PERIOD = 5 * 60 * 1000 + 1000; // 5 minutes 1 second
const REQUEST_TIMEOUT = 10000; // 10 seconds
const RETRY_DELAY = 60000; // 1 minute

// ❶ Cache Management Improvements
let cache = {};
let cacheDirty = false;
let cacheSaveTimeout = null;

const initializeCache = () => {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            cache = fs.readJsonSync(CACHE_FILE);
            log.info(`Loaded cache with ${Object.keys(cache).length} entries`);
        }
    } catch (error) {
        log.error("Cache initialization failed:", error);
    }
};
initializeCache();

// ❷ Optimized API Key Management
const API_KEYS = Object.values(process.env)
    .filter((_, key) => key.startsWith("ALPHA_VANTAGE_API_KEY"))
    .filter(Boolean);

if (API_KEYS.length === 0) {
    log.error("No API keys found in environment variables!");
    process.exit(1);
}

let currentKeyIndex = 0;
const getNextAPIKey = () => {
    const nextIndex = (currentKeyIndex + 1) % API_KEYS.length;
    currentKeyIndex = API_KEYS[nextIndex] ? nextIndex : 0;
    return API_KEYS[currentKeyIndex];
};

// ❸ Enhanced Rate Limiting
let cooldownTimer = null;
const rateLimitState = {
    limited: false,
    endTime: null,
};

const checkRateLimit = () => {
    if (rateLimitState.limited && Date.now() < rateLimitState.endTime) {
        const remaining = Math.ceil((rateLimitState.endTime - Date.now()) / 1000);
        log.warn(`Rate limited: ${remaining}s remaining`);
        return true;
    }
    rateLimitState.limited = false;
    return false;
};

// ❹ Batched Cache Writing
const saveCache = (immediate = false) => {
    if (!cacheDirty) return;

    if (cacheSaveTimeout) clearTimeout(cacheSaveTimeout);
    
    const write = () => {
        fs.writeJsonSync(CACHE_FILE, cache, { spaces: 2 });
        cacheDirty = false;
        log.debug("Cache saved successfully");
    };

    immediate ? write() : cacheSaveTimeout = setTimeout(write, 5000);
};

// ❺ Improved Queue Configuration
const requestQueue = async.queue(async (ticker, callback) => {
    log.debug(`Processing ${ticker} | Queue size: ${requestQueue.length()}`);
    
    try {
        const data = await fetchAlphaVantageData(ticker);
        
        if (data) {
            log.info(`Fetched ${ticker}`);
            callback();
            return;
        }

        log.warn(`Failed ${ticker}, scheduling retry...`);
        setTimeout(() => {
            requestQueue.unshift(ticker);
            log.debug(`Requeued ${ticker} after delay`);
        }, RETRY_DELAY);

    } finally {
        saveCache();
    }
}, 1); // Maintain 1 concurrent request

// ❻ Enhanced Request Handling
const fetchAlphaVantageData = async (ticker) => {
    if (checkRateLimit()) return null;

    let attempts = 0;
    const startTime = Date.now();

    while (attempts < API_KEYS.length) {
        const API_KEY = getNextAPIKey();
        const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;

        try {
            const response = await axios.get(url, { timeout: REQUEST_TIMEOUT });
            const { data } = response;

            if (data.Note?.includes("rate limit")) {
                log.warn(`Rate limit hit on ${API_KEY.substring(0, 6)}...`);
                attempts++;
                continue;
            }

            if (!data?.Symbol) {
                log.warn(`Invalid response for ${ticker}`);
                delete cache[ticker]; // ❼ Clean invalid entries
                cacheDirty = true;
                return null;
            }

            if (JSON.stringify(cache[ticker]) !== JSON.stringify(data)) {
                cache[ticker] = data;
                cacheDirty = true;
                store.updateOverview(ticker, { overview: data });
            }

            return data;
        } catch (error) {
            if (error.response?.status === 429) {
                activateCooldown();
                return null;
            }
            log.error(`API Error (${API_KEY.substring(0, 6)}...):`, error.message);
        }
        
        attempts++;
    }

    if (attempts >= API_KEYS.length) {
        activateCooldown();
    }
    return null;
};

// ❽ Centralized Cooldown Management
const activateCooldown = () => {
    if (rateLimitState.limited) return;

    rateLimitState.limited = true;
    rateLimitState.endTime = Date.now() + COOLDOWN_PERIOD;
    
    log.warn(`Activating cooldown until ${new Date(rateLimitState.endTime).toLocaleTimeString()}`);
    
    requestQueue.pause();
    setTimeout(() => {
        rateLimitState.limited = false;
        requestQueue.resume();
        log.info("Cooldown expired, resuming operations");
    }, COOLDOWN_PERIOD);
};

// ❾ Cache Interface
const searchCache = (ticker) => {
    if (cache[ticker]) {
        log.debug(`[CACHE] Serving ${ticker}`);
        store.updateOverview(ticker, { overview: cache[ticker] });
        return true;
    }
    log.debug(`[CACHE] Miss ${ticker}`);
    return false;
};

// ❿ Queue Interface
const queueRequest = (ticker) => {
    if (requestQueue.length() > 1000) {
        log.error("Queue overload! Rejecting new requests");
        return;
    }
    
    if (!searchCache(ticker)) {
        requestQueue.push(ticker);
        log.debug(`Queued ${ticker} (${requestQueue.length()} pending)`);
    }
};

// Save cache on exit
process.on("exit", () => saveCache(true));
process.on("SIGINT", () => process.exit());

module.exports = { searchCache, queueRequest };