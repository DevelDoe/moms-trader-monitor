// ./src/main/collector/news.js 📡
////////////////////////////////////////////////////////////////////////////////////
// INIT
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const isDevelopment = process.env.NODE_ENV === "development";
const DEBUG = process.env.DEBUG === "true";

const tickerStore = require("../store");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../../../config/.env.alpaca") });

const API_KEY = process.env.APCA_API_KEY_ID;
const API_SECRET = process.env.APCA_API_SECRET_KEY;
const API_URL = "https://data.alpaca.markets/v1beta1/news";

// Function to fetch news for a batch of tickers
const fetchNewsForTickers = async (tickers) => {
    if (!tickers.length) return [];

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url = `${API_URL}?symbols=${tickers.join(",")}&start=${last24Hours}&limit=50&sort=desc`;

    if (DEBUG) log.log(`📡 Fetching news for tickers: ${tickers.join(", ")}`);

    return import("node-fetch").then(({ default: fetch }) =>
        fetch(url, {
            method: "GET",
            headers: {
                accept: "application/json",
                "APCA-API-KEY-ID": API_KEY,
                "APCA-API-SECRET-KEY": API_SECRET,
            },
        })
            .then((response) => {
                if (!response.ok) {
                    log.error(`❌ Failed to fetch news (Status: ${response.status})`);
                    return [];
                }
                return response.json();
            })
            .then((data) => {
                if (DEBUG) {
                    if (data.news?.length) {
                        log.log(`✅ News fetched for ${tickers.length} tickers. Sample:`);
                        data.news.slice(0, 3).forEach((n, i) =>
                            log.log(`  ${i + 1}. [${n.symbols.join(", ")}] ${n.headline}`)
                        );
                    } else {
                        log.warn(`⚠️ No news found for tickers: ${tickers.join(", ")}`);
                    }
                }
                return data.news || [];
            })
            .catch((error) => {
                log.error(`❌ Error fetching news: ${error.message}`);
                return [];
            })
    );
};

// **Optimized function to update news and prevent duplicates**
const updateNewsInStore = (ticker, newsItems) => {
    if (!newsItems.length) return;

    // Convert existing news into a Set for O(1) lookup
    const existingNewsSet = new Set(tickerStore.getNews(ticker).map((n) => n.id));

    // Filter only new news items
    const uniqueNews = newsItems.filter((newsItem) => !existingNewsSet.has(newsItem.id));

    if (uniqueNews.length) {
        tickerStore.updateNews(ticker, uniqueNews);
        if (DEBUG) log.log(`📝 Added ${uniqueNews.length} new articles for ${ticker}.`);
    } else {
        if (DEBUG) log.warn(`⚠️ No new unique news for ${ticker}.`);
    }
};

// Function to fetch news for all tickers in store
const fetchNews = async () => {
    const tickers = tickerStore.getAllTickers("daily").map((t) => t.Symbol);
    if (!tickers.length) {
        if (DEBUG) log.warn("⚠️ No tickers found in store. Skipping news fetch.");
        return;
    }

    const batchSize = 10;
    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        if (DEBUG) log.log(`📡 Processing batch: ${batch.join(", ")}`);

        const news = await fetchNewsForTickers(batch);
        if (news.length) {
            batch.forEach((ticker) => {
                const tickerNews = news.filter((item) => item.symbols.includes(ticker));
                updateNewsInStore(ticker, tickerNews);
            });
        } else {
            if (DEBUG) log.warn(`⚠️ No relevant news found for batch.`);
        }

        await new Promise((resolve) => setTimeout(resolve, 500)); // Prevent API spam
    }
};

// Function to start news collection
const collectNews = () => {
    if (DEBUG) log.log("📡 News collection started...");
    fetchNews(); // Initial run
    setInterval(fetchNews, 60000); // Repeat every minute
};

// ✅ Listen for new tickers and fetch news automatically
tickerStore.on("update", fetchNews);

module.exports = { collectNews }; // ✅ Keep CommonJS export
