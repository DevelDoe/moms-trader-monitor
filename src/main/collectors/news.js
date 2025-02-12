import tickerStore from "../store"; // ✅ Import store
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config({ path: "../.././config/.env.alpaca" });

const API_KEY = process.env.APCA_API_KEY_ID;
const API_SECRET = process.env.APCA_API_SECRET_KEY;
const API_URL = "https://data.alpaca.markets/v1beta1/news";

// Function to fetch news for a batch of tickers
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

// Function to fetch news for all tickers in store
const fetchNews = async () => {
    const tickers = tickerStore.getAllTickers("daily").map((t) => t.Symbol);
    if (!tickers.length) return;

    const batchSize = 10;
    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        const news = await fetchNewsForTickers(batch); // ✅ Batch fetch
        if (news.length) {
            batch.forEach((ticker, index) => {
                tickerStore.updateNews(ticker, [news[index]] || []); // ✅ Store news per ticker
            });
        }
        await new Promise((resolve) => setTimeout(resolve, 500)); // ✅ Prevent API spam
    }
};


// Function to start news collection
const collectNews = () => {
    console.log("✅ News collection started...");
    fetchNews(); // Initial run
    setInterval(fetchNews, 60000); // Repeat every minute
};

// ✅ Listen for new tickers and fetch news automatically
tickerStore.on("update", fetchNews);

export { collectNews };
