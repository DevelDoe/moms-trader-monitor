const { fetch } = require("undici");
const fs = require("fs");
const path = require("path");
const createLogger = require("../../hlps/logger");

const log = createLogger(__filename);

// ✅ Load API keys from .env
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// ✅ Load all ALPHA_VANTAGE_API_KEY* dynamically
const API_KEYS = Object.keys(process.env)
    .filter((key) => key.startsWith("ALPHA_VANTAGE_API_KEY"))
    .sort()
    .map((key) => process.env[key]);

let currentKeyIndex = 0;
let lastRateLimitTime = null; // Timestamp when last rate limit was hit

// ✅ Path to cache file
const CACHE_FILE = path.join(__dirname, "../../data/alpha_data.json");

// ✅ Ensure cache directory exists
const CACHE_DIR = path.dirname(CACHE_FILE);
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ✅ Load cache if it exists
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
    try {
        cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    } catch (error) {
        log.error("❌ Error reading Alpha Vantage cache:", error);
        cache = {}; // ✅ Reset if corrupted
    }
}

// ✅ Function to rotate API keys
function getNextAPIKey() {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    return API_KEYS[currentKeyIndex];
}

// ✅ Save cache to file
function saveCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (error) {
        log.error("❌ Error saving Alpha Vantage cache:", error);
    }
}

// ✅ Enforce cooldown if rate limit was recently hit
function isRateLimited() {
    if (!lastRateLimitTime) return false; // No limit detected

    const cooldownPeriod = 60 * 1000; // 1 minute cooldown before retrying
    const elapsed = Date.now() - lastRateLimitTime;

    if (elapsed < cooldownPeriod) {
        log.warn(`⏳ Cooldown active! Waiting ${((cooldownPeriod - elapsed) / 1000).toFixed(1)}s before retrying.`);
        return true;
    }

    lastRateLimitTime = null; // Reset after cooldown
    return false;
}

// ✅ Fetch data from Alpha Vantage or use cache
async function fetchAlphaVantageData(ticker) {
    // ✅ Return cached data if available
    if (cache[ticker]) {
        log.log(`🔄 Using cached Alpha Vantage data for ${ticker}.`);
        return cache[ticker];
    }

    if (isRateLimited()) {
        return null; // 🚨 Prevent infinite requests during cooldown
    }

    const API_KEY = getNextAPIKey();
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        // ✅ Detect rate limit messages
        if (data.Note || data.Information?.includes("rate limit")) {
            log.warn(`⚠️ Alpha Vantage rate limit hit on key ${API_KEY}. Rotating...`);

            if (currentKeyIndex === API_KEYS.length - 1) {
                log.error("🚨 All API keys exhausted! Activating cooldown.");
                lastRateLimitTime = Date.now(); // Enforce cooldown
                return null;
            }

            return fetchAlphaVantageData(ticker); // ✅ Retry with next API key
        }

        // ✅ Ensure valid data before caching
        if (!data || Object.keys(data).length === 0 || !data.Symbol) {
            log.warn(`⚠️ Invalid Alpha Vantage response for ${ticker}. Not caching.`);
            return null;
        }

        log.log(`✅ Fetched Alpha Vantage data for ${ticker}. Attaching to store.`);

        // ✅ Store only **successful** responses in cache
        cache[ticker] = data;
        saveCache();

        const tickerStore = require("../store");
        tickerStore.updateTicker(ticker, { about: data });

        return data;
    } catch (error) {
        log.error(`❌ Error fetching Alpha Vantage data for ${ticker}:`, error);
        return null;
    }
}

module.exports = { fetchAlphaVantageData };
