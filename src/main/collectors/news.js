const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const tickerStore = require("../store");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../../../config/.env.alpaca") });


let alpacaSocket = null; // Track WebSocket instance

const connectAlpacaNews = () => {
    if (alpacaSocket && alpacaSocket.readyState === WebSocket.OPEN) {
        log.log("WebSocket already connected, skipping duplicate connection.");
        return;
    }

    const ALPACA_NEWS_URL = `${process.env.APCA_API_STREAM_URL}/v1beta1/news`;
    const trackedTickers = tickerStore.getAllTickers("daily").map(t => t.Symbol); // ✅ Fetch your tracked tickers

    if (trackedTickers.length === 0) {
        log.warn("No tickers available for subscription, skipping Alpaca News connection.");
        return;
    }

    log.log(`Connecting to Alpaca News WebSocket for tickers: ${trackedTickers.join(", ")}`);

    alpacaSocket = new WebSocket(ALPACA_NEWS_URL, {
        headers: {
            "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID,
            "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY,
        },
    });

    alpacaSocket.onopen = () => {
        log.log("✅ Connected to Alpaca News WebSocket.");

        // ✅ Subscribe only to tickers in your collection
        alpacaSocket.send(JSON.stringify({ action: "subscribe", news: trackedTickers }));

        log.log(`📡 Subscribed to Alpaca news stream for: ${trackedTickers.join(", ")}`);
    };

    alpacaSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (Array.isArray(data) && data.length > 0) {
            const filteredNews = data.filter(news => 
                news.T === "n" && news.symbols.some(symbol => trackedTickers.includes(symbol))
            );

            if (filteredNews.length > 0) {
                log.log(`📨 Received ${filteredNews.length} relevant news updates.`);
                
                filteredNews.forEach(news => {
                    const ticker = news.symbols.find(symbol => trackedTickers.includes(symbol));
                    tickerStore.updateNews(ticker, [news]);
                });
            }
        }
    };

    alpacaSocket.onclose = (event) => {
        log.warn("WebSocket closed. Reconnecting in 5s...");
        setTimeout(connectAlpacaNews, 5000); // ✅ Attempt reconnect
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
