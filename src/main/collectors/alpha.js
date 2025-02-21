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
        const data = await response.json();

        if (!data || !data.Symbol) {
            log.warn(`No valid data found for ${ticker}`);
            return;
        }

        log.log(`Fetched Alpha Vantage data for ${ticker}. Attaching to store.`);

        // ✅ Lazy load tickerStore here to avoid circular dependency
        const tickerStore = require("../store");

        tickerStore.updateTicker(ticker, { about: data }); // 🔥 Attach under `about`

        log.log(`Updated ${ticker} with Alpha Vantage data.`);

    } catch (error) {
        log.error(`Error fetching Alpha Vantage data for ${ticker}:`, error);
    }
}

module.exports = { fetchAlphaVantageData };
