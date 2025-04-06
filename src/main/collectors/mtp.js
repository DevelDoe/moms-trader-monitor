const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, "../../config/.env") });

const SYMBOL_UPDATE_EXPIRY_MS = 60 * 1000; // 1 minute

let lastSymbolUpdate = ""; // Cache last symbol list
let isFetchingSymbols = false; // Prevent multiple fetches
let lastUpdateTime = 0;
let messageQueue = [];

function flushMessageQueue(scannerWindow) {
    if (scannerWindow?.webContents && !scannerWindow.webContents.isDestroyed()) {
        messageQueue.forEach((msg) => {
            scannerWindow.webContents.send("ws-alert", msg);
        });
        messageQueue = [];
    }
}

function debounce(func, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func(...args), delay);
    };
}

// mtp.js - Fixed version
const connectMTP = (scannerWindow) => {
    const clientId = "MTM-Collector";
    let ws;

    // Helper function for safe JSON parsing
    const safeParse = (data) => {
        try {
            const sanitized = data.toString().replace(/[^\x20-\x7F]/g, "");
            return JSON.parse(sanitized);
        } catch (err) {
            log.error("[mtp.js] Failed to parse message:", data.toString());
            return null;
        }
    };

    // Function to create the WebSocket connection
    const createWebSocket = () => {
        ws = new WebSocket(process.env.MTP_WS);

        ws.onopen = () => {
            log.log("[mtp.js] Connected to WebSocket server");
            ws.send(
                JSON.stringify({
                    type: "registration",
                    client_id: clientId,
                })
            );
        };

        ws.onmessage = async (event) => {
            const rawData = event.data instanceof Buffer ? event.data.toString("utf8") : event.data;
            log.log("DATA", "[mtp.js] Raw message:", rawData);

            const msg = safeParse(rawData);
            if (!msg) return;

            // Handle ping messages
            if (msg.type === "ping") {
                log.log("[mtp.js] Received ping, sending pong");
                ws.send(JSON.stringify({ type: "pong", client_id: clientId }));
                return;
            }

            // Handle alert messages
            if (msg.type === "alert" && msg.data) {
                const tickerStore = require("../store");
                if (tickerStore?.addMtpAlerts) {
                    tickerStore.addMtpAlerts(JSON.stringify(msg.data));
                }

                if (scannerWindow?.webContents && !scannerWindow.webContents.isDestroyed()) {
                    scannerWindow.webContents.send("ws-alert", msg.data);
                } else {
                    messageQueue.push(msg.data);
                }

                // Send to focusWindow
                if (global.windows?.focus && global.windows.focus.webContents && !global.windows.focus.webContents.isDestroyed()) {
                    const focusEvent = transformToFocusEvent(msg.data);
                    global.windows.focus.webContents.send("ws-events", [focusEvent]); // Send as array
                }
            }

            // Handle symbol updates with deduplication
            if (msg.type === "symbol_update") {
                const newSymbolUpdate = JSON.stringify(msg.data.symbols); // Convert array to string for comparison

                if (newSymbolUpdate === lastSymbolUpdate) {
                    const now = Date.now();
                    const timeSinceLast = now - lastUpdateTime;

                    if (timeSinceLast < SYMBOL_UPDATE_EXPIRY_MS) {
                        log.log("[mtp.js] Skipping duplicate symbol update (too soon).");
                        return;
                    }

                    log.log("[mtp.js] Forcing refresh despite duplicate (time expired).");
                }

                lastSymbolUpdate = newSymbolUpdate;
                lastUpdateTime = Date.now();

                log.log("[mtp.js] Received new symbol update, triggering debounce...");
                debouncedFetchSymbols();
            }
        };

        ws.onerror = (err) => {
            log.error("[mtp.js] WebSocket error:", err.message);
        };

        ws.onclose = (event) => {
            log.log("[mtp.js] WebSocket closed. Attempting to reconnect...");
            // Reconnect after a delay
            setTimeout(createWebSocket, 5000); // 5 seconds delay before reconnect
        };
    };

    // Initialize the first WebSocket connection
    createWebSocket();
};

// ✅ Debounced function (Ensures only one fetch per second)
const debouncedFetchSymbols = debounce(async () => {
    if (isFetchingSymbols) {
        log.log("[mtp.js] Fetch already in progress, skipping...");
        return;
    }

    isFetchingSymbols = true;
    log.log("[mtp.js] Debounced: Fetching new symbols...");
    try {
        await fetchSymbolsFromServer();
    } catch (error) {
        log.error("[mtp.js] Error fetching symbols:", error);
    } finally {
        isFetchingSymbols = false;
    }
}, 1000);

