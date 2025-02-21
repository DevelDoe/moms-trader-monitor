const fetch = require("node-fetch");
const createLogger = require("../../hlps/logger");
const tickerStore = require("../store"); // ✅ Import store

const log = createLogger(__filename);

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;; // 🔹 Set your API key

// Function to fetch sector data for a single ticker
async function fetchSector(ticker) {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.Sector) {
            return { Symbol: ticker, Sector: data.Sector };
        } else {
            log.warn(`No sector data found for ${ticker}`);
            return { Symbol: ticker, Sector: "Unknown" };
        }
    } catch (error) {
        log.error(`Error fetching sector for ${ticker}:`, error);
        return { Symbol: ticker, Sector: "Error" };
    }
}

// Function to fetch sector data for all stored tickers
async function fetchSectorsForTickers() {
    const tickers = tickerStore.getAllTickers(); // ✅ Get tickers from store
    if (!tickers || tickers.length === 0) {
        log.log("No tickers available for sector lookup.");
        return;
    }

    log.log(`Fetching sector data for ${tickers.length} tickers...`);
    const sectorPromises = tickers.map((ticker) => fetchSector(ticker.Symbol));
    const sectorData = await Promise.all(sectorPromises);

    // Store updated ticker data with sectors
    tickerStore.updateTickers(sectorData); // ✅ Update store with sector info
    log.log("Sector data updated in tickerStore.");
}

// Function to run sector lookup at intervals (to avoid rate limits)
function collectSectors(minIntervalMs = 30000, maxIntervalMs = 120000) {
    log.log("Starting sector lookup loop...");

    function getRandomInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async function run() {
        await fetchSectorsForTickers();
        const interval = getRandomInterval(minIntervalMs, maxIntervalMs);
        log.log(`Next sector fetch in ${interval / 1000} seconds`);
        setTimeout(run, interval);
    }

    run();
}

module.exports = { collectSectors };
