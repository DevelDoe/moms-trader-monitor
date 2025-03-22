const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, "../../config/.env") });

let lastSymbolUpdate = ""; // Cache last symbol list
let isFetchingSymbols = false; // Prevent multiple fetches

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
            const rawData = event.data instanceof Buffer ? event.data.toString('utf8') : event.data;
            log.log("DATA", '[mtp.js] Raw message:', rawData);
        
            const msg = safeParse(rawData);
            if (!msg) return;
        
            // Handle ping messages
            if (msg.type === "ping") {
                log.log('[mtp.js] Received ping, sending pong');
                ws.send(JSON.stringify({ type: "pong", client_id: clientId }));
                return;
            }
        
            // Handle alert messages
            if (msg.type === "alert" && msg.data) {
                log.log(`[mtp.js] Processing alert: ${JSON.stringify(msg.data)}`);
                const tickerStore = require("../store");
                if (tickerStore?.addMtpAlerts) {
                    tickerStore.addMtpAlerts(JSON.stringify(msg.data));
                }
                if (scannerWindow?.webContents) {
                    scannerWindow.webContents.send("ws-alert", msg.data);
                }
            }
        
            // Handle symbol updates with deduplication
            if (msg.type === "symbol_update") {
                const newSymbolUpdate = JSON.stringify(msg.data.symbols); // Convert array to string for comparison
        
                // 🚀 **Avoid duplicate updates**
                if (newSymbolUpdate === lastSymbolUpdate) {
                    log.log("[mtp.js] Ignoring duplicate symbol update.");
                    return;
                }
        
                lastSymbolUpdate = newSymbolUpdate; // Update cache
        
                log.log("[mtp.js] Received new symbol update, triggering debounce...");
                debouncedFetchSymbols(); // ✅ Call debounced function
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

module.exports = { connectMTP, fetchSymbolsFromServer };
