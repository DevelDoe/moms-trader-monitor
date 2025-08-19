// File: src/connections/oracle.js
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const store = require("../store");
const { getLastAckCursor, setLastAckCursor } = require("../electronStores");
const { fetchOpsSince } = require("../collectors/arcane_api");

const log = createLogger(__filename);

const URL = "wss://oracle.arcanemonitor.com:8443/ws";
const RECONNECT_DELAY_MS = 5000;

let reconnecting = false;
let ws;
let permanentlyRejected = false;
let ORACLE_AUTH = null;
let lastCursor = 0;

let pulling = false;
let queuedTarget = 0;

// ---- utils ----
const safeParse = (data) => {
    try {
        const sanitized = data.toString().replace(/[^\x20-\x7F]/g, "");
        return JSON.parse(sanitized);
    } catch {
        log.error("Failed to parse message:", data.toString());
        return null;
    }
};

const asNum = (n, fb = NaN) => {
    const x = Number(n);
    return Number.isFinite(x) ? x : fb;
};

async function pullUntil(target) {
    const goal = asNum(target, NaN);
    if (!Number.isFinite(goal)) return getLastAckCursor() || 0;

    let cursor = getLastAckCursor() || 0;

    while (cursor < goal) {
        // API shape: { from, to, ops, hasMore }
        const page = await fetchOpsSince(cursor, 1000);
        const ops = Array.isArray(page?.ops) ? page.ops : [];
        if (!ops.length) break;

        const upserts = [];
        const removes = [];
        let maxVer = cursor;

        for (const op of ops) {
            const ver = asNum(op.ver, maxVer);
            if (ver > maxVer) maxVer = ver;

            if (op.type === "upsert" && op.doc && op.symbol) {
                upserts.push({ symbol: String(op.symbol).toUpperCase(), ...op.doc });
            } else if (op.type === "remove" && op.symbol) {
                removes.push(String(op.symbol).toUpperCase());
            }
        }

        if (upserts.length) store.addSymbols(upserts);
        // if (removes.length && store.deleteSymbols) store.deleteSymbols(removes);

        cursor = maxVer;
        setLastAckCursor(cursor);

        if (!page.hasMore) break;
    }

    lastCursor = cursor;
    return cursor;
}

async function pullToAtLeast(target) {
    const want = asNum(target, NaN);
    if (!Number.isFinite(want)) return getLastAckCursor() || 0;

    queuedTarget = Math.max(queuedTarget || 0, want);
    if (pulling) return queuedTarget; // let the running loop pick it up

    pulling = true;
    try {
        while (true) {
            const have = getLastAckCursor() || 0;
            const goal = Math.max(queuedTarget || 0, want);
            if (have >= goal) break;
            await pullUntil(goal); // your existing function
            // pullUntil updates lastCursor + setLastAckCursor
            if ((getLastAckCursor() || 0) >= goal) break;
        }
        return getLastAckCursor() || 0;
    } finally {
        pulling = false;
        queuedTarget = 0;
    }
}

const reconnectAfterDelay = () => {
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.terminate();
    setTimeout(() => {
        reconnecting = false;
        createWebSocket();
    }, RECONNECT_DELAY_MS);
};

const createWebSocket = () => {
    if (reconnecting) return;

    if (!ORACLE_AUTH?.token || !ORACLE_AUTH?.userId) {
        log.error("❌ Cannot connect — missing auth info");
        return;
    }

    reconnecting = true;
    ws = new WebSocket(URL);

    let clientId = null;

    ws.on("open", () => {
        reconnecting = false;
        clientId = `${ORACLE_AUTH.userId}-terra`;
        log.log(`✅ Connected. Registering as ${clientId}`);

        const manifest = {
            type: "register",
            manifest: {
                id: clientId,
                name: "Monitor",
                role: ORACLE_AUTH.role || "monitor",
                realm: "terra",
                description: "Monitor Client",
                host: "terra",
                token: ORACLE_AUTH.token,
            },
        };

        ws.send(JSON.stringify(manifest));
        log.log("📤 Sent registration manifest");
    });

    ws.on("message", async (data) => {
        const msg = safeParse(data);
        if (!msg) return;

        if (msg.type === "ping") {
            try {
                ws.send(JSON.stringify({ type: "pong", client_id: clientId }));
            } catch (err) {
                log.error("❌ Failed to send pong:", err.message);
            }
            return;
        }

        if (msg.type === "register_ack") {
            if (msg.status === "unauthorized") {
                log.warn("🚫 Registration rejected: unauthorized");
                permanentlyRejected = true;
                ws.close(4001, "Unauthorized");
                return;
            } else {
                log.log(`✅ Registered as ${msg.client_id}`);
                // seed local cursor from persisted value
                lastCursor = getLastAckCursor() || 0;
                return;
            }
        }

        const type = String(msg.type || "").toUpperCase();
        const target = asNum(msg.cursor, NaN);

        // Treat both upsert & delete as a doorbell with a target cursor.
        if (type === "SYMBOLS_UPSERT" || type === "SYMBOLS_DELETE") {
            log.log(`🔔 ${type} doorbell: target cursor=${Number.isFinite(target) ? target : "?"}`);
            try {
                const after = await pullToAtLeast(target);
                log.log(`✅ caught up to cursor=${after}`);
            } catch (e) {
                log.error("delta pull failed:", e.message);
            }
            return;
        }

        if (type === "SYMBOLS_INVALIDATE" || type === "SYMBOLS_INVALIDATION" || type === "SYMBOLS_INVALIDATE_UNIVERSE" || msg.type === "symbols_invalidate") {
            const count = Array.isArray(msg.items) ? msg.items.length : 0;
            log.log(`🧹 SYMBOLS_INVALIDATE v${msg.version ?? "?"} items=${count}`);
            // Optional: delete listed, or trigger a fresh hydrate if it's a universe bump.
            if (count && store.deleteSymbols) {
                const syms = msg.items.map((s) => (typeof s === "string" ? s : s?.symbol)).filter(Boolean);
                store.deleteSymbols(syms);
            }
            return;
        }
    });

    ws.on("close", (code) => {
        log.warn(`🔌 Disconnected (code: ${code})`);
        if (!permanentlyRejected) reconnectAfterDelay();
        else log.warn("❌ Will not reconnect after rejection");
    });

    ws.on("error", (err) => {
        log.error("❌ WebSocket error:", err.message);
        if (ws.readyState !== WebSocket.OPEN && !reconnecting) reconnectAfterDelay();
    });

    ws.on("unexpected-response", (_req, res) => {
        log.error("❌ Unexpected response:", res.statusCode);
    });
};

const oracle = (authData) => {
    ORACLE_AUTH = authData;
    permanentlyRejected = false;
    createWebSocket();
};

module.exports = { oracle };
