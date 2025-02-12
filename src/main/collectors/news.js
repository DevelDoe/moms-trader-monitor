import dotenv from "dotenv";
import fetch from "node-fetch";
import tickerStore from "./store";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "./config/.env.alpaca") });

const API_KEY = process.env.APCA_API_KEY_ID;
const API_SECRET = process.env.APCA_API_SECRET_KEY;
const API_URL = "https://data.alpaca.markets/v1beta1/news";

// Fetch news for a batch of tickers
const fetchNewsForTickers = async (tickers) => {
    if (!tickers.length) return [];

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url = `${API_URL}?symbols=${tickers.join(",")}&start=${last24Hours}&limit=50&sort=desc`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                accept: "application/json",
                "APCA-API-KEY-ID": API_KEY,
                "APCA-API-SECRET-KEY": API_SECRET,
            },
        });

        if (!response.ok) {
            console.error(`Failed to fetch news: ${response.status}`);
            return [];
        }

        const data = await response.json();
        return data.news || [];
    } catch (error) {
        console.error(`Error fetching news: ${error.message}`);
        return [];
    }
};

// Fetch and update store
const fetchNews = async () => {
    const tickers = tickerStore.getAllTickers("daily").map((t) => t.Symbol);
    if (!tickers.length) return;

    for (let ticker of tickers) {
        const news = await fetchNewsForTickers([ticker]); // Fetch news for a single ticker
        if (news.length) {
            tickerStore.updateNews(ticker, news); // ✅ Store news in tickerStore
        }
    }
};

// Run news collection every minute
setInterval(fetchNews, 60000);
fetchNews(); // Initial fetch
