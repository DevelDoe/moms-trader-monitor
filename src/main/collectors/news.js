const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const tickerStore = require("../store");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../../../config/.env.alpaca") });

let alpacaSocket = null; // WebSocket instance

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
        log.log("📡 Subscribed to all Alpaca news.");
    };

    alpacaSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (Array.isArray(data) && data.length > 0) {
            // ✅ Ensure we only track news for tickers in our collection
            const trackedTickers = new Set(tickerStore.getAllTickers("daily").map((t) => t.Symbol));

            const filteredNews = data.filter((news) => news.T === "n" && news.symbols.some((symbol) => trackedTickers.has(symbol)));

            if (filteredNews.length > 0) {
                log.log(`📨 Received ${filteredNews.length} relevant news updates`, filteredNews);
                filteredNews.forEach(handleNewsData);
            }
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

// ✅ Process and store relevant news
const handleNewsData = (newsItem) => {
    if (!newsItem.symbols || newsItem.symbols.length === 0) return;

    const trackedTickers = new Set(tickerStore.getAllTickers("daily").map((t) => t.Symbol));

    newsItem.symbols.forEach((symbol) => {
        if (!trackedTickers.has(symbol)) return; // Ignore if not in our collection

        const existingNews = tickerStore.getTickerNews(symbol);
        if (existingNews.some((article) => article.id === newsItem.id)) return; // Prevent duplicate storage

        tickerStore.updateNews(symbol, [newsItem]);
        log.log(`📰 New article for ${symbol}: ${newsItem.headline}`);
    });
};

// ✅ Start WebSocket connection
connectAlpacaNews();

module.exports = { connectAlpacaNews };
