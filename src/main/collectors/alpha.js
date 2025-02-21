const { fetch } = require("undici");
const createLogger = require("../../hlps/logger");

const log = createLogger(__filename);

// ✅ Load API key from .env.alpha
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env.alpha") });
const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

async function fetchAlphaVantageData(ticker) {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;
    
    try {
        const response = await fetch(url);

        // ✅ Log full response if status is not 200 OK
        if (response.status !== 200) {
            log.warn(`⚠️ Alpha Vantage API response for ${ticker}: HTTP ${response.status} - ${response.statusText}`);
            return null; // ✅ Return `null` so store doesn't process bad data
        }

        const data = await response.json();

        // ✅ Handle empty or malformed responses
        if (!data || Object.keys(data).length === 0) {
            log.warn(`⚠️ Empty Alpha Vantage response for ${ticker}.`);
            return null;
        }

        log.log(`✅ Fetched Alpha Vantage data for ${ticker}. Attaching to store.`);

        const tickerStore = require("../store");
        tickerStore.updateTicker(ticker, { about: data });

        return data;
    } catch (error) {
        log.error(`❌ Error fetching Alpha Vantage data for ${ticker}:`, error);
        return null;
    }
}


module.exports = { fetchAlphaVantageData };
