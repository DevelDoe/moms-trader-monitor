const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const dotenv = require("dotenv");
const path = require("path");
const { fetch } = require("undici");

dotenv.config({ path: path.join(__dirname, "../../config/.env") });

let alpacaSocket = null;

const subscribeToSymbolNews = (symbols) => {
    // // Validate symbols
    // if (!Array.isArray(symbols) || symbols.length === 0) {
    //     log.warn("No symbols provided for news subscription.");
    //     return;
    // }

    // // If WebSocket is already open, subscribe immediately
    // if (alpacaSocket && alpacaSocket.readyState === WebSocket.OPEN) {
    //     const payload = {
    //         action: "subscribe",
    //         news: symbols,
    //     };
    //     log.log(`📡 Subscribing to Alpaca news for: ${symbols.join(", ")}`);
    //     alpacaSocket.send(JSON.stringify(payload));
    //     return;
    // }

    // // If WebSocket is not open, create a new connection
    // log.log("WebSocket not open. Opening a new connection...");

    // const ALPACA_NEWS_URL = `${process.env.APCA_API_STREAM_URL}/v1beta1/news`;

    // alpacaSocket = new WebSocket(ALPACA_NEWS_URL, {
    //     headers: {
    //         "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID,
    //         "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY,
    //     },
    // });

    // alpacaSocket.onopen = () => {
    //     log.log("Connected to Alpaca News WebSocket.");

    //     const authMsg = {
    //         action: "auth",
    //         key: process.env.APCA_API_KEY_ID,
    //         secret: process.env.APCA_API_SECRET_KEY,
    //     };

    //     alpacaSocket.send(JSON.stringify(authMsg));
    //     log.log("Sent authentication message.");
    // };

    // alpacaSocket.onmessage = (event) => {
    //     log.log("Received message from WebSocket:", event.data);

    //     try {
    //         const data = JSON.parse(event.data);

    //         // If it's an array (normal behavior)
    //         const messages = Array.isArray(data) ? data : [data];

    //         for (const msg of messages) {
    //             // Handle authentication success
    //             if (msg.T === "success" && msg.msg === "authenticated") {
    //                 log.log("Successfully authenticated.");

    //                 const payload = {
    //                     action: "subscribe",
    //                     news: symbols,
    //                 };
    //                 log.log(`Subscribing to Alpaca news for: ${symbols.join(", ")}`);
    //                 alpacaSocket.send(JSON.stringify(payload));
    //                 return;
    //             }

    //             // Handle news message
    //             if (msg.T === "n") {
    //                 log.log("📢 News item received:", msg.headline);
    //                 handleNewsData(msg); // optionally wrap this in setImmediate
    //             }
    //         }
    //     } catch (error) {
    //         log.error("Error processing WebSocket message:", error.message);
    //     }
    // };

    // alpacaSocket.onclose = () => {
    //     log.warn("WebSocket closed. Reconnecting in 5s...");
    //     setTimeout(() => subscribeToSymbolNews(symbols), 5000); // Reconnect and resubscribe
    // };

    // alpacaSocket.onerror = (error) => {
    //     log.error("WebSocket error:", error.message);
    //     // Check if any specific error information is available
    //     if (error.message.includes("Subscription failed")) {
    //         log.warn("The WebSocket subscription request may have failed.");
    //     }
    // };
};

// ✅ Handle News Items Only
const handleNewsData = (newsItem) => {
    const tickerStore = require("../store");

    if (!newsItem || typeof newsItem !== "object") {
        log.warn("[handleNewsData] Received malformed news item:", JSON.stringify(newsItem));
        return;
    }

    const { headline, symbols } = newsItem;
    log.log(`[handleNewsData] Processing news item: ${JSON.stringify(newsItem)}`);

    // ✅ Check for missing headline
    if (!headline) {
        log.warn("[handleNewsData] News item missing headline. Skipping...");
        return;
    }

    // ✅ Check for missing or invalid symbols
    if (!Array.isArray(symbols) || symbols.length === 0) {
        log.warn(`[handleNewsData] Skipping news with no symbols: "${headline}"`);
        return;
    }

    log.log(`[handleNewsData] Storing news for tickers: ${symbols.join(", ")}`);
    tickerStore.addNews([newsItem]);

    // ✅ Send update to all open windows
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("[handleNewsData] news-updated", { newsItems: [newsItem] });
    });
};

const fetchHistoricalNews = async (ticker) => {
    const tickerStore = require("../store");
    const now = new Date();

    const lastClose = new Date(now);

    // Get current day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const day = now.getDay();

    if (day === 0) {
        // Sunday → back to Friday
        lastClose.setDate(now.getDate() - 2);
    } else if (day === 1) {
        // Monday → back to Friday
        lastClose.setDate(now.getDate() - 3);
    } else if (day === 6) {
        // Saturday → back to Friday
        lastClose.setDate(now.getDate() - 1);
    } else {
        // Tuesday to Friday → use yesterday
        lastClose.setDate(now.getDate() - 1);
    }

    // Set time to 4:00 PM EST = 21:00 UTC
    lastClose.setUTCHours(21, 0, 0, 0);

    const start = encodeURIComponent(lastClose.toISOString());
    const encodedTicker = encodeURIComponent(ticker);
    const ALPACA_NEWS_URL = `https://data.alpaca.markets/v1beta1/news?start=${start}&symbols=${encodedTicker}`;

    // log.log(`[news.js] Fetching historical news for ${ticker} (encoded: ${encodedTicker}) since ${start}...`);

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
            const errorText = await response.text();
            throw new Error(`Failed to fetch historical news for ${ticker}, status: ${response.status}, response: ${errorText}`);
        }

        const newsData = await response.json();
        // log.log(`Full API response for ${ticker}: ${JSON.stringify(newsData)}`);

        if (!newsData.news || newsData.news.length === 0) return;

        log.log(`✅ Retrieved ${newsData.news.length} historical news articles for ${ticker}.`);
        tickerStore.addNews(newsData.news);
    } catch (error) {
        log.error(`Error fetching historical news for ${ticker}:`, error.message);
    }
};


module.exports = { fetchHistoricalNews, subscribeToSymbolNews };
