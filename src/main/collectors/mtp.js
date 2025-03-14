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


const fetchQueue = [];
let isFetching = false;
const fetchCooldown = 10000; // 5 seconds between requests

const processQueue = async () => {
    if (isFetching || fetchQueue.length === 0) return;

    isFetching = true;
    const { resolve, reject } = fetchQueue.shift(); // Get the next request

    try {
        log.log("[mtp.js] Fetching symbol list from server...");
        const response = await fetch("http://172.232.155.62:3000/clients/symbols", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.MTP_API_KEY
            },
        });

        if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);

        const rawData = await response.text();
        const data = JSON.parse(rawData);

        if (Array.isArray(data)) {
            log.log(`[mtp.js] Retrieved ${data.length} symbols.`);

            // ✅ Lazy load `tickerStore` here
            const tickerStore = require("../store");
            if (typeof tickerStore.updateSymbols === "function") {
                tickerStore.updateSymbols(data);
            } else {
                log.warn("[mtp.js] tickerStore.updateSymbols is not a function.");
            }
        } else {
            log.warn("[mtp.js] Received invalid symbol list format.");
        }

        resolve(); // Mark this request as completed
    } catch (error) {
        log.error(`[mtp.js] Failed to fetch symbols: ${error.message}`);
        reject(error);
    } finally {
        isFetching = false;

        // Wait before processing the next request
        if (fetchQueue.length > 0) {
            setTimeout(processQueue, fetchCooldown);
        }
    }
};

const fetchSymbolsFromServer = () => {
    return new Promise((resolve, reject) => {
        fetchQueue.push({ resolve, reject });

        if (!isFetching) {
            processQueue(); // Start processing if idle
        }
    });
};




module.exports = { connectMTP, fetchSymbolsFromServer };
