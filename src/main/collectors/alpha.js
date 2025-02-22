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

async function enforceCooldown() {
    log.warn("All API keys exhausted! Pausing queue for cooldown.");
    requestQueue.pause();
    lastRateLimitTime = Date.now();

    setTimeout(() => {
        log.log("Cooldown period over. Resuming queue.");
        lastRateLimitTime = null;
        requestQueue.resume();
        processQueue();
    }, 5 * 60 * 1000 + 1000);
}

// ✅ Process the Queue
function processQueue() {
    if (requestQueue.length() > 0 && !isRateLimited()) {
        log.log(`Resuming queue processing... Queue size: ${requestQueue.length()}`);
        requestQueue.process();
    }
}

// ✅ Fetch data from Alpha Vantage (or use cache if necessary)
async function fetchAlphaVantageData(ticker) {
    const store = require("../store");

    // ✅ Step 1: Return cache immediately if available
    if (cache[ticker]) {
        log.log(`Returning cached data for ${ticker} immediately.`);

        // ✅ Update the store with cached data
        store.updateOverview(ticker, { overview: cache[ticker] });

        // ✅ Fetch fresh data in the background without blocking response
        setImmediate(() => fetchAlphaVantageData(ticker, false));

        return cache[ticker]; // ✅ Return cached data first
    }

    // ✅ Step 2: Fetch fresh data from API
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
    
            // ✅ Handle Rate Limits
            if (data.Note || (data.Information && data.Information.includes("rate limit"))) {
                log.warn(`Rate limit hit on key ${API_KEY}. Rotating...`);
                attempts++;
                continue; // Try with the next API key
            }
    
            // ✅ Handle Unexpected Responses
            if (!data || Object.keys(data).length === 0 || !data.Symbol) {
                log.warn(`Unexpected response for ${ticker}:`, JSON.stringify(data, null, 2));
                attempts++;
                continue; // Try with another key before failing
            }
    
            // ✅ Step 3: Save new cache and trigger update
            log.log(`Fetched fresh Alpha Vantage data for ${ticker}. Updating cache.`);
            latestData = data;
            cache[ticker] = data;
            saveCache();
    
            // ✅ Use updateOverview() to propagate the update
            store.updateOverview(ticker, { overview: data });
    
            return null; // ✅ No need to manually return, store handles updates
        } catch (error) {
            // ✅ General Error Handling (API errors, network failures, etc.)
            log.error(`Error fetching Alpha Vantage data for ${ticker}: ${error.message}`);
    
            // Log additional response details if available
            if (error.response) {
                log.error(`Response Data: ${JSON.stringify(error.response.data, null, 2)}`);
                log.error(`Status Code: ${error.response.status}`);
            }
    
            attempts++; // Try another key before failing
        }
    }
    

    // ✅ If API request fails, return only cached data
    if (!latestData && cache[ticker]) {
        log.log(`Returning cached data for ${ticker} due to API failure.`);
        store.updateOverview(ticker, { overview: cache[ticker] }); // ✅ Use stored cache
        return cache[ticker];
    }

    // ✅ If no cache and no API data, enforce cooldown
    await enforceCooldown();
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

// ✅ Export Functions
module.exports = { fetchAlphaVantageData, queueRequest, processQueue };
