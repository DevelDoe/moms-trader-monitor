const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const dotenv = require("dotenv");
const path = require("path");
const { fetch } = require("undici");

dotenv.config({ path: path.join(__dirname, "../../config/.env") });

let alpacaSocket = null;

/**
 * The function `connectAlpacaNews` establishes a WebSocket connection to Alpaca News API, subscribes
 * to news updates for tracked symbols, processes incoming news data, and handles WebSocket events like
 * open, message, close, and error.
 * @returns In the `connectAlpacaNews` function, a message is being logged and returned if the
 * WebSocket connection to Alpaca News is already open. The message logged is "✅ WebSocket already
 * connected. Skipping duplicate connection."
 */
// const connectAlpacaNews = () => {
//     if (alpacaSocket && alpacaSocket.readyState === WebSocket.OPEN) {
//         log.log("✅ WebSocket already connected. Skipping duplicate connection.");
//         return;
//     }

//     const ALPACA_NEWS_URL = `${process.env.APCA_API_STREAM_URL}/v1beta1/news`;

//     log.log("Connecting to Alpaca News WebSocket...");

//     alpacaSocket = new WebSocket(ALPACA_NEWS_URL, {
//         headers: {
//             "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID,
//             "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY,
//         },
//     });

//     alpacaSocket.onopen = () => {
//         log.log("Connected to Alpaca News WebSocket.");
//         log.log(`WebSocket state: ${alpacaSocket.readyState}`);
//         subscribeToSymbolNews(Array.from(this.symbols.keys())); // ✅ Only subscribe to tracked tickers
//     };

//     alpacaSocket.onmessage = (event) => {
//         try {
//             const data = JSON.parse(event.data);

//             if (!Array.isArray(data) || data.length === 0) {
//                 log.warn("Received empty or invalid data from WebSocket.");
//                 return;
//             }

//             // ✅ Strictly Ignore Non-News Messages
//             const newsItems = data.filter((item) => item.T === "news");

//             if (newsItems.length === 0) {
//                 return;
//             }

//             log.log(`📰 Processing ${newsItems.length} news entries.`);
//             setImmediate(() => {
//                 newsItems.forEach(handleNewsData);
//             });
//         } catch (error) {
//             log.error("Error processing WebSocket message:", error.message);
//         }
//     };

//     alpacaSocket.onclose = () => {
//         log.warn("WebSocket closed. Reconnecting in 5s...");
//         setTimeout(connectAlpacaNews, 5000);
//     };

//     alpacaSocket.onerror = (error) => {
//         log.error("WebSocket error:", error.message);
//     };
// };

const subscribeToSymbolNews = (symbols) => {
    // Validate symbols
    if (!Array.isArray(symbols) || symbols.length === 0) {
        log.warn("No symbols provided for news subscription.");
        return;
    }

    // If WebSocket is already open, subscribe immediately
    if (alpacaSocket && alpacaSocket.readyState === WebSocket.OPEN) {
        const payload = {
            action: "subscribe",
            news: symbols,
        };
        log.log(`📡 Subscribing to Alpaca news for: ${symbols.join(", ")}`);
        alpacaSocket.send(JSON.stringify(payload));
        return;
    }

    // If WebSocket is not open, create a new connection
    log.log("WebSocket not open. Opening a new connection...");

    const ALPACA_NEWS_URL = `${process.env.APCA_API_STREAM_URL}/v1beta1/news`;

    alpacaSocket = new WebSocket(ALPACA_NEWS_URL, {
        headers: {
            "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID,
            "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY,
        },
    });

    alpacaSocket.onopen = () => {
        log.log("Connected to Alpaca News WebSocket.");

        // Subscribe to symbols once the connection is open
        const payload = {
            action: "subscribe",
            news: symbols,
        };
        log.log(`Subscribing to Alpaca news for: ${symbols.join(", ")}`);
        alpacaSocket.send(JSON.stringify(payload));

        // Confirm that the subscription was sent
        log.log("Subscription request sent.");
    };

    alpacaSocket.onmessage = (event) => {
        log.log("Received message from WebSocket:", event.data); // Log all incoming messages for debugging

        try {
            const data = JSON.parse(event.data);

            if (!Array.isArray(data) || data.length === 0) {
                log.warn("Received empty or invalid data from WebSocket.");
                return;
            }

            // Check if the response includes a success/failure message regarding the subscription
            const subscriptionStatus = data.find((item) => item.action === "subscribe");
            if (subscriptionStatus && subscriptionStatus.status === "success") {
                log.log("Successfully subscribed to Alpaca news.");
            } else if (subscriptionStatus && subscriptionStatus.status === "error") {
                log.error("Subscription failed for some symbols.");
            }

            // Filter for news items
            const newsItems = data.filter((item) => item.T === "news");

            if (newsItems.length === 0) {
                return;
            }
            F;
            log.log(`Processing ${newsItems.length} news entries.`);
            setImmediate(() => {
                newsItems.forEach(handleNewsData);
            });
        } catch (error) {
            log.error("Error processing WebSocket message:", error.message);
        }
    };

    alpacaSocket.onclose = () => {
        log.warn("WebSocket closed. Reconnecting in 5s...");
        setTimeout(() => subscribeToSymbolNews(symbols), 5000); // Reconnect and resubscribe
    };

    alpacaSocket.onerror = (error) => {
        log.error("WebSocket error:", error.message);
        // Check if any specific error information is available
        if (error.message.includes("Subscription failed")) {
            log.warn("The WebSocket subscription request may have failed.");
        }
    };
};