const fetchSymbolsFromServer = async () => {
    return new Promise((resolve, reject) => {
        log.log("[mtp.js] Streaming symbol list from server...");
        let symbolCount = 0;

        fetch("http://172.232.155.62:3000/clients/symbols/stream", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.MTP_API_KEY,
            },
        })
            .then((res) => {
                if (!res.ok) {
                    reject(new Error(`Server responded with status: ${res.status}`));
                    return;
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let partialData = "";
                let lastLoggedTime = Date.now();

                const read = async () => {
                    const { done, value } = await reader.read();

                    if (done) {
                        log.log("[mtp.js] Streaming completed.");
                        resolve(symbolCount);
                        return;
                    }

                    partialData += decoder.decode(value, { stream: true });

                    try {
                        const jsonData = JSON.parse(partialData);
                        partialData = "";

                        if (Array.isArray(jsonData)) {
                            symbolCount += jsonData.length;

                            const tickerStore = require("../store");
                            if (typeof tickerStore.updateSymbols === "function") {
                                tickerStore.updateSymbols(jsonData);
                            }
                        }
                    } catch (error) {
                        if (Date.now() - lastLoggedTime > 2000) {
                            log.warn("[mtp.js] Incomplete JSON chunk detected...");
                            lastLoggedTime = Date.now();
                        }
                    }

                    read();
                };

                read();
            })
            .catch((error) => {
                log.error(`[mtp.js] Failed to fetch symbols: ${error.message}`);
                reject(error);
            });
    });
};


function startMockAlerts(windows) {
    simulateAlerts(["AKAN", "BOLD", "CREV", "MYSZ", "FOXX", "STEC", "RMTI", "MNDO", "CRWS", "NCEW",  "SXTC", "SHLT", "INKT", "ARKR", "FTCI", "JZXN", "RAYA", "CELU", "XBP", "ATRA", "GLST", "BMR", ], (alert) => {

        // 📡 Send raw alert to scanner
        if (windows?.scanner?.webContents && !windows.scanner.webContents.isDestroyed()) {
            windows.scanner.webContents.send("ws-alert", alert);
        }

        // 🎯 Send transformed alert to focus window
        if (windows?.focus?.webContents && !windows.focus.webContents.isDestroyed()) {
            const event = transformToFocusEvent(alert);
            windows.focus.webContents.send("ws-events", [event]);
        }

        // 🧠 Add raw alert to tickerStore
        const tickerStore = require("../store");
        if (tickerStore?.addMtpAlerts) {
            tickerStore.addMtpAlerts(JSON.stringify(alert));
        }
    });
}


module.exports = { connectMTP, fetchSymbolsFromServer, flushMessageQueue, startMockAlerts };

// 📡 Fake alert simulator (for development)
function simulateAlerts(symbols, sendAlert, interval = 16000) {
    const lastPrices = {};

    symbols.forEach((symbol) => {
        lastPrices[symbol] = +(Math.random() * 20 + 1).toFixed(2); // Initial price

        const cycle = async () => {
            while (true) {
                const numUp = Math.floor(Math.random() * 2) + 1;
                const numDown = Math.floor(Math.random() * 2) + 1;

                for (let i = 0; i < numUp; i++) {
                    const oldPrice = lastPrices[symbol];
                    const percentChange = (Math.random() * 19 + 1) / 100;
                    const newPrice = +(oldPrice * (1 + percentChange)).toFixed(2);
                    const change_percent = ((newPrice - oldPrice) / oldPrice) * 100;

                    lastPrices[symbol] = newPrice;
                    const volume = Math.floor(Math.random() * (500_000 - 10_000 + 1)) + 10_000;

                    sendAlert({
                        symbol,
                        direction: "UP", // 👈 must be uppercase
                        price: newPrice,
                        volume,
                        change_percent,
                        hp: change_percent,
                        dp: 0,
                    });

                    await delay(randomDelay(1800, 11500));
                }

                for (let i = 0; i < numDown; i++) {
                    const oldPrice = lastPrices[symbol];
                    const percentChange = (Math.random() * 19 + 1) / 100;
                    const newPrice = +(oldPrice * (1 - percentChange)).toFixed(2);
                    const change_percent = ((newPrice - oldPrice) / oldPrice) * 100;

                    lastPrices[symbol] = newPrice;
                    const volume = Math.floor(Math.random() * (500_000 - 10_000 + 1)) + 10_000;

                    sendAlert({
                        symbol,
                        direction: "down",
                        price: newPrice,
                        volume,
                        change_percent,
                        hp: 0,
                        dp: -change_percent,  // ✅ only dp for down (convert to positive)
                    });

                    await delay(randomDelay(2000, 3000));
                }

                await delay(interval);
            }
        };

        cycle();
    });
}


function delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

function randomDelay(min = 400, max = 550) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


// function randomDelay() {
//     return Math.floor(Math.random() * 400 + 150); // 150–550ms
// }

function transformToFocusEvent(alert) {
    const isUp = alert.direction.toUpperCase() === "UP";
    const change = Math.abs(alert.change_percent || 0); // Keep as whole number

    return {
        hero: alert.symbol,
        hp: isUp ? change : 0,  // 5 = 5%
        dp: isUp ? 0 : change,   // 3 = 3%
        strength: alert.volume,
        price: alert.price,
    };
}
