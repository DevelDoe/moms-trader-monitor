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
    if (!lastRateLimitTime) {
        lastRateLimitTime = Date.now();
        return false;
    }

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
    log.log(`🔄 Processing ticker: ${ticker} | Queue size before: ${requestQueue.length()}`);

    const success = await fetchAlphaVantageData(ticker);

    if (!success) {
        log.warn(`🚨 Failed to fetch ${ticker}, re-adding to queue AFTER cooldown.`);
        requestQueue.unshift(ticker); // ✅ Re-add ticker to the front of the queue
    } else {
        log.log(`✅ Successfully fetched ${ticker}.`);
    }

    log.log(`✅ Finished processing ticker: ${ticker} | Queue size after: ${requestQueue.length()}`);

    if (!success) {
        log.warn(`🚨 Failed to fetch ${ticker}, pausing queue due to rate limit.`);
    
        // ✅ PAUSE THE QUEUE TO PREVENT CONTINUOUS RETRIES
        requestQueue.pause();
        
        // ✅ ENFORCE FULL COOLDOWN PERIOD BEFORE RESUMING
        setTimeout(() => {
            log.log("✅ Cooldown period over. Resuming queue.");
            requestQueue.resume();  // ✅ Only resume AFTER cooldown ends
            processQueue();  // ✅ Ensure queue processing restarts
        }, 5 * 60 * 1000 + 1000);
    } else {
        callback();  // ✅ Move to next item if successful
    }
    
}, 1);

async function enforceCooldown() {
    log.warn("🚨 All API keys exhausted! Pausing queue for cooldown.");
    requestQueue.pause();
    lastRateLimitTime = Date.now();

    setTimeout(() => {
        log.log("✅ Cooldown period over. Resuming queue.");
        lastRateLimitTime = null;
        requestQueue.resume();
        processQueue(); // ✅ Restart processing
    }, 5 * 60 * 1000 + 1000);
}



// ✅ Process the Queue (Ensure it Runs)
function processQueue() {
    if (requestQueue.length() > 0 && !isRateLimited()) {
        log.log(`🔄 Resuming queue processing... Queue size: ${requestQueue.length()}`);
        requestQueue.process();
    }
}

// ✅ Fetch data from Alpha Vantage (or use cache)
async function fetchAlphaVantageData(ticker) {
    if (cache[ticker]) {
        log.log(`Using cached data for ${ticker}`);
        return cache[ticker];
    }

    if (isRateLimited()) {
        log.warn(`⏳ ${ticker} delayed due to cooldown. Will retry later.`);
        return false;
    }

    let attempts = 0;

    while (attempts < API_KEYS.length) {
        const API_KEY = getNextAPIKey();
        const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;

        try {
            const response = await axios.get(url);
            const data = response.data;

            if (data.Note || (data.Information && data.Information.includes("rate limit"))) {
                log.warn(`Rate limit hit on key ${API_KEY}. Rotating...`);
                currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
                attempts++;
                continue;
            }

            if (!data || Object.keys(data).length === 0 || !data.Symbol) {
                log.warn(`Invalid response for ${ticker}. Not caching.`);
                return false;
            }

            log.log(`✅ Fetched Alpha Vantage data for ${ticker}. Caching...`);
            cache[ticker] = data;
            saveCache();

            const store = require("../store");
            store.updateTicker(ticker, { about: data });

            return true;
        } catch (error) {
            log.error(`Error fetching Alpha Vantage data for ${ticker}:`, error);
            return false;
        }
    }

    // ✅ Only trigger cooldown if all keys fail
    if (!isRateLimited()) {
        await enforceCooldown();
    }
    return false;
}


function queueRequest(ticker) {
    requestQueue.push(ticker);
    log.log(`📌 Added ${ticker} to queue | Current queue size: ${requestQueue.length()}`);
}



// ✅ Export Functions
module.exports = { fetchAlphaVantageData, queueRequest, processQueue };

