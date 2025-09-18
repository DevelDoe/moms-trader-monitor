// File: src/connections/chronos.js

const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const tickerStore = require("../store");
const { windows } = require("../windowManager");

const log = createLogger(__filename);

const URL = "wss://chronos.arcanemonitor.com:8443/ws";
const RECONNECT_DELAY_MS = 5000;

const DEBUG = process.env.DEBUG === "true";
const HOD_DEBUG = DEBUG && false;  // Only works when global DEBUG is true
const ALERT_DEBUG = DEBUG && false;  // Only works when global DEBUG is true

let reconnecting = false;
let ws;
let permanentlyRejected = false;
let CHRONOS_AUTH = null;
let firstHodListReceived = false;
let hodUpdateCount = 0;

// Configure which windows should receive Alert broadcasts
const ALERT_BROADCAST_TARGETS = [
    "events",
    "active", 
    "arcane",
    "frontline",
    "heroes",
    // Add more windows here as needed
];

// Configure which windows should receive HOD Top List broadcasts
const HOD_BROADCAST_TARGETS = [
    "scrollHod",
    // Add more windows here as needed:
    // "scrollXp",
    // etc.
];

const createWebSocket = () => {
    if (reconnecting) return;

    if (!CHRONOS_AUTH?.token || !CHRONOS_AUTH?.userId) {
        log.error("❌ Cannot connect — missing auth info");
        return;
    }

    reconnecting = true;

    ws = new WebSocket(URL);

    let clientId = null;

    ws.on("open", () => {
        reconnecting = false;
        clientId = `${CHRONOS_AUTH.userId}-terra`;
        hodUpdateCount = 0; // Reset HOD update counter on reconnect
        if (DEBUG) {
            log.log(`✅ Connected. Registering as ${clientId}`);
        }

        const manifest = {
            type: "register",
            manifest: {
                id: clientId,
                name: "Monitor",
                role: CHRONOS_AUTH.role || "monitor",
                realm: "terra",
                description: "Monitor Client",
                host: "terra",
                token: CHRONOS_AUTH.token,
            },
        };

        ws.send(JSON.stringify(manifest));
        if (DEBUG) {
            log.log("📤 Sent registration manifest");
        }
    });

    ws.on("message", (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (error) {
            log.error("❌ Failed to parse WebSocket message:", error.message);
            log.error("❌ Raw data length:", data.length);
            return;
        }
        
        // Log all message types to see what we're receiving (except alerts to avoid flooding)
        if (msg.type && msg.type !== "alert" && msg.type !== "ping" && msg.type !== "hod_price_update" && msg.type !== "hod_list") {
            log.log(`📨 Received message type: ${msg.type}`);
        }

        if (msg.type === "ping") {
            try {
                ws.send(JSON.stringify({ type: "pong", client_id: clientId }));
            } catch (err) {
                log.error("❌ Failed to send pong:", err.message);
            }
            return;
        }

        if (msg.type === "alert") {
            // Store the alert in ticker store
            if (tickerStore?.addEvent) {
                tickerStore.addEvent(msg.payload);
            } else {
                log.warn(`⚠️ tickerStore.addEvent not available`);
            }
            
            // Broadcast to all relevant windows
            broadcastAlert(msg.payload);
        }

        if (msg.type === "hod_list") {
            hodUpdateCount++;
            
            // Check if payload is too large
            const payloadSize = JSON.stringify(msg.payload).length;
            // log.log(`📊 HOD list size: ${payloadSize} bytes for ${msg.payload.length} items`);
            
            // if (msg.payload.length > 0) {
            //     const firstItemSize = JSON.stringify(msg.payload[0]).length;
            //     log.log(`📊 First item size: ${firstItemSize} bytes`);
            //     log.log(`📊 First item data:`, JSON.stringify(msg.payload[0], null, 2));
            // }
            
            if (payloadSize > 100000) { // 100KB limit
                log.warn(`⚠️ HOD list too large (${payloadSize} bytes), truncating to first 50 items`);
                msg.payload = msg.payload.slice(0, 50);
            }
            
            // Log HOD top list received
            if (HOD_DEBUG) {
                if (!firstHodListReceived) {
                    log.log(`🎯 First HOD top list received:`, JSON.stringify(msg.payload, null, 2));
                    firstHodListReceived = true;
                } else {
                    // log.log(`📊 HOD top list update #${hodUpdateCount} received (${msg.payload.length} symbols)`);
                    // Log first 3 items for updates
                    msg.payload.slice(0, 3).forEach((item, index) => {
                        log.log(`  ${index + 1}. ${item.symbol || item.name || 'Unknown'}: ${JSON.stringify(item)}`);
                    });
                    if (msg.payload.length > 3) {
                        log.log(`  ... and ${msg.payload.length - 3} more symbols`);
                    }
                }
            } 
            // Handle HOD top list data
            if (tickerStore?.updateHodTopList) {
                if (HOD_DEBUG) {
                    log.log(`💾 Storing HOD top list in tickerStore (${msg.payload.length} symbols)`);
                }
                tickerStore.updateHodTopList(msg.payload);
            } else {
                log.warn(`⚠️ tickerStore.updateHodTopList not available`);
            }
            
            // Broadcast to all relevant windows
            broadcastHodTopList(msg.payload);
        }

        if (msg.type === "hod_price_update") {
            // Handle individual price updates for HOD symbols
            if (HOD_DEBUG) {
                log.log(`💰 HOD price update received:`, JSON.stringify(msg.payload, null, 2));
            }
            
            // Update the price in tickerStore if it has an updateHodPrice method
            if (tickerStore?.updateHodPrice) {
                tickerStore.updateHodPrice(msg.payload);
            }
            
            // Broadcast price update to HOD windows
            broadcastHodPriceUpdate(msg.payload);
        }

        if (msg.type === "register_ack") {
            if (msg.status === "unauthorized") {
                log.warn("🚫 Registration rejected: unauthorized");
                permanentlyRejected = true;
                ws.close(4001, "Unauthorized");
                return;
            } else {
                if (DEBUG) {
                    log.log(`✅ Registered as ${msg.client_id}`);
                }
            }
        }
    });

    ws.on("close", (code, reason) => {
        log.warn(`🔌 Disconnected (code: ${code})`);
        if (!permanentlyRejected) {
            reconnectAfterDelay();
        } else {
            log.warn("❌ Will not reconnect after rejection");
        }
    });

    ws.on("error", (err) => {
        log.error("❌ WebSocket error:", err.message);
        if (ws.readyState !== WebSocket.OPEN && !reconnecting) {
            reconnectAfterDelay();
        }
    });

    ws.on("unexpected-response", (req, res) => {
        log.error("❌ Unexpected response:", res.statusCode);
    });
};

