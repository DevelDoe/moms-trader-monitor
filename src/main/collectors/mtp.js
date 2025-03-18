const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, "../../config/.env") });

// mtp.js - Fixed version
const connectMTP = (scannerWindow) => {
    const clientId = "MTM-Collector";
    let ws;

    // Helper function for safe JSON parsing
    const safeParse = (data) => {
        try {
            const sanitized = data.toString().replace(/[^\x20-\x7F]/g, '');
            return JSON.parse(sanitized);
        } catch (err) {
            console.error('[mtp.js] Failed to parse message:', data.toString());
            return null;
        }
    };

    // Function to create the WebSocket connection
    const createWebSocket = () => {
        ws = new WebSocket(process.env.MTP_WS);

        ws.onopen = () => {
            console.log('[mtp.js] Connected to WebSocket server');
            ws.send(JSON.stringify({
                type: "registration",
                client_id: clientId
            }));
        };

        ws.onmessage = (event) => {
            const rawData = event.data instanceof Buffer ? event.data.toString('utf8') : event.data;
    
            log.log("DATA", '[mtp.js] Raw message:', rawData);
    
            const msg = safeParse(rawData);
            if (!msg) return;
    
            // Handle ping messages
            if (msg.type === "ping") {
                console.log('[mtp.js] Received ping, sending pong');
                ws.send(JSON.stringify({
                    type: "pong",
                    client_id: clientId
                }));
                return;
            }
    
            // Handle alert messages
            if (msg.type === "alert" && msg.data) {
                log.log(`[mtp.js] Processing alert: ${JSON.stringify(msg.data)}`);
    
                const tickerStore = require("../store");
                if (tickerStore?.addMtpAlerts) {
                    tickerStore.addMtpAlerts(JSON.stringify(msg.data));  // ✅ Convert object to string
                }
    
                if (scannerWindow?.webContents) {
                    scannerWindow.webContents.send("ws-alert", msg.data);
                }
            }
        };

        ws.onerror = (err) => {
            console.error('[mtp.js] WebSocket error:', err.message);
        };

        ws.onclose = (event) => {
            console.log('[mtp.js] WebSocket closed. Attempting to reconnect...');
            // Reconnect after a delay
            setTimeout(createWebSocket, 5000); // 5 seconds delay before reconnect
        };
    };

    // Initialize the first WebSocket connection
    createWebSocket();
};


const fetchSymbolsFromServer = async () => {
    return new Promise((resolve, reject) => {
        try {
            log.log("[mtp.js] Streaming symbol list from server...");

            fetch("http://172.232.155.62:3000/clients/symbols/stream", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": process.env.MTP_API_KEY
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
                let lastLoggedTime = Date.now(); // ✅ Throttle log messages

                const read = async () => {
                    const { done, value } = await reader.read();

                    if (done) {
                        log.log("[mtp.js] Streaming completed.");
                        resolve();
                        return;
                    }

                    partialData += decoder.decode(value, { stream: true });

                    // ✅ Process JSON chunks safely
                    try {
                        const jsonData = JSON.parse(partialData);
                        partialData = ""; // ✅ Reset partial data after successful parsing

                        if (Array.isArray(jsonData)) {
                            log.log(`[mtp.js] Received ${jsonData.length} symbols.`);

                            const tickerStore = require("../store");
                            if (typeof tickerStore.updateSymbols === "function") {
                                tickerStore.updateSymbols(jsonData);
                            }

                            if (scannerWindow?.webContents) {
                                scannerWindow.webContents.send("ws-symbols", jsonData);
                            }
                        }
                    } catch (error) {
                        // ✅ Only log every 2 seconds to avoid excessive spam
                        if (Date.now() - lastLoggedTime > 2000) {
                            log.warn("[mtp.js] Incomplete JSON chunk detected, waiting for more data...");
                            lastLoggedTime = Date.now();
                        }
                    }

                    read(); // Continue reading
                };

                read();
            })
            .catch(reject);
        } catch (error) {
            log.error(`[mtp.js] Failed to fetch symbols: ${error.message}`);
            reject(error);
        }
    });
};








module.exports = { connectMTP, fetchSymbolsFromServer };
