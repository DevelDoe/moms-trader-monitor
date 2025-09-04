// File: src/connections/chronos.js

const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const tickerStore = require("../store");

const log = createLogger(__filename);

const URL = "wss://chronos.arcanemonitor.com:8443/ws";
const RECONNECT_DELAY_MS = 5000;

let reconnecting = false;
let ws;
let permanentlyRejected = false;
let CHRONOS_AUTH = null;

const createWebSocket = () => {
    if (reconnecting) return;

    if (!CHRONOS_AUTH?.token || !CHRONOS_AUTH?.userId) {
        log.error("[chronos] ❌ Cannot connect — missing auth info");
        return;
    }

    reconnecting = true;

    ws = new WebSocket(URL);

    let clientId = null;

    ws.on("open", () => {
        reconnecting = false;
        clientId = `${CHRONOS_AUTH.userId}-terra`;
        log.log(`[chronos] ✅ Connected. Registering as ${clientId}`);

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
        log.log("[chronos] 📤 Sent registration manifest");
    });

    ws.on("message", (data) => {
        const msg = JSON.parse(data);

        if (msg.type === "ping") {
            try {
                ws.send(JSON.stringify({ type: "pong", client_id: clientId }));
            } catch (err) {
                log.error("[chronos] ❌ Failed to send pong:", err.message);
            }
            return;
        }

        if (msg.type === "alert") {
            // Store the alert in ticker store
            if (tickerStore?.addEvent) {
                tickerStore.addEvent(msg.payload);
            } else {
                log.warn(`[chronos] ⚠️ tickerStore.addEvent not available`);
            }
            
            // Broadcast to all relevant windows
            broadcastAlert(msg.payload);
        }

        if (msg.type === "register_ack") {
            if (msg.status === "unauthorized") {
                log.warn("[chronos] 🚫 Registration rejected: unauthorized");
                permanentlyRejected = true;
                ws.close(4001, "Unauthorized");
                return;
            } else {
                log.log(`[chronos] ✅ Registered as ${msg.client_id}`);
            }
        }
    });

    ws.on("close", (code, reason) => {
        log.warn(`[chronos] 🔌 Disconnected (code: ${code})`);
        if (!permanentlyRejected) {
            reconnectAfterDelay();
        } else {
            log.warn("[chronos] ❌ Will not reconnect after rejection");
        }
    });

    ws.on("error", (err) => {
        log.error("[chronos] ❌ WebSocket error:", err.message);
        if (ws.readyState !== WebSocket.OPEN && !reconnecting) {
            reconnectAfterDelay();
        }
    });

    ws.on("unexpected-response", (req, res) => {
        log.error("[chronos] ❌ Unexpected response:", res.statusCode);
    });
};

function broadcastAlert(payload) {
    const { broadcast } = require("../utils/broadcast");
    
    try {
        broadcast("ws-alert", payload);
        // log.log(`[chronos] ✅ Alert broadcasted successfully`);
    } catch (err) {
        log.error(`[chronos] ❌ Failed to broadcast alert:`, err.message);
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
