const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const tickerStore = require("../store");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../../../config/.env.alpaca") });

const API_KEY = process.env.APCA_API_KEY_ID;
const API_SECRET = process.env.APCA_API_SECRET_KEY;
const NEWS_WS_URL = "wss://stream.data.alpaca.markets/v1beta1/news";

let ws; // Store WebSocket instance

let alpacaSocket = null; // Track WebSocket instance

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
        log.log("✅ Connected to Alpaca News WebSocket.");
        alpacaSocket.send(JSON.stringify({ action: "subscribe", news: ["*"] }));
        log.log("Subscribed to Alpaca news stream.");
    };

    alpacaSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        log.log("Received news update:", data);
        // Process news data here
    };

    alpacaSocket.onclose = (event) => {
        log.warn("WebSocket closed. Reconnecting in 5s...");
        setTimeout(connectAlpacaNews, 5000); // Attempt reconnect
    };

    alpacaSocket.onerror = (error) => {
        log.error("WebSocket error:", error.message);
    };
};


// Process received news data
const handleNewsData = (newsItem) => {
    if (!newsItem.symbols || newsItem.symbols.length === 0) return;

    newsItem.symbols.forEach((symbol) => {
        const existingNews = tickerStore.getTickerNews(symbol);

        // Prevent duplicate news storage
        if (existingNews.some((article) => article.id === newsItem.id)) return;

        // Store new article
        tickerStore.updateNews(symbol, [newsItem]);
        log.log(`New article for ${symbol}: ${newsItem.headline}`);
    });
};

// Start WebSocket connection
connectAlpacaNews();

module.exports = { connectAlpacaNews };
