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
        try {
            if (alpacaSocket.readyState === WebSocket.OPEN) {
                alpacaSocket.send(JSON.stringify(payload));
            } else {
                log.warn("Tried to send payload on closed WebSocket.");
            }
        } catch (err) {
            log.error("WebSocket send error:", err.message);
        }
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

        const authMsg = {
            action: "auth",
            key: process.env.APCA_API_KEY_ID,
            secret: process.env.APCA_API_SECRET_KEY,
        };

        alpacaSocket.send(JSON.stringify(authMsg));
        log.log("Sent authentication message.");
    };

    alpacaSocket.onmessage = (event) => {
        // log.log("Received message from WebSocket:", event.data);

        try {
            const data = JSON.parse(event.data);

            // If it's an array (normal behavior)
            const messages = Array.isArray(data) ? data : [data];

            for (const msg of messages) {
                // Handle authentication success
                if (msg.T === "success" && msg.msg === "authenticated") {
                    log.log("Successfully authenticated.");

                    const payload = {
                        action: "subscribe",
                        news: symbols,
                    };
                    log.log(`Subscribing to Alpaca news for: ${symbols.join(", ")}`);
                    alpacaSocket.send(JSON.stringify(payload));
                    return;
                }

                // Handle news message
                if (msg.T === "n") {
                    log.log("📢 News item received:", msg.headline);
                    handleNewsData(msg); // optionally wrap this in setImmediate
                }
            }
        } catch (error) {
            log.error("Error processing WebSocket message:", error.message);
        }
    };

    alpacaSocket.onclose = () => {
        log.warn("WebSocket closed. Reconnecting in 5s...");
        setTimeout(() => subscribeToSymbolNews(symbols), 5000); // Reconnect and resubscribe
    };

    alpacaSocket.on("unexpected-response", (req, res) => {
        log.error("Alpaca WS unexpected response:", res.statusCode);
    });

    alpacaSocket.on("upgrade", (res) => {
        log.log("Alpaca WS connection upgraded:", res.headers);
    });

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

    // log.log(`[news.js] Fetching historical news for ${ticker}...`);

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

        // log.log(`✅ Retrieved ${newsData.news.length} historical news articles for ${ticker}.`);
        tickerStore.addNews(newsData.news);
    } catch (error) {
        log.error(`Error fetching historical news for ${ticker}:`, error.message);
    }
};

const startMockNews = () => {
    const symbols = ["RADX", "LTRN", "INKT"];
    const mockHeadlines = [
        {
            headline: "RADX Surges After Positive Trial Data, FDA Approves",
            symbols: ["RADX"],
        },
        {
            headline: "LTRN & RADX This is a multi symbol headline for completeness. Jumps on FDA Fast Track Designation, Sell Alert",
            symbols: ["LTRN", "RADX"],
        },
        {
            headline: "This is an bullish healine, FDA Approves",
            symbols: ["LTRN"],
        },
        {
            headline: "And a neurtral headline for completeness.",
            symbols: ["LTRN"],
        },
        {
            headline: "INKT Shares Climb After Patent Approval",
            symbols: ["INKT"],
        },
        {
            headline:
                "Just like Ascension, it's a ranked list. But instead of only looking at % change since open, Scroll of XP measures how much real action a stock has had — up or down — and rewards that movement with XP.",
            symbols: ["LTRN"],
        },
        {
            headline: "LTRN & RADX This is a multi symbol headline for completeness. Jumps on FDA Fast Track Designation, Sell Alert",
            symbols: ["SXTC"],
        },
        {
            headline: "This is an bullish healine, FDA Approves",
            symbols: ["SXTC"],
        },
        {
            headline: "And a neurtral headline for completeness.",
            symbols: ["SXTC"],
        },
    ];

    const delay = (ms) => new Promise((res) => setTimeout(res, ms));

    const injectSequentially = async () => {
        log.log("🕒 Waiting 5 seconds before starting mock news injection...");
        await delay(5000); // give app time to load

        for (let idx = 0; idx < mockHeadlines.length; idx++) {
            const item = mockHeadlines[idx];
            const mockNews = {
                T: "n",
                id: 90000000 + idx,
                headline: item.headline,
                summary: item.summary,
                author: "Simulated Bot",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                url: `https://news.simulator.com/story/${item.symbols[0].toLowerCase()}`,
                content: `<p>${item.summary}</p>`,
                symbols: item.symbols,
                source: "simulator",
            };

            log.log(`🧪 Injecting mock news for ${item.symbols[0]}: "${item.headline}"`);
            handleNewsData(mockNews);

            await delay(3000); // 3 seconds between each news injection
        }

        log.log("✅ Mock news injection complete.");
    };

    injectSequentially();
};

module.exports = { fetchHistoricalNews, subscribeToSymbolNews, startMockNews };
