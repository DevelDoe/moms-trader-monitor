const { fetch } = require("undici");
const fs = require("fs");
const path = require("path");
const createLogger = require("../../hlps/logger");

const log = createLogger(__filename);

// ✅ Load API keys from .env
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// ✅ Dynamically load all ALPHA_VANTAGE_API_KEY* keys
const API_KEYS = Object.keys(process.env)
    .filter((key) => key.startsWith("ALPHA_VANTAGE_API_KEY"))
    .sort()
    .map((key) => process.env[key]);

let currentKeyIndex = 0;

// ✅ Path to cache file
const CACHE_FILE = path.join(__dirname, "../../data/alpha_data.json");

// ✅ Ensure cache directory exists
const CACHE_DIR = path.dirname(CACHE_FILE);
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ✅ Load or create cache file
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
    try {
        cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    } catch (error) {
        log.error("❌ Error reading Alpha Vantage cache:", error);
        cache = {}; // ✅ Reset to empty object if file is corrupted
    }
} else {
    log.log("🆕 Creating new Alpha Vantage cache file.");
    fs.writeFileSync(CACHE_FILE, JSON.stringify({}, null, 2)); // ✅ Create an empty JSON file
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

// ✅ Fetch data from Alpha Vantage or cache
async function fetchAlphaVantageData(ticker) {
    // ✅ Return cached data if available
    if (cache[ticker]) {
        log.log(`🔄 Using cached Alpha Vantage data for ${ticker}.`);
        return cache[ticker];
    }

    const API_KEY = getNextAPIKey();
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        // ✅ Check if we hit the rate limit
        if (data.Information && data.Information.includes("rate limit")) {
            log.warn("⚠️ Alpha Vantage rate limit hit. Rotating API key...");
            return fetchAlphaVantageData(ticker); // ✅ Retry with next API key
        }

        // ✅ Handle empty or malformed responses
        if (!data || Object.keys(data).length === 0) {
            log.warn(`⚠️ Empty Alpha Vantage response for ${ticker}.`);
            return null;
        }

        log.log(`✅ Fetched Alpha Vantage data for ${ticker}. Attaching to store.`);

        // ✅ Store data in cache
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
