const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, "../../config/.env") });

const connectMTP = (scannerWindow) => {
    // Create a WebSocket connection to the server
    const ws = new WebSocket(process.env.MTP_WS);

    // Handle WebSocket connection open
    ws.onopen = function () {
        log.log("Connected to WebSocket server");
        ws.send(JSON.stringify({ client_id: "MTM-Collector" }));
    };

    // Handle incoming messages
    ws.on("message", (event) => {
        try {
            const message = event.toString(); // Ensure the message is a string
            log.log("[mtp.js] Received:", message);

            const tickerStore = require("../store");

            if (tickerStore && typeof tickerStore.addMtpAlerts === "function") {
                tickerStore.addMtpAlerts(message);
            } else {
                log.warn("[mtp] tickerStore.addMtpAlerts is not available due to circular dependency.");
            }

            // Store alerts if possible
            if (tickerStore && typeof tickerStore.addMtpAlerts === "function") {
                tickerStore.addMtpAlerts(message);
            } else {
                log.warn("[mtp.js] tickerStore.addMtpAlerts unavailable (circular dependency).");
            }

            // Forward alert to scanner
            if (scannerWindow && !scannerWindow.isDestroyed()) {
                let alertData;
                try {
                    alertData = JSON.parse(message);
                } catch (error) {
                    log.error("[SERVER] Malformed JSON received:", message, error);
                    return;
                }

                scannerWindow.webContents.send("ws-alert", alertData);
            } else {
                log.warn("[mtp.js] Scanner window not available.");
            }
        } catch (error) {
            log.error("[mtp.js] Error processing WebSocket message:", error);
        }
    });

    // Handle connection close
    ws.on("close", () => {
        log.log("WebSocket connection closed.");
    });

    // Handle any errors
    ws.on("error", (err) => {
        log.error(`WebSocket error: ${err.message}`);
    });
};

// Function to fetch symbol data from the API using vanilla JavaScript's fetch
const getSymbolMeta = async (symbol) => {
    try {
        log.log(`Sending GET request for symbol eta of ${symbol}`);
        const response = await fetch(`http://127.0.0.1:8080/meta/${symbol}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });
        log.log(`Response Status: ${response.status}`);

        if (!response.ok) {
            log.error(`Error fetching data for symbol ${symbol}: ${response.statusText}`);
            return null;
        }

        const rawText = await response.text();
        log.log(`Raw response received with length ${rawText.length} characters`);

        // Parse the JSON response
        const data = JSON.parse(rawText);
        if (Array.isArray(data)) {
            log.log(`Received an array with ${data.length} objects`);
        } else if (typeof data === "object" && data !== null) {
            const keys = Object.keys(data);
            log.log(`Received an object with ${keys.length} properties`);
        } else {
            log.log("Received data is not an object or array");
        }

        log.log(`Fetched data for symbol ${symbol}:`, data);

        // Lazy require of store to avoid circular dependency issues.
        const store = require("../store");
        if (store && typeof store.updateMeta === "function") {
            store.updateMeta(symbol, { meta: data });
        } else {
            log.warn("[mtp] Store updateMeta function not available.");
        }

        return data;
    } catch (error) {
        log.error(`Error fetching data for symbol ${symbol}: ${error.message}`);
        return null;
    }
};

const fetchSymbolsFromServer = async () => {
    try {
        log.log("[mtp.js] Fetching symbol list from server...");

        const response = await fetch("http://172.232.155.62:3000/clients/symbols", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.MTP_API_KEY
            },
        });

        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

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
    } catch (error) {
        log.error(`[mtp.js] Failed to fetch symbols: ${error.message}`);
    }
};


module.exports = { getSymbolMeta, connectMTP, fetchSymbolsFromServer };
