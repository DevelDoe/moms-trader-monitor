const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const dotenv = require("dotenv");
const path = require("path");
const { fetch } = require("undici");


dotenv.config({ path: path.join(__dirname, "../../config/.env.alpaca") });

let alpacaSocket = null;

const connectAlpacaNews = () => {
    if (alpacaSocket && alpacaSocket.readyState === WebSocket.OPEN) {
        log.log("WebSocket already connected, skipping duplicate connection.");
        return;
    }

    const ALPACA_NEWS_URL = `${process.env.APCA_API_STREAM_URL}/v1beta1/news`;

    log.log("Connecting to Alpaca News WebSocket...");

    alpacaSocket = new WebSocket(ALPACA_NEWS_URL, {
        headers: {
            "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID,
            "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY,
        },
    });

    alpacaSocket.onopen = () => {
        log.log("Connected to Alpaca News WebSocket.");
        alpacaSocket.send(JSON.stringify({ action: "subscribe", news: ["*"] }));
        log.log("Subscribed to all Alpaca news.");
    };

    alpacaSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            log.log(`Received ${data.length} new news entries.`);

            if (!Array.isArray(data) || data.length === 0) {
                log.warn("Received empty or invalid news data.");
                return;
            }

            setImmediate(() => {
                data.forEach(handleNewsData);
            });
        } catch (error) {
            log.error("Error processing WebSocket message:", error.message);
        }
    };

    alpacaSocket.onclose = () => {
        log.warn("WebSocket closed. Reconnecting in 5s...");
        setTimeout(connectAlpacaNews, 5000);
    };

    alpacaSocket.onerror = (error) => {
        log.error("WebSocket error:", error.message);
    };
};

// ✅ Lazy Load `tickerStore` only when needed
const handleNewsData = (newsItem) => {
    const tickerStore = require("../store"); // 🔥 Require here to avoid circular dependency

    const newsArray = Array.isArray(newsItem) ? newsItem : [newsItem];

    newsArray.forEach((news) => {
        if (!Array.isArray(news.symbols) || news.symbols.length === 0) {
            log.warn(`[news.js] Skipping news with no symbols: "${news.headline}"`);
            return;
        }

        tickerStore.addNews(newsArray);
        log.log(`[news.js] ✅ Storing ${newsArray.length} news entries.`);

        BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send("news-updated", { newsItems: newsArray });
        });
    });
};

const fetchHistoricalNews = async (ticker) => {
    const tickerStore = require("../store"); // ✅ Lazy-load to avoid circular dependency

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const start = encodeURIComponent(midnight.toISOString()); // ✅ Corrected from `since` to `start`
    const encodedTicker = encodeURIComponent(ticker); // ✅ Ensure ticker is properly encoded

    // ✅ Corrected API request - Uses `start` instead of `since`
    const ALPACA_NEWS_URL = `https://data.alpaca.markets/v1beta1/news?start=${start}&symbols=${encodedTicker}`;

    log.log(`Fetching historical news for ${ticker} (encoded: ${encodedTicker}) since ${start}...`);

    try {
        const response = await fetch(ALPACA_NEWS_URL, {
            method: "GET",
            headers: {
                accept: "application/json",
                "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID,
                "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY,
            },
        });

        if (!response.ok) {
            const errorText = await response.text(); // ✅ Get more error details
            throw new Error(`Failed to fetch historical news for ${ticker}, status: ${response.status}, response: ${errorText}`);
        }

        const newsData = await response.json();
        log.log(`✅ Retrieved ${newsData.news.length} historical news articles for ${ticker}`);

        if (newsData.news.length > 0) {
            tickerStore.addNews(newsData.news); // ✅ Store only the `news` array
        }
    } catch (error) {
        log.error(`❌ Error fetching historical news for ${ticker}:`, error.message);
    }
};

connectAlpacaNews();

module.exports = { connectAlpacaNews, fetchHistoricalNews };
