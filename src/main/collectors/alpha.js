const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const async = require("async");
require("dotenv").config(); // Load .env variables
const createLogger = require("../../hlps/logger");

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
function isRateLimited() {
    if (!lastRateLimitTime) return false;

    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes
    const elapsed = Date.now() - lastRateLimitTime;

    if (elapsed < cooldownPeriod) {
        log.warn(`Cooldown active! Waiting ${((cooldownPeriod - elapsed) / 1000).toFixed(1)}s before retrying.`);
        return true;
    }

    lastRateLimitTime = null; // Reset cooldown
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

    const API_KEY = getNextAPIKey();
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;

    try {
        const response = await axios.get(url);
        const data = response.data;

        // ✅ Handle rate limit response
        if (data.Note || (data.Information && data.Information.includes("rate limit"))) {
            log.warn(`Rate limit hit on key ${API_KEY}. Rotating...`);

            if (currentKeyIndex === API_KEYS.length - 1) {
                log.error("All API keys exhausted! Activating cooldown.");
                lastRateLimitTime = Date.now(); // Start cooldown
                return null;
            }

            return fetchAlphaVantageData(ticker); // ✅ Retry with next API key
        }

        // ✅ Ensure valid data before caching
        if (!data || Object.keys(data).length === 0 || !data.Symbol) {
            log.warn(`Invalid response for ${ticker}. Not caching.`);
            return null;
        }

        log.log(`Fetched Alpha Vantage data for ${ticker}. Caching...`);
        cache[ticker] = data;
        saveCache();

        return data;
    } catch (error) {
        log.error(`Error fetching Alpha Vantage data for ${ticker}:`, error);
        return null;
    }
}

// ✅ Queue Requests Function
function queueRequest(ticker) {
    requestQueue.push(ticker);
}

// ✅ Export Functions
module.exports = { fetchAlphaVantageData, queueRequest };

