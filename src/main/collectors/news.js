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

const connectAlpacaNews = () => {
    ws = new WebSocket(NEWS_WS_URL);

    ws.on("open", () => {
        log.log("Connected to Alpaca News WebSocket.");

        // Authenticate WebSocket connection
        ws.send(JSON.stringify({
            action: "auth",
            key: API_KEY,
            secret: API_SECRET
        }));
    });

    ws.on("message", (data) => {
        const message = JSON.parse(data);

        if (message[0]?.msg === "authenticated") {
            log.log("✅ WebSocket authenticated. Subscribing to news...");

            // Subscribe to all news updates
            ws.send(JSON.stringify({
                action: "subscribe",
                news: ["*"] // Wildcard subscribes to all stock news
            }));
        } else if (message[0]?.T === "subscription") {
            log.log("📩 Subscribed to Alpaca news stream.");
        } else if (message[0]?.T === "n") {
            // Handle incoming news event
            handleNewsData(message[0]);
        }
    });

    ws.on("close", () => {
        log.warn("🔌 WebSocket closed. Reconnecting in 5s...");
        setTimeout(connectAlpacaNews, 5000);
    });

    ws.on("error", (error) => {
        log.error(`❌ WebSocket error: ${error.message}`);
    });
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
        log.log(`📰 New article for ${symbol}: ${newsItem.headline}`);
    });
};

// Start WebSocket connection
connectAlpacaNews();

module.exports = { connectAlpacaNews };
