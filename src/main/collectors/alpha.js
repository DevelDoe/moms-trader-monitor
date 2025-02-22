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

    if (elapsed < cooldownPeriod) {
        log.warn(`Cooldown active! Waiting ${(cooldownPeriod / 1000).toFixed(1)}s before retrying.`);
        return true;
    }

    lastRateLimitTime = null;
    return false;
}

// ✅ Queue system for delaying requests
const requestQueue = async.queue(async (ticker, callback) => {
    log.log(`Processing ticker: ${ticker} | Queue size before: ${requestQueue.length()}`);

    const data = await fetchAlphaVantageData(ticker);

    if (data) {
        log.log(`Successfully fetched ${ticker}.`);
    } else if (cache[ticker]) {
        log.log(`Using cached data for ${ticker} due to failed API request.`);
    } else {
        log.warn(`Failed to fetch ${ticker}, re-adding to queue AFTER cooldown.`);
        requestQueue.unshift(ticker); // ✅ Re-add ticker to the front of the queue
    }

    log.log(`Finished processing ticker: ${ticker} | Queue size after: ${requestQueue.length()}`);
}, 1);

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
                log.warn(`Rate limit hit on key ${API_KEY}. Activating cooldown...`);
                lastRateLimitTime = Date.now(); // 🚨 Add this
                attempts++;
                continue;
              }

            if (!data || Object.keys(data).length === 0 || !data.Symbol) {
                log.warn(`Invalid response for ${ticker}. Not caching.`);
                return null;
            }

            `Fetched Alpha Vantage data for ${ticker}. Caching...`;
            latestData = data;
            cache[ticker] = data;
            saveCache();

            // ✅ Update the store
            const store = require("../store");
            store.updateOverview(ticker, { overview: data });

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
        store.updateOverview(ticker, { overview: cache[ticker] });
    } else {
        log.log(`[CACHE] No cached data found for ${ticker}.`);
    }
}

// ✅ Export Functions
module.exports = { searchCache, queueRequest };
