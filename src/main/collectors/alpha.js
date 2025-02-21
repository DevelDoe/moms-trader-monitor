const { fetch } = require("undici");
const createLogger = require("../../hlps/logger");

const log = createLogger(__filename);

// ✅ Load API key from .env.alpha
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

async function fetchAlphaVantageData(ticker) {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        log.log(`Alpha Vantage Response for ${ticker}:`, data); // ✅ Log full response

        return data; // Will later extract sector & industry
    } catch (error) {
        log.error(`Error fetching Alpha Vantage data for ${ticker}:`, error);
        return null;
    }
}

module.exports = { fetchAlphaVantageData }; // ✅ Export function
