const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, "../../config/.env") });
const { windows } = require("../windowManager");

const isDevelopment = process.env.NODE_ENV === "development";

const SYMBOL_UPDATE_EXPIRY_MS = 60 * 1000; // 1 minute

let lastSymbolUpdate = ""; // Cache last symbol list
let isFetchingSymbols = false; // Prevent multiple fetches
let lastUpdateTime = 0;
let messageQueue = [];

const FIREHOSE_CAPACITY = 1024;
const ALERT_DISPATCH_HZ = 10;
const ALERT_DISPATCH_BATCH = 1;
const ALERT_DISPATCH_INTERVAL = Math.floor(1000 / ALERT_DISPATCH_HZ); // or `+ 0.5` for rounding

let droppedAlerts = 0;

const debug = false;

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
const connectMTP = () => {
    const clientId = isDevelopment ? "DEVELOPMENT" : "PRODUCTION";
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

    let reconnecting = false;

    // Function to create the WebSocket connection
    const createWebSocket = () => {
        if (reconnecting) return;
        reconnecting = true;
        ws = new WebSocket(process.env.MTP_WS);

        ws.onopen = () => {
            log.log("[mtp.js] Connected");
            reconnecting = false;

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "registration", client_id: clientId }));
            } else {
                log.warn("[mtp.js] Attempted to send registration on a non-open WebSocket");
            }
        };

        ws.onmessage = async (event) => {
            const rawData = event.data instanceof Buffer ? event.data.toString("utf8") : event.data;
            if (debug) log.log("DATA", "[mtp.js] Raw message:", rawData);

            const msg = safeParse(rawData);
            if (!msg) return;

            // Handle ping messages
            if (msg.type === "ping") {
                // log.log("[mtp.js] Received ping, sending pong");
                try {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "pong", client_id: clientId }));
                    } else {
                        log.warn("[mtp.js] Cannot send pong — WebSocket not open");
                    }
                } catch (err) {
                    log.error("[mtp.js] Failed to send pong:", err.message);
                }
                return;
            }

            // Handle alert messages
            if (msg.type === "alert" && msg.data) {
                if (messageQueue.length >= FIREHOSE_CAPACITY) {
                    messageQueue.shift(); // Drop oldest to keep the latest alert
                    droppedAlerts++;
                    log.warn("[FIREHOSE] Dropped oldest alert: buffer full");

                    if (droppedAlerts % 50 === 0) {
                        log.warn(`[FIREHOSE] 🔥 ${droppedAlerts} total alerts dropped so far.`);
                    }
                }

                messageQueue.push(msg.data);
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

        ws.on("unexpected-response", (req, res) => {
            log.error("[mtp.js] Unexpected response from WS server:", res.statusCode);
        });

        ws.onerror = (err) => {
            log.error("[mtp.js] WebSocket error:", err.message);
        };

        ws.on("close", (code, reason) => {
            if (ws && ws.readyState !== WebSocket.CLOSED) {
                ws.terminate(); // force cleanup
            }
            setTimeout(() => {
                reconnecting = false; // ✅ Allow retry
                createWebSocket();
            }, 5000);
        });
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

function startMockAlerts(baseInterval = 100, fluctuation = 1000) {
    let currentIndex = 0;
    let wavePosition = 0;

    function sendAlert(alert) {
        // 🔁 Ticker Store update (simulate real alert)
        const tickerStore = require("../store");
        if (tickerStore?.addEvent) {
            tickerStore.addEvent(alert); // ✅ Just like ws.onmessage
        }

        // Scanner window
        if (windows?.scanner?.webContents && !windows.scanner.isDestroyed()) {
            windows.scanner.webContents.send("ws-alert", alert);
        } else {
            log.warn("[MockAlerts] Scanner window not available to receive alerts");
        }

        const event = transformEvent(alert);

        // Frontline
        if (windows?.frontline?.webContents && !windows.frontline.isDestroyed()) {
            windows.frontline.webContents.send("ws-events", [event]);
        } else {
            log.warn("[MockAlerts] frontline window not available to receive events");
        }

        // heroes
        if (windows?.heroes?.webContents && !windows.heroes.isDestroyed()) {
            windows.heroes.webContents.send("ws-events", [event]);
        } else {
            log.warn("[MockAlerts] heroes window not available to receive events");
        }

        // Progress
        if (windows?.progress?.webContents && !windows.progress.isDestroyed()) {
            windows.progress.webContents.send("ws-events", [event]);
        } else {
            log.warn("[MockAlerts] progress window not available to receive events");
        }
    }

    const loggedSymbols = new Set();

    function getWaveInterval() {
        wavePosition += 0.1;
        const adjustment = Math.sin(wavePosition) * fluctuation;
        return baseInterval + adjustment;
    }

    function scheduleNextAlert() {
        const interval = getWaveInterval();
        sendAlert(predefinedAlerts[currentIndex]);
        currentIndex = (currentIndex + 1) % predefinedAlerts.length;
        setTimeout(scheduleNextAlert, interval);
    }

    // Start the process
    scheduleNextAlert();
}

module.exports = { connectMTP, fetchSymbolsFromServer, flushMessageQueue, startMockAlerts };

function transformEvent(alert) {
    const isUp = alert.direction.toUpperCase() === "UP";
    const change = Math.abs(alert.change_percent || 0);

    log.log(`[transformEvent] ${alert.symbol} → str: ${alert.last_trade}, str1: ${alert.volume_1min}, str5: ${alert.volume_5min}`);

    return {
        hero: alert.symbol,
        hp: isUp ? change : 0,
        dp: isUp ? 0 : change,
        strength: alert.volume,
        price: alert.price,
        str: alert.last_trade,
        str1: alert.volume_1min,
        str5: alert.volume_5min,
    };
}
// Predefined alerts
// const predefinedAlerts = [
//     { symbol: "AKAN", direction: "UP", price: 2.2, volume: 340000, change_percent: 1 },
//     // Add as many predefined alert objects as you need
// ];

// Predefined alerts
const predefinedAlerts = [
    // RADX alerts
    // RADX alerts — engineered to trigger a surge

    { symbol: "RADX", direction: "UP", price: 1.75, volume: 100000, change_percent: 2.1 },
    { symbol: "RADX", direction: "UP", price: 1.78, volume: 110000, change_percent: 2.8 },
    { symbol: "RADX", direction: "UP", price: 1.81, volume: 140000, change_percent: 3.1 },
    { symbol: "RADX", direction: "DOWN", price: 1.77, volume: 120000, change_percent: 1.9 },
    { symbol: "RADX", direction: "UP", price: 1.85, volume: 260000, change_percent: 3.2 },
    { symbol: "RADX", direction: "UP", price: 1.91, volume: 340000, change_percent: 5.1 },
    { symbol: "RADX", direction: "UP", price: 2.05, volume: 400000, change_percent: 7.4 },

    // NRXP alerts
    { symbol: "NRXP", direction: "UP", price: 0.42, volume: 35000, change_percent: 8.7 },
    { symbol: "NRXP", direction: "DOWN", price: 0.38, volume: 2800, change_percent: 4.3 },
    { symbol: "NRXP", direction: "UP", price: 0.45, volume: 42000, change_percent: 12.5 },

    // DSWL alerts
    { symbol: "DSWL", direction: "UP", price: 2.15, volume: 75000, change_percent: 2.8 },
    { symbol: "DSWL", direction: "UP", price: 2.25, volume: 92000, change_percent: 4.1 },
    { symbol: "DSWL", direction: "DOWN", price: 2.08, volume: 68000, change_percent: 3.2 },

    // LTRN alerts
    { symbol: "LTRN", direction: "UP", price: 3.4, volume: 450000, change_percent: 1.9 },
    { symbol: "LTRN", direction: "UP", price: 3.55, volume: 520000, change_percent: 3.5 },
    { symbol: "LTRN", direction: "DOWN", price: 3.32, volume: 410000, change_percent: 2.1 },

    // FBRX alerts
    { symbol: "FBRX", direction: "UP", price: 0.65, volume: 180000, change_percent: 6.2 },
    { symbol: "FBRX", direction: "DOWN", price: 0.59, volume: 150000, change_percent: 4.8 },
    { symbol: "FBRX", direction: "UP", price: 0.68, volume: 220000, change_percent: 8.9 },

    // BCG alerts
    { symbol: "BCG", direction: "UP", price: 1.12, volume: 95000, change_percent: 2.3 },
    { symbol: "BCG", direction: "UP", price: 1.18, volume: 110000, change_percent: 4.7 },
    { symbol: "BCG", direction: "DOWN", price: 1.09, volume: 85000, change_percent: 2.6 },

    // CUPR alerts
    { symbol: "CUPR", direction: "UP", price: 0.88, volume: 320000, change_percent: 5.4 },
    { symbol: "CUPR", direction: "DOWN", price: 0.82, volume: 280000, change_percent: 3.8 },
    { symbol: "CUPR", direction: "UP", price: 0.92, volume: 380000, change_percent: 9.1 },

    // SXTC alerts
    { symbol: "SXTC", direction: "UP", price: 1.05, volume: 65000, change_percent: 3.7 },
    { symbol: "SXTC", direction: "UP", price: 1.12, volume: 78000, change_percent: 6.2 },
    { symbol: "SXTC", direction: "DOWN", price: 1.01, volume: 59000, change_percent: 3.1 },

    // BWEN alerts
    { symbol: "BWEN", direction: "UP", price: 2.75, volume: 42000, change_percent: 2.1 },
    { symbol: "BWEN", direction: "DOWN", price: 2.65, volume: 38000, change_percent: 1.8 },
    { symbol: "BWEN", direction: "UP", price: 2.85, volume: 51000, change_percent: 5.3 },

    // BMR alerts
    { symbol: "BMR", direction: "UP", price: 0.95, volume: 1200, change_percent: 4.5 },
    { symbol: "BMR", direction: "DOWN", price: 0.89, volume: 9500, change_percent: 3.2 },
    { symbol: "BMR", direction: "UP", price: 1.02, volume: 1500, change_percent: 8.7 },

    // SPAI alerts
    { symbol: "SPAI", direction: "UP", price: 0.48, volume: 250000, change_percent: 7.3 },
    { symbol: "SPAI", direction: "DOWN", price: 0.44, volume: 210000, change_percent: 4.2 },
    { symbol: "SPAI", direction: "UP", price: 0.52, volume: 3100000, change_percent: 10.6 },

    // RAYA alerts
    { symbol: "RAYA", direction: "UP", price: 1.22, volume: 8500, change_percent: 3.4 },
    { symbol: "RAYA", direction: "UP", price: 1.28, volume: 9800, change_percent: 5.8 },
    { symbol: "RAYA", direction: "DOWN", price: 1.18, volume: 7200, change_percent: 2.9 },

    // UONE alerts
    { symbol: "UONE", direction: "UP", price: 3.15, volume: 62000, change_percent: 2.7 },
    { symbol: "UONE", direction: "DOWN", price: 3.05, volume: 55000, change_percent: 1.9 },
    { symbol: "UONE", direction: "UP", price: 3.25, volume: 75000, change_percent: 4.8 },

    // HHS alerts
    { symbol: "HHS", direction: "UP", price: 1.45, volume: 11000, change_percent: 3.9 },
    { symbol: "HHS", direction: "DOWN", price: 1.38, volume: 95000, change_percent: 2.7 },
    { symbol: "HHS", direction: "UP", price: 1.52, volume: 13000, change_percent: 6.3 },

    // STEC alerts
    { symbol: "STEC", direction: "UP", price: 0.75, volume: 18000, change_percent: 5.2 },
    { symbol: "STEC", direction: "DOWN", price: 0.71, volume: 15000, change_percent: 3.6 },
    { symbol: "STEC", direction: "UP", price: 0.79, volume: 21000, change_percent: 8.1 },

    // GLE alerts
    { symbol: "GLE", direction: "UP", price: 0.62, volume: 290000, change_percent: 6.9 },
    { symbol: "GLE", direction: "DOWN", price: 0.58, volume: 240000, change_percent: 4.3 },
    { symbol: "GLE", direction: "UP", price: 0.66, volume: 340000, change_percent: 10.2 },

    // NCEW alerts
    { symbol: "NCEW", direction: "UP", price: 1.85, volume: 4800, change_percent: 2.6 },
    { symbol: "NCEW", direction: "UP", price: 1.92, volume: 5500, change_percent: 4.3 },
    { symbol: "NCEW", direction: "DOWN", price: 1.78, volume: 4200, change_percent: 3.1 },

    // KPLT alerts
    { symbol: "KPLT", direction: "UP", price: 3.28, volume: 420000, change_percent: 7.5 },
    { symbol: "KPLT", direction: "DOWN", price: 3.26, volume: 380000, change_percent: 5.4 },
    { symbol: "KPLT", direction: "UP", price: 3.31, volume: 510000, change_percent: 12.8 },

    // INKT alerts
    { symbol: "INKT", direction: "UP", price: 2.15, volume: 95000, change_percent: 3.8 },
    { symbol: "INKT", direction: "DOWN", price: 2.08, volume: 82000, change_percent: 2.9 },
    { symbol: "INKT", direction: "UP", price: 2.22, volume: 110000, change_percent: 7.4 },

    // RAVE alerts
    { symbol: "RAVE", direction: "UP", price: 0.95, volume: 120000, change_percent: 4.6 },
    { symbol: "RAVE", direction: "DOWN", price: 0.89, volume: 98000, change_percent: 3.5 },
    { symbol: "RAVE", direction: "UP", price: 1.02, volume: 150000, change_percent: 9.1 },
];
