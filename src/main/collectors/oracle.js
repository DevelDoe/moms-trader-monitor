// File: src/connections/oracle.js
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const store = require("../store");
const { getLastAckCursor, setLastAckCursor } = require("../electronStores");
const { fetchOpsSince } = require("../collectors/arcane_api");
const { windows } = require("../windowManager");

const log = createLogger(__filename);

// Debug flag for XP data logging
const XP_DEBUG = false;

if (XP_DEBUG) {
    log.log("🔍 XP Debug logging enabled - will show detailed data structures");
}

const URL = "wss://oracle.arcanemonitor.com:8443/ws";
const RECONNECT_DELAY_MS = 5000;

let reconnecting = false;
let ws;
let permanentlyRejected = false;
let ORACLE_AUTH = null;
let lastCursor = 0;

let pulling = false;
let queuedTarget = 0;

// Store latest XP data for IPC requests
let latestActiveStocks = null;
let latestSessionHistory = null;
let latestSessionUpdate = null;

// Configure which windows should receive XP broadcasts
const XP_BROADCAST_TARGETS = [
    "scrollXp",
    "scrollHod",
    "sessionHistory",
    "scrollStats"
    // Add more windows here as needed:
    // "frontline",
    // "heroes",
    // etc.
];

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

function broadcastXpData(type, data) {
    // Only log session-related broadcasts
    if (type === 'session-history') {
        log.log(`📊 Broadcasting session history to ${XP_BROADCAST_TARGETS.length} windows`);
    }
    
    // Broadcast to all configured target windows
    XP_BROADCAST_TARGETS.forEach(windowName => {
        const w = windows[windowName];
        if (w?.webContents && !w.webContents.isDestroyed()) {
            w.webContents.send(`xp-${type}`, data);
        }
    });
}

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
            log.log(`�� SYMBOLS_INVALIDATE v${msg.version ?? "?"} items=${count}`);
            // Optional: delete listed, or trigger a fresh hydrate if it's a universe bump.
            if (count && store.deleteSymbols) {
                const syms = msg.items.map((s) => (typeof s === "string" ? s : s?.symbol)).filter(Boolean);
                store.deleteSymbols(syms);
            }
            return;
        }

        // Handle XP Session Management messages
        if (msg.type === "xp_session_history") {
            // C backend sends data directly, not wrapped in payload
            const sessionHistory = msg;
            
            // Dump top level structure to console for debugging
            console.log('🔍 === RAW XP SESSION HISTORY FROM BACKEND ===');
            console.log('🔍 Top level keys:', Object.keys(msg));
            console.log('🔍 Sessions count:', sessionHistory.sessions?.length || 0);
            console.log('🔍 Has current session:', sessionHistory.has_current_session || false);
            
            if (sessionHistory.sessions) {
                // Log all sessions with name & symbol count
                console.log('🔍 === ALL SESSIONS ===');
                sessionHistory.sessions.forEach(session => {
                    console.log(`🔍 ${session.session_name}: ${session.symbol_count} symbols`);
                });
            }
            
            // Store latest data and broadcast to windows (preserve original structure)
            latestSessionHistory = sessionHistory;
            broadcastXpData("session-history", latestSessionHistory);
            return;
        }

        if (msg.type === "xp_active_stocks") {
            // C backend sends data directly, not wrapped in payload
            const activeStocks = msg;
            
            // Only log when symbols count changes significantly (reduce flooding)
            if (latestActiveStocks?.symbols?.length !== activeStocks.symbols?.length) {
                log.log(`📊 XP Active Stocks: ${activeStocks.symbols?.length || 0} symbols`);
            }
            
            // Store latest data and broadcast to windows (preserve original structure)
            latestActiveStocks = activeStocks;
            broadcastXpData("active-stocks", latestActiveStocks);
            return;
        }

        if (msg.type === "xp_session_update") {
            // C backend sends data directly, not wrapped in payload
            const sessionUpdate = msg;
            
            if (sessionUpdate.sessions && sessionUpdate.sessions.length > 0) {
                const latest = sessionUpdate.sessions[sessionUpdate.sessions.length - 1];
                log.log(`📈 XP Session Update: ${latest.session_name} (${latest.symbol_count} symbols, ${latest.total_net_xp} net XP)`);
                
                // Store latest data (preserve original structure)
                latestSessionUpdate = sessionUpdate;
                
                // CRITICAL: Update the session history with the new session data
                // This ensures symbols arrays are preserved when sessions transition
                if (latestSessionHistory && latestSessionHistory.sessions) {
                    // Find and update the existing session, or add new one
                    const existingIndex = latestSessionHistory.sessions.findIndex(
                        s => s.session_name === latest.session_name
                    );
                    
                    if (existingIndex >= 0) {
                        // Update existing session with new data (preserve symbols array)
                        // Only update symbols if the update actually contains symbols
                        const existingSession = latestSessionHistory.sessions[existingIndex];
                        const updatedSession = {
                            ...existingSession,
                            ...latest,
                            // CRITICAL: Only overwrite symbols if the update actually contains symbols
                            // Session updates often don't contain the full symbols array
                            symbols: (latest.symbols && latest.symbols.length > 0) 
                                ? latest.symbols 
                                : existingSession.symbols
                        };
                        
                        latestSessionHistory.sessions[existingIndex] = updatedSession;
                        log.log(`🔄 Updated existing session ${latest.session_name} in history (preserved ${existingSession.symbols?.length || 0} symbols, update had ${latest.symbols?.length || 0} symbols)`);
                    } else {
                        // Add new session to history
                        latestSessionHistory.sessions.push(latest);
                        log.log(`➕ Added new session ${latest.session_name} to history`);
                    }
                    
                    // Broadcast updated session history to all windows
                    broadcastXpData("session-history", latestSessionHistory);
                }
                
                // Also broadcast the session update
                broadcastXpData("session-update", latestSessionUpdate);
            }
            return;
        }
    });

    ws.on("close", (code) => {
        log.warn(`�� Disconnected (code: ${code})`);
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

// IPC handlers for XP data requests
const getXpActiveStocks = () => {
    // log.log(`🔍 IPC getXpActiveStocks called, returning:`, latestActiveStocks ? 'data' : 'null');
    return latestActiveStocks;
};

const getXpSessionHistory = () => {
    if (latestSessionHistory) {
        log.log(`📊 IPC getXpSessionHistory: returning ${latestSessionHistory.sessions?.length || 0} sessions`);
    } else {
        log.log(`📊 IPC getXpSessionHistory: no data available`);
    }
    return latestSessionHistory;
};

const getXpSessionUpdate = () => {
    return latestSessionUpdate;
};

module.exports = { oracle, getXpActiveStocks, getXpSessionHistory, getXpSessionUpdate };
