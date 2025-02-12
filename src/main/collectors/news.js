// ./src/main/collector/news.js 📡
////////////////////////////////////////////////////////////////////////////////////
// INIT
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const isDevelopment = process.env.NODE_ENV === "development";
const DEBUG = process.env.DEBUG === "true"; // Enables all debug logs
const VERBOSE = "true"; // Enables frequent logging

const tickerStore = require("../store");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../../../config/.env.alpaca") });

const API_KEY = process.env.APCA_API_KEY_ID;
const API_SECRET = process.env.APCA_API_SECRET_KEY;
const API_URL = "https://data.alpaca.markets/v1beta1/news";

// Throttle settings
let MIN_DELAY = 1000;
const MAX_DELAY = 10000;
const BACKOFF_MULTIPLIER = 2;
const RECOVERY_STEP = 50;
const SUCCESS_THRESHOLD = 5;
const MIN_DELAY_INCREMENT = 10;
const MAX_MIN_DELAY = 2000;

let throttleDelay = 100;
let consecutiveSuccesses = 0;

// Function to fetch news for a batch of tickers with throttling
const fetchNewsForTickers = async (tickers) => {
    if (!tickers.length) return [];

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url = `${API_URL}?symbols=${tickers.join(",")}&start=${last24Hours}&limit=50&sort=desc`;

    return import("node-fetch").then(({ default: fetch }) =>
        fetch(url, {
            method: "GET",
            headers: {
                accept: "application/json",
                "APCA-API-KEY-ID": API_KEY,
                "APCA-API-SECRET-KEY": API_SECRET,
            },
        })
            .then(async (response) => {
                const responseStatus = response.status;

                if (!response.ok) {
                    log.error(`❌ API request failed: ${responseStatus} - ${await response.text()}`);

                    if (responseStatus === 429) {
                        throttleDelay = Math.min(throttleDelay * BACKOFF_MULTIPLIER, MAX_DELAY);
                        MIN_DELAY = Math.min(MIN_DELAY + MIN_DELAY_INCREMENT, MAX_MIN_DELAY);
                        log.warn(`⏳ Increased throttle delay to ${throttleDelay}ms due to rate limit.`);
                    }

                    consecutiveSuccesses = 0;
                    return [];
                }

                const data = await response.json();
                consecutiveSuccesses++;

                if (consecutiveSuccesses >= SUCCESS_THRESHOLD) {
                    throttleDelay = Math.max(throttleDelay - RECOVERY_STEP, MIN_DELAY);
                    consecutiveSuccesses = 0;
                    if (VERBOSE) log.log(`✅ Throttle delay decreased to ${throttleDelay}ms.`);
                }

                return data.news || [];
            })
            .catch((error) => {
                log.error(`❌ Error fetching news: ${error.message}`);
                return [];
            })
    );
};

// Function to fetch news for all tickers in store with batching & throttling
const fetchNews = async () => {
    const tickers = tickerStore.getAllTickers("daily").map((t) => t.Symbol);
    if (!tickers.length) return;

    const batchSize = 10;
    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        if (VERBOSE) log.log(`📡 Fetching news for batch: ${batch.join(", ")}`);

        const news = await fetchNewsForTickers(batch);

        if (news.length) {
            batch.forEach((ticker) => {
                const existingNews = tickerStore.getNews(ticker);
                const newArticles = news.filter(
                    (article) => !existingNews.some((stored) => stored.id === article.id)
                );

                if (newArticles.length) {
                    tickerStore.updateNews(ticker, newArticles);
                    if (VERBOSE) log.log(`📊 ${ticker} now has ${tickerStore.getNews(ticker).length} stored news articles.`);
                } else if (VERBOSE) {
                    log.log(`🟡 No new unique news for ${ticker}.`);
                }
            });
        }

        if (VERBOSE) log.log(`⏳ Waiting ${throttleDelay}ms before next request...`);
        await new Promise((resolve) => setTimeout(resolve, throttleDelay));
    }
};

// Function to start news collection with dynamic throttling
const collectNews = async () => {
    log.log("🚀 News collection started...");
    
    while (true) {
        await fetchNews(); // Fetch news once

        if (VERBOSE) log.log(`⏳ Next news collection in ${throttleDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, throttleDelay)); // Respect throttle
    }
};

// ✅ Listen for new tickers and fetch news automatically
tickerStore.on("update", fetchNews);

module.exports = { collectNews };
