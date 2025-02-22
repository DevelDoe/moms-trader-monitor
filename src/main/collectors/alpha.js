const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const async = require("async");
require("dotenv").config(); // Load .env variables
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);

const CACHE_FILE = path.join(__dirname, "../../data/alpha_data.json");

// ✅ Ensure cache directory exists
fs.ensureDirSync(path.dirname(CACHE_FILE));

// ✅ Load cache if it exists
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
    try {
        cache = fs.readJsonSync(CACHE_FILE);
    } catch (error) {
        log.error("Error reading Alpha Vantage cache:", error);
        cache = {}; // Reset cache if corrupted
    }
}

// ✅ Extract API keys from .env file
const API_KEYS = Object.keys(process.env)
    .filter((key) => key.startsWith("ALPHA_VANTAGE_API_KEY"))
    .sort()
    .map((key) => process.env[key]);

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
function isRateLimited() {
    if (!lastRateLimitTime) {
        lastRateLimitTime = Date.now();
        return false;
    }

    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes
    const elapsed = Date.now() - lastRateLimitTime;

    return elapsed < cooldownPeriod;
}

// ✅ Search cache and update store immediately
function searchCache(ticker) {
    const store = require("../store");

    if (cache[ticker]) {
        log.log(`[CACHE] Found cached data for ${ticker}. Updating store.`);
        store.updateOverview(ticker, { overview: cache[ticker] });
    } else {
        log.log(`[CACHE] No cached data found for ${ticker}.`);
    }
}

const requestQueue = async.queue(async (ticker, callback) => {
    log.log(`Processing ticker: ${ticker} | Queue size before: ${requestQueue.length()}`);

    if (isRateLimited()) {
        if (!requestQueue.paused) {
            log.warn(`[RATE-LIMIT] Rate limit hit! Pausing the entire queue.`);
            requestQueue.pause();
            lastRateLimitTime = Date.now();

            setTimeout(() => {
                log.log("[RATE-LIMIT] Cooldown complete. Resuming queue.");
                lastRateLimitTime = null;
                requestQueue.resume();
                processQueue(); // ✅ Resume processing all tickers
            }, 5 * 60 * 1000); // 5-minute cooldown
        }

        // ✅ Since async.queue removes tickers, we put it back at the front
        requestQueue.unshift(ticker);
        return callback(); // ✅ Exit early without removing from queue
    }

    const success = await fetchAlphaVantageData(ticker);

    if (success) {
        log.log(`Successfully fetched fresh data for ${ticker}. Removing from queue.`);
        callback(); // ✅ Remove only after successful fetch
    } else {
        log.warn(`Failed to fetch ${ticker}, re-adding to queue for retry.`);
        requestQueue.unshift(ticker); // ✅ Keep ticker in queue if fetch failed
        callback(); // ✅ Allow queue to continue processing
    }
}, 1);


// ✅ Process the Queue only when not rate-limited
function processQueue() {
    if (requestQueue.length() > 0 && !isRateLimited()) {
        log.log(`Resuming queue processing... Queue size: ${requestQueue.length()}`);
        requestQueue.process();
    }
}



// ✅ Fetch data from Alpha Vantage
async function fetchAlphaVantageData(ticker) {
    if (isRateLimited()) {
        log.warn(`[RATE-LIMIT] Skipping ${ticker} due to cooldown.`);
        return;
    }

    let attempts = 0;
    while (attempts < API_KEYS.length) {
        const API_KEY = getNextAPIKey();
        const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;

        try {
            log.log(`[API REQUEST] Fetching fresh data for ${ticker}.`);

            const response = await axios.get(url);
            const data = response.data;

            // ✅ Handle Rate Limits
            if (data.Note || (data.Information && data.Information.includes("rate limit"))) {
                log.warn(`[RATE LIMIT] API key ${API_KEY} hit rate limit.`);
                attempts++;
                continue;
            }

            // ✅ Log Unexpected Responses
            if (!data || Object.keys(data).length === 0 || !data.Symbol) {
                log.warn(`[INVALID RESPONSE] Unexpected response for ${ticker}:`, JSON.stringify(data, null, 2));
                return;
            }

            // ✅ Step 3: Save new cache and trigger update
            log.log(`[SUCCESS] Fetched fresh data for ${ticker}. Updating cache.`);
            cache[ticker] = data;
            saveCache();

            // ✅ Use updateOverview() to propagate the update
            const store = require("../store");
            store.updateOverview(ticker, { overview: data });

            return;
        } catch (error) {
            log.error(`[ERROR] Fetching Alpha Vantage data for ${ticker}: ${error.message}`);
            attempts++;
        }
    }
}

// ✅ Queue Requests
function queueRequest(ticker) {
    log.log(`Added ${ticker} to queue | Current queue size: ${requestQueue.length()}`);
    
    requestQueue.push(ticker);

    if (!isRateLimited()) {
        processQueue();
    }
}

// ✅ Export Functions
module.exports = { searchCache, queueRequest };
