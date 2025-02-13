const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const tickerStore = require("../store");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../../config/.env.alpaca") });

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
        log.log("Connected to Alpaca News WebSocket.");
        alpacaSocket.send(JSON.stringify({ action: "subscribe", news: ["*"] }));
        log.log("Subscribed to all Alpaca news.");
    };

    alpacaSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            log.log(`Received ${data.length} new news entires.`);
    
            if (!Array.isArray(data) || data.length === 0) {
                log.warn("Received empty or invalid news data.");
                return;
            }
    
            // ✅ Directly process all news items
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



const handleNewsData = (newsItem) => {
    if (!Array.isArray(newsItem.symbols) || newsItem.symbols.length === 0) {
        log.warn(`Skipping news with no symbols: ${newsItem.headline}`);
        return;
    }

    // Add the news to a central storage list (without duplicating per ticker)
    tickerStore.addNews(newsItem);
    log.log(`📥 Storing news: ${newsItem.headline} (Tickers: ${newsItem.symbols.join(", ")})`);
    
    // ✅ Broadcast entire batch at once instead of per ticker
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("news-updated", { newsItems: [newsItem] });
    });
};


// ✅ Start WebSocket connection
connectAlpacaNews();

module.exports = { connectAlpacaNews };