// ✅ Handle News Items Only
const handleNewsData = (newsItem) => {
    const tickerStore = require("../store");

    if (!newsItem || typeof newsItem !== "object") {
        log.warn("Received malformed news item:", JSON.stringify(newsItem));
        return;
    }

    const { headline, symbols } = newsItem;
    log.log(`📰 Processing news item: ${JSON.stringify(newsItem)}`);

    // ✅ Check for missing headline
    if (!headline) {
        log.warn("News item missing headline. Skipping...");
        return;
    }

    // ✅ Check for missing or invalid symbols
    if (!Array.isArray(symbols) || symbols.length === 0) {
        log.warn(`Skipping news with no symbols: "${headline}"`);
        return;
    }

    log.log(`Storing news for tickers: ${symbols.join(", ")}`);
    tickerStore.addNews([newsItem]);

    // ✅ Send update to all open windows
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("news-updated", { newsItems: [newsItem] });
    });
};

const fetchHistoricalNews = async (ticker) => {
    const tickerStore = require("../store");

    // Get the current date and calculate the time for the last market close (Friday, 4:00 PM EST)
    const now = new Date();
    let lastMarketClose = new Date(now);

    // Calculate the date of the last Friday (if today is Sunday, it's last Friday, etc.)
    if (now.getDay() === 0) { // Sunday
        lastMarketClose.setDate(now.getDate() - 2); // Move back to Friday
    } else if (now.getDay() === 1) { // Monday
        lastMarketClose.setDate(now.getDate() - 3); // Move back to last Friday
    } else if (now.getDay() === 6) { // Saturday
        lastMarketClose.setDate(now.getDate() - 1); // Move back to Friday
    } else {
        lastMarketClose.setDate(now.getDate() - (now.getDay() + 2) % 7); // Move back to last Friday
    }

    // Set time to 4:00 PM (market close time)
    lastMarketClose.setHours(16, 0, 0, 0); // 4:00 PM EST

    // Format to ISO string for Alpaca API
    const start = encodeURIComponent(lastMarketClose.toISOString());
    const encodedTicker = encodeURIComponent(ticker);

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
            const errorText = await response.text();
            throw new Error(`Failed to fetch historical news for ${ticker}, status: ${response.status}, response: ${errorText}`);
        }

        const newsData = await response.json();
        log.log(`Full API response for ${ticker}: ${JSON.stringify(newsData)}`); // ✅ Log API response

        if (!newsData.news || newsData.news.length === 0) {
            // log.warn(`No historical news found for ${ticker}.`);
            return;
        }

        log.log(`✅ Retrieved ${newsData.news.length} historical news articles for ${ticker}.`);
        tickerStore.addNews(newsData.news);
    } catch (error) {
        log.error(`Error fetching historical news for ${ticker}:`, error.message);
    }
};


module.exports = { fetchHistoricalNews, subscribeToSymbolNews };
