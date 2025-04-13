const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, "../../config/.env") });
const { windows } = require("../windowManager"); 

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
const connectMTP = () => {
    const clientId = "DEV";
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

                const scannerWindow = windows.scanner
                if (scannerWindow?.webContents && !scannerWindow.webContents.isDestroyed()) {
                    scannerWindow.webContents.send("ws-alert", msg.data);
                } else {
                    messageQueue.push(msg.data);
                }

                const focusWindow = windows.focus; 
                if (focusWindow?.webContents && !focusWindow.webContents.isDestroyed()) {
                    const focusEvent = transformToFocusEvent(msg.data); // ✅ define it
                    focusWindow.webContents.send("ws-events", [focusEvent]);
                    log.log("sending message to focus:", focusEvent);
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

function startMockAlerts(baseInterval = 1000, fluctuation = 2000) {
    let currentIndex = 0;
    let wavePosition = 0;

    function sendAlert(alert) {
        // Scanner window check
        if (!windows?.scanner?.webContents || windows.scanner.isDestroyed()) {
            log.warn('[MockAlerts] Scanner window not available to receive alerts');
        } else {
            windows.scanner.webContents.send("ws-alert", alert);
        }

        // Focus window check
        if (!windows?.focus?.webContents || windows.focus.isDestroyed()) {
            log.warn('[MockAlerts] Focus window not available to receive events');
        } else {
            const event = transformToFocusEvent(alert);
            windows.focus.webContents.send("ws-events", [event]);
        }

        // progress window check
        if (!windows?.progress?.webContents || windows.progress.isDestroyed()) {
            log.warn('[MockAlerts] progress window not available to receive events');
        } else {
            const event = transformToFocusEvent(alert);
            windows.progress.webContents.send("ws-events", [event]);
        }

        // Ticker store update (keeping your existing logic)
        const tickerStore = require("../store");
        if (tickerStore?.addMtpAlerts) {
            tickerStore.addMtpAlerts(JSON.stringify(alert));
        }
    }

    // Rest of your existing functions remain exactly the same
    function transformToFocusEvent(alert) {
        const isUp = alert.direction.toUpperCase() === "UP";
        const change = Math.abs(alert.change_percent || 0);

        return {
            hero: alert.symbol,
            hp: isUp ? change : 0,
            dp: isUp ? 0 : change,
            strength: alert.volume,
            price: alert.price,
        };
    }

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


// Predefined alerts
const predefinedAlerts = [
    { symbol: "AKAN", direction: "UP", price: 2.20, volume: 120000, change_percent: 1 },
    { symbol: "AKAN", direction: "UP", price: 2.40, volume: 120000, change_percent: 2 },
    { symbol: "AKAN", direction: "DOWN", price: 2.20, volume: 120000, change_percent: 1 },
    { symbol: "BOLD", direction: "UP", price: 7.3, volume: 80000, change_percent: -1.7 },
    { symbol: "AKAN", direction: "DOWN", price: 10.4, volume: 22000, change_percent: 1.2 },
    { symbol: "CREV", direction: "UP", price: 15.2, volume: 300000, change_percent: 2.5 },
    // Add as many predefined alert objects as you need
];

function transformToFocusEvent(alert) {
    const isUp = alert.direction.toUpperCase() === "UP";
    const change = Math.abs(alert.change_percent || 0); // Keep as whole number

    return {
        hero: alert.symbol,
        hp: isUp ? change : 0, // 5 = 5%
        dp: isUp ? 0 : change, // 3 = 3%
        strength: alert.volume,
        price: alert.price,
    };
}
