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
let lastRateLimitTime = null; // Track when the last rate limit was hit

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

// ✅ Check if we recently hit a rate limit
let cooldownLogged = false; // Prevents multiple logs

function isRateLimited() {
    if (!lastRateLimitTime) return false;

    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes
    const elapsed = Date.now() - lastRateLimitTime;

    if (elapsed < cooldownPeriod) {
        if (!cooldownLogged) {
            // ✅ Only log the first time
            log.warn(`Cooldown active! Waiting ${(cooldownPeriod / 1000).toFixed(1)}s before retrying.`);
            cooldownLogged = true; // ✅ Set flag to avoid duplicate logs
        }
        return true;
    }

    lastRateLimitTime = null; // ✅ Reset cooldown
    cooldownLogged = false; // ✅ Allow logging again for next cooldown
    return false;
}

// ✅ Queue system for delaying requests
const requestQueue = async.queue(async (ticker, callback) => {
    await fetchAlphaVantageData(ticker);
    setTimeout(callback, 5 * 60 * 1000 + 1000); // 5 min + 1 sec delay
}, 1);

// ✅ Fetch data from Alpha Vantage (or use cache)
async function fetchAlphaVantageData(ticker) {
    if (cache[ticker]) {
        log.log(`Using cached data for ${ticker}`);
        return cache[ticker]; // ✅ Return cached data
    }

    if (isRateLimited()) {
        return null; // 🚨 Prevent sending requests during cooldown
    }

    let attempts = 0; // ✅ Track how many keys we’ve tried

    while (attempts < API_KEYS.length) { // ✅ Ensure we try all keys
        const API_KEY = API_KEYS[currentKeyIndex];
        const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;

        try {
            const response = await axios.get(url);
            const data = response.data;

            // ✅ Detect rate limit
            if (data.Note || (data.Information && data.Information.includes("rate limit"))) {
                log.warn(`Rate limit hit on key ${API_KEY}. Rotating...`);

                // ✅ Rotate to next API key
                currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
                attempts++;

                continue; // ✅ Try the next key
            }

            // ✅ Ensure valid data before caching
            if (!data || Object.keys(data).length === 0 || !data.Symbol) {
                log.warn(`Invalid response for ${ticker}. Not caching.`);
                return null;
            }

            log.log(`Fetched Alpha Vantage data for ${ticker}. Caching...`);
            cache[ticker] = data;
            saveCache();

            return data; // ✅ Successfully retrieved data, exit function
        } catch (error) {
            log.error(`Error fetching Alpha Vantage data for ${ticker}:`, error);
            return null;
        }
    }

    // ✅ If we reach this point, all keys have been exhausted
    log.error("All API keys exhausted! Activating cooldown.");
    lastRateLimitTime = Date.now(); // Start cooldown
    return null;
}


// ✅ Queue system for delaying requests
const requestQueue = async.queue(async (ticker, callback) => {
    log.log(`🔄 Processing ticker: ${ticker} | Queue size before: ${requestQueue.length()}`);

    await fetchAlphaVantageData(ticker);

    log.log(`✅ Finished processing ticker: ${ticker} | Queue size after: ${requestQueue.length()}`);

    setTimeout(() => {
        log.log(`⏳ Waiting 5 min before next request... Queue size: ${requestQueue.length()}`);
        callback();
    }, 5 * 60 * 1000 + 1000); // 5 min + 1 sec delay
}, 1); // Only 1 request at a time

// ✅ Queue Requests Function
function queueRequest(ticker) {
    log.log(`📥 Adding ${ticker} to queue | Current queue size: ${requestQueue.length()}`);
    requestQueue.push(ticker);
}

// ✅ Export Functions
module.exports = { fetchAlphaVantageData, queueRequest };