function broadcastAlert(payload) {
    // Broadcast to all configured target windows
    ALERT_BROADCAST_TARGETS.forEach((windowName) => {
        const w = windows[windowName];
        if (w?.webContents && !w.webContents.isDestroyed()) {
            w.webContents.send("ws-alert", payload);
        }
    });
    
    if (ALERT_DEBUG) {
        log.log(`✅ Alert broadcasted to ${ALERT_BROADCAST_TARGETS.length} windows`);
    }
}

function broadcastHodTopList(payload) {
    // Broadcast to all configured target windows
    let broadcastCount = 0;
    HOD_BROADCAST_TARGETS.forEach((windowName) => {
        const w = windows[windowName];
        if (w?.webContents && !w.webContents.isDestroyed()) {
            w.webContents.send("ws-hod-top-list", payload);
            broadcastCount++;
            // log.log(`📤 Sent HOD top list to ${windowName} window (${payload.length} symbols)`);
        } else {
            log.warn(`⚠️ HOD window ${windowName} not available or destroyed`);
        }
    });
    
    // log.log(`✅ HOD top list broadcasted to ${broadcastCount}/${HOD_BROADCAST_TARGETS.length} windows (${payload.length} symbols)`);
}

function broadcastHodPriceUpdate(payload) {
    // Broadcast price update to all configured HOD target windows
    let broadcastCount = 0;
    HOD_BROADCAST_TARGETS.forEach((windowName) => {
        const w = windows[windowName];
        if (w?.webContents && !w.webContents.isDestroyed()) {
            w.webContents.send("ws-hod-price-update", payload);
            broadcastCount++;
            if (HOD_DEBUG) {
                log.log(`📤 Sent HOD price update to ${windowName} window:`, payload.symbol || payload.name || 'Unknown');
            }
        } else {
            log.warn(`⚠️ HOD window ${windowName} not available or destroyed`);
        }
    });
    
    if (HOD_DEBUG) {
        log.log(`✅ HOD price update broadcasted to ${broadcastCount}/${HOD_BROADCAST_TARGETS.length} windows`);
    }
}

const reconnectAfterDelay = () => {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.terminate();
    }

    setTimeout(() => {
        reconnecting = false;
        createWebSocket();
    }, RECONNECT_DELAY_MS);
};

const chronos = (authData) => {
    CHRONOS_AUTH = authData;
    createWebSocket();
};

module.exports = { chronos };

