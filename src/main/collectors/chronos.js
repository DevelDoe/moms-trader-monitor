// File: src/connections/chronos.js

const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const { windows } = require("../windowManager");
const tickerStore = require("../store");

const log = createLogger(__filename);

const URL = "wss://chronos.arcanemonitor.com:8443/ws";
const RECONNECT_DELAY_MS = 5000;

let reconnecting = false;
let ws;
let permanentlyRejected = false;
let CHRONOS_AUTH = null;

const safeParse = (data) => {
    try {
        const sanitized = data.toString().replace(/[^\x20-\x7F]/g, "");
        return JSON.parse(sanitized);
    } catch (err) {
        log.error("[chronos] Failed to parse message:", data.toString());
        return null;
    }
};

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
        const msg = safeParse(data);
        if (!msg) return;

        if (msg.type === "ping") {
            // log.log("[chronos] ↪️ Received ping, sending pong");
            try {
                ws.send(JSON.stringify({ type: "pong", client_id: clientId }));
            } catch (err) {
                log.error("[chronos] ❌ Failed to send pong:", err.message);
            }
            return;
        }

        if (msg.type === "alert") {
            log.log(`[chronos] 🚨 ALERT received:`, {
                type: msg.type,
                payloadKeys: Object.keys(msg.payload),
                sampleData: {
                    hero: msg.payload.hero,
                    price: msg.payload.price,
                    hp: msg.payload.hp,
                    dp: msg.payload.dp,
                    strength: msg.payload.strength,
                    volume: msg.payload.one_min_volume
                }
            });

            // Store the alert in ticker store
            if (tickerStore?.addEvent) {
                tickerStore.addEvent(msg.payload);
            } else {
                log.warn(`[chronos] ⚠️ tickerStore.addEvent not available`);
            }

            // Broadcast to all relevant windows
            // log.log(`[chronos] 📡 Broadcasting alert to windows`);
            broadcastAlert(msg.payload);
        }

        if (msg.type === "register_ack") {
            if (msg.status === "unauthorized") {
                log.warn("[chronos] 🚫 Registration rejected: unauthorized");
                permanentlyRejected = true; // ✅ Prevent retry
                ws.close(4001, "Unauthorized");
                return;
            } else {
                log.log(`[chronos] ✅ Registered as ${msg.client_id}`);
            }
        }

        // TODO: Handle real-time data messages here later

        // log.log("[chronos] 📥 Message from CDSH:", JSON.stringify(msg));
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
    // log.log(`[chronos] 📡 Broadcasting to windows:`, {
    //     events: !!windows.events,
    //     frontline: !!windows.frontline,
    //     heroes: !!windows.heroes,
    //     scrollHod: !!windows.scrollHod,
    //     progress: !!windows.progress
    // });
    
    // Add progress window to the broadcast list
    const targetWindows = [
        { name: 'events', window: windows.events },
        { name: 'frontline', window: windows.frontline },
        { name: 'heroes', window: windows.heroes },
        { name: 'scrollHod', window: windows.scrollHod },
        { name: 'progress', window: windows.progress }
    ];
    
    for (const { name, window: w } of targetWindows) {
        if (w?.webContents && !w.webContents.isDestroyed()) {
            try {
                // log.log(`[chronos] 📤 Sending alert to ${name} (ID: ${w.id})`);
                w.webContents.send("ws-alert", payload);
            } catch (err) {
                log.error(`[chronos] ❌ Failed to send to ${name}:`, err.message);
            }
        } else {
            log.warn(`[chronos] ⚠️ ${name} not available:`, {
                exists: !!w,
                hasWebContents: !!(w?.webContents),
                isDestroyed: w?.webContents?.isDestroyed?.() || 'unknown'
            });
        }
    }
}

const reconnectAfterDelay = () => {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.terminate(); // Cleanup just in case
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
