const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const async = require("async");
require("dotenv").config(); // Load .env variables
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);

const fs = require("fs-extra");

const CACHE_DIR = path.join(app.getPath("userData"), "data"); // Store cache in user data
const CACHE_FILE = path.join(CACHE_DIR, "alpha_data.json");

fs.ensureDirSync(CACHE_DIR); // Ensure data folder exists

// ✅ Load cache if it exists
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
    try {
        cache = fs.readJsonSync(CACHE_FILE);
    } catch (error) {
        console.error("Error reading Alpha Vantage cache:", error);
        cache = {}; // Reset cache if corrupted
    }
}


// ✅ Extract and validate API keys
const API_KEYS = (() => {
    try {
        const keys = Object.entries(process.env)
            .filter(([key]) => key.startsWith("ALPHA_VANTAGE_API_KEY"))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, value]) => value?.trim())
            .filter(Boolean);

        if (!keys.length) throw new Error("No valid API keys found");
        return keys;
    } catch (error) {
        log.error("API Key Configuration Error:", error.message);
        process.exit(1);
    }
})();

let currentKeyIndex = 0;
let lastRateLimitTime = null;

// ✅ Get the next API key (rotates between keys)
function getNextAPIKey() {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    return API_KEYS[currentKeyIndex];
}

// ✅ Save cache to file
function saveCache() {
    try {
        fs.writeJsonSync(CACHE_FILE, cache, { spaces: 2 });
    } catch (error) {
        log.error("Error saving Alpha Vantage cache:", error);
    }
}

// ✅ Check if rate limit is active
// Modified isRateLimited function
function isRateLimited() {
    if (!lastRateLimitTime) return false;

    const remaining = Math.max(0, lastRateLimitTime + COOLDOWN_PERIOD - Date.now());
    
    if (remaining > 0) {
        log.warn(`Cooldown active: ${Math.round(remaining/1000)}s remaining`);
        return true;
    }
    
    // Auto-reset when cooldown expires
    lastRateLimitTime = null;
    return false;
}

// ✅ Queue system for delaying requests
const requestQueue = async.queue(async (ticker, callback) => {
    log.log(`Processing ticker: ${ticker} | Queue size before: ${requestQueue.length()}`);

    const data = await fetchAlphaVantageData(ticker);

    if (data) {
        log.log(`Successfully fetched ${ticker}.`);
    } else {
        log.warn(`Failed to fetch ${ticker}, re-adding to queue AFTER cooldown.`);
        requestQueue.unshift(ticker); // ✅ Re-add ticker to the front of the queue
    }

    log.log(`Finished processing ticker: ${ticker} | Queue size after: ${requestQueue.length()}`);

    if (!data) {
        log.warn(`Failed to fetch ${ticker}, pausing queue due to rate limit.`);
        requestQueue.pause();

        setTimeout(() => {
            log.log("Cooldown period over. Resuming queue.");
            requestQueue.resume();
            processQueue();
        }, 5 * 60 * 1000 + 1000);
    } else {
        callback();
    }
}, 1);

// ✅ Process the Queue
function processQueue() {
    if (requestQueue.length() > 0 && !isRateLimited()) {
        log.log(`Resuming queue processing... Queue size: ${requestQueue.length()}`);
        requestQueue.process();
    }
}

// ✅ Fetch data from Alpha Vantage (or use cache if necessary)
async function fetchAlphaVantageData(ticker) {
    if (isRateLimited()) {
        log.warn(`${ticker} delayed due to cooldown. Will retry later.`);
        return null;
    }

    let attempts = 0;
    let latestData = null;

    while (attempts < API_KEYS.length) {
        const API_KEY = getNextAPIKey();
        const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;

        try {
            const response = await axios.get(url);
            const data = response.data;

            if (data.Note || (data.Information && data.Information.includes("rate limit"))) {
                log.warn(`Rate limit hit on key ${API_KEY}. Rotating...`);
                attempts++;
                continue;
            }

            if (!data || Object.keys(data).length === 0 || !data.Symbol) {
                log.warn(`Invalid response for ${ticker}. Not caching.`);
                return null;
            }

            if (data.Symbol) {
                latestData = data;
                log.warn(`Updating cache with fresh data for ${ticker}.`);
                cache[ticker] = data;
                saveCache();
                const store = require("../store");
                store.updateMeta(ticker, { overview: data });
            }

           

            

            return latestData;
        } catch (error) {
            log.error(`Error fetching Alpha Vantage data for ${ticker}:`, error);
            return null;
        }
    }

    return null;
}

// ✅ Queue Requests
function queueRequest(ticker) {
    requestQueue.push(ticker);
    log.log(`Added ${ticker} to queue | Current queue size: ${requestQueue.length()}`);

    if (!isRateLimited()) {
        processQueue();
    }
}

// ✅ Search cache and update store immediately
function searchCache(ticker) {
    const store = require("../store");

    if (cache[ticker]) {
        log.log(`[CACHE] Found cached data for ${ticker}. Updating store.`);
        store.updateMeta(ticker, { meta: cache[ticker] });
    } else {
        log.log(`[CACHE] No cached data found for ${ticker}.`);
    }
}

// ✅ Export Functions
module.exports = { searchCache, queueRequest };
