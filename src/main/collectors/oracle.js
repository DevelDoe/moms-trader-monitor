// File: src/connections/oracle.js
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const store = require("../store");
const { getLastAckCursor, setLastAckCursor } = require("../electronStores");
const { fetchOpsSince } = require("../collectors/arcane_api");
const { windows } = require("../windowManager");

const log = createLogger(__filename);

// Debug flags for different features - can be toggled independently when DEBUG=true
const DEBUG = process.env.DEBUG === "true";
const XP_DEBUG = DEBUG && false;        // XP data logging
const NEWS_DEBUG = DEBUG && false;      // News data logging  
const FILING_DEBUG = DEBUG && true;    // Filing data logging
const SESSION_DEBUG = DEBUG && false;   // Session data logging
const SYMBOL_DEBUG = DEBUG && false;    // Symbol data logging
const HYDRATION_DEBUG = DEBUG && true;    // Symbol data logging

if (XP_DEBUG) {
    log.log("🔍 XP Debug logging enabled - will show detailed XP data structures");
}
if (NEWS_DEBUG) {
    log.log("📰 News Debug logging enabled - will show detailed news data structures");
}
if (FILING_DEBUG) {
    log.log("📁 Filing Debug logging enabled - will show detailed filing data structures");
}
if (HYDRATION_DEBUG) {
    log.log("🔄 Hydration Debug logging enabled - will show hydration flow details");
}
if (SESSION_DEBUG) {
    log.log("📊 Session Debug logging enabled - will show detailed session data structures");
}
if (SYMBOL_DEBUG) {
    log.log("🔔 Symbol Debug logging enabled - will show detailed symbol data structures");
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

// Store latest news data for IPC requests
let latestNewsHeadlines = null;
let latestNewsCount = 0;

// Store latest filing data for IPC requests
let latestFilings = null;
let latestFilingCount = 0;
let hasLoggedFilingStructure = false;

// Configure which windows should receive XP broadcasts
const XP_BROADCAST_TARGETS = [
    "scrollXp",
    "sessionHistory",
    "scrollStats",
    "progress",
    // Add more windows here as needed:
    // "frontline",
    // "heroes",
    // etc.
];

// Configure which windows should receive News broadcasts
const NEWS_BROADCAST_TARGETS = [
    "news",
    "active",
    "infobar",
];

// Configure which windows should receive Filing broadcasts
const FILING_BROADCAST_TARGETS = [
    "news",
    "active",
    "infobar",
];

// ---- utils ----

const asNum = (n, fb = NaN) => {
    const x = Number(n);
    return Number.isFinite(x) ? x : fb;
};

function broadcastXpData(type, data) {
    // Only log session-related broadcasts
    if (type === "session-history") {
        if (SESSION_DEBUG) {
            log.log(`📊 Broadcasting session history to ${XP_BROADCAST_TARGETS.length} windows`);
        }
    }

    // Broadcast to all configured target windows
    XP_BROADCAST_TARGETS.forEach((windowName) => {
        const w = windows[windowName];
        if (w?.webContents && !w.webContents.isDestroyed()) {
            w.webContents.send(`xp-${type}`, data);
        }
    });
}

function broadcastRefreshSignal() {
    // Broadcast refresh signal to all windows that consume news and filings data
    const allTargets = [...new Set([...NEWS_BROADCAST_TARGETS, ...FILING_BROADCAST_TARGETS])];
    
    if (HYDRATION_DEBUG) {
        log.log(`🔄 Broadcasting refresh signal to ${allTargets.length} windows after hydration completion`);
    }
    
    allTargets.forEach((windowName) => {
        const w = windows[windowName];
        if (w?.webContents && !w.webContents.isDestroyed()) {
            w.webContents.send("oracle-hydration-complete");
            if (HYDRATION_DEBUG) {
                log.log(`🔄 Sent refresh signal to ${windowName} window`);
            }
        } else {
            if (HYDRATION_DEBUG) {
                log.log(`⚠️ Window '${windowName}' not available for refresh signal (exists: ${!!w}, destroyed: ${w?.isDestroyed?.()})`);
            }
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
        if (DEBUG) {
            log.log(`✅ Connected. Registering as ${clientId}`);
        }

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

        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(manifest));
                if (DEBUG) {
                    log.log("📤 Sent registration manifest");
                }
            } else {
                log.warn("⚠️ WebSocket not ready for registration, readyState:", ws.readyState);
            }
        } catch (err) {
            log.error("❌ Failed to send registration manifest:", err.message);
        }
    });

    ws.on("message", async (data) => {
        let msg;
        try {
            // Handle potential buffer/encoding issues
            const dataStr = data.toString('utf8');
            if (!dataStr || dataStr.trim() === '') {
                log.warn("⚠️ Received empty message, skipping");
                return;
            }
            msg = JSON.parse(dataStr);
        } catch (err) {
            log.error("❌ Failed to parse WebSocket message:", err.message);
            log.error("❌ Raw data:", data.toString('hex').substring(0, 100) + "...");
            return;
        }

        if (msg.type === "ping") {
            try {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "pong", client_id: clientId }));
                } else {
                    log.warn("⚠️ Cannot send pong - WebSocket not open, readyState:", ws.readyState);
                }
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
                if (DEBUG) {
                    log.log(`✅ Registered as ${msg.client_id}`);
                    
                    // Log which windows are available for news broadcasting
                    if (NEWS_DEBUG) {
                        log.log(`🔍 Available windows for news broadcasting:`);
                        NEWS_BROADCAST_TARGETS.forEach((windowName) => {
                            const w = windows[windowName];
                            const exists = !!w;
                            const destroyed = w?.isDestroyed?.() || false;
                            const available = exists && !destroyed;
                            log.log(`  - ${windowName}: ${available ? '✅ available' : `❌ not available (exists: ${exists}, destroyed: ${destroyed})`}`);
                        });
                    }
                }
                // seed local cursor from persisted value
                lastCursor = getLastAckCursor() || 0;

                // Request hydration (both headlines and filings) on successful registration
                if (HYDRATION_DEBUG) {
                    log.log("🔄 [ORACLE] Registration complete - requesting hydration...");
                }
                requestHydration();
                return;
            }
        }

        const type = String(msg.type || "").toUpperCase();
        const target = asNum(msg.cursor, NaN);

        // Treat both upsert & delete as a doorbell with a target cursor.
        if (type === "SYMBOLS_UPSERT" || type === "SYMBOLS_DELETE") {
            if (SYMBOL_DEBUG) {
                log.log(`🔔 ${type} doorbell: target cursor=${Number.isFinite(target) ? target : "?"}`);
            }
            try {
                const after = await pullToAtLeast(target);
                if (SYMBOL_DEBUG) {
                    log.log(`✅ caught up to cursor=${after}`);
                }
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
            if (SESSION_DEBUG) { 
                log.log("🔍 === RECEIVED SESSION HISTORY FROM BACKEND ===");
                log.log("🔍 Top keys:", Object.keys(msg));
                log.log("🔍 Session count:", sessionHistory.sessions?.length || 0);
                log.log("🔍 Has current session:", sessionHistory.has_current_session || false);
            }

            if (sessionHistory.sessions) {
                // Log all sessions with name & symbol count
                if (SESSION_DEBUG) {
                    log.log("🔍 === ALL SESSIONS ===");
                    sessionHistory.sessions.forEach((session) => {
                        log.log(`🔍 ${session.session_name}: ${session.symbol_count} symbols`);
                    });
                }
            }

            // Store latest data and broadcast to windows (preserve original structure)
            latestSessionHistory = sessionHistory;
            broadcastXpData("session-history", latestSessionHistory);
            return;
        }

        if (msg.type === "xp_active_stocks") {
            // C backend sends data directly, not wrapped in payload
            const activeStocks = msg;

            // Store latest data and broadcast to windows (preserve original structure)
            latestActiveStocks = activeStocks;

            // Send specific count to progress window BEFORE truncation
            const progressWindow = windows["progress"];
            if (progressWindow?.webContents && !progressWindow.webContents.isDestroyed()) {
                progressWindow.webContents.send("xp-active-stocks-count", {
                    count: activeStocks.symbols?.length || 0,
                    timestamp: Date.now()
                });
            }

            // Create truncated version for other windows (top 50 symbols)
            const truncatedActiveStocks = {
                ...activeStocks,
                symbols: activeStocks.symbols ? activeStocks.symbols.slice(0, 50) : []
            };

            // Broadcast truncated data to other windows
            broadcastXpData("active-stocks", truncatedActiveStocks);

            return;
        }

        if (msg.type === "xp_session_update") {
            // C backend sends data directly, not wrapped in payload
            const sessionUpdate = msg;

            if (sessionUpdate.sessions && sessionUpdate.sessions.length > 0) {
                const latest = sessionUpdate.sessions[sessionUpdate.sessions.length - 1];
                if (SESSION_DEBUG) {
                    log.log(`📈 XP Session Update: ${latest.session_name} (${latest.symbol_count} symbols, ${latest.total_net_xp} net XP)`);
                }

                // Store latest data (preserve original structure)
                latestSessionUpdate = sessionUpdate;

                // CRITICAL: Update the session history with the new session data
                // This ensures symbols arrays are preserved when sessions transition
                if (latestSessionHistory && latestSessionHistory.sessions) {
                    // Find and update the existing session, or add new one
                    const existingIndex = latestSessionHistory.sessions.findIndex((s) => s.session_name === latest.session_name);

                    if (existingIndex >= 0) {
                        // Update existing session with new data (preserve symbols array)
                        // Only update symbols if the update actually contains symbols
                        const existingSession = latestSessionHistory.sessions[existingIndex];
                        const updatedSession = {
                            ...existingSession,
                            ...latest,
                            // CRITICAL: Only overwrite symbols if the update actually contains symbols
                            // Session updates often don't contain the full symbols array
                            symbols: latest.symbols && latest.symbols.length > 0 ? latest.symbols : existingSession.symbols,
                        };

                        latestSessionHistory.sessions[existingIndex] = updatedSession;
                        if (SESSION_DEBUG) {
                            log.log(
                                `🔄 Updated existing session ${latest.session_name} in history (preserved ${existingSession.symbols?.length || 0} symbols, update had ${
                                    latest.symbols?.length || 0
                                } symbols)`
                            );
                        }
                    } else {
                        // Add new session to history
                        latestSessionHistory.sessions.push(latest);
                        if (SESSION_DEBUG) {
                            log.log(`➕ Added new session ${latest.session_name} to history`);
                        }
                    }

                    // Broadcast updated session history to all windows
                    broadcastXpData("session-history", latestSessionHistory);
                }

                // Also broadcast the session update
                broadcastXpData("session-update", latestSessionUpdate);
            }
            return;
        }

        // Handle Hydration Response (both headlines and filings)
        // Check for various possible hydration message types
        if (msg.type === "hydration_response" || msg.type === "news_list" || msg.type === "headlines_list" || msg.type === "full_news_list") {
            const payload = msg.payload || {};
            const headlines = payload.headlines || [];
            const filings = payload.filings || [];
            const metadata = payload.metadata || {};

            if (HYDRATION_DEBUG) {
                log.log(`🔄 [ORACLE] HYDRATION STARTED: ${headlines.length} headlines, ${filings.length} filings`);
            }
            if (NEWS_DEBUG || FILING_DEBUG) {
                log.log(`📊 Metadata: headlines_count=${metadata.headlines_count}, filings_count=${metadata.filings_count}`);
            }

            // FRESH START: Clear all existing news and filings data before processing new data
            // This ensures we start clean on reconnects/rehydration
            log.log("🧹 [ORACLE] Starting fresh - clearing all existing news and filings data");
            store.clearAllNews();
            store.clearAllFilings();
            
            // Clear local cached data as well
            latestNewsHeadlines = null;
            latestFilings = null;
            latestNewsCount = 0;
            latestFilingCount = 0;

            // Handle headlines
            if (headlines.length > 0) {
                if (NEWS_DEBUG) {
                    log.log(`📰 [ORACLE] Processing ${headlines.length} headlines for symbol attachment`);
                }
                
                // Store latest headlines data
                latestNewsHeadlines = headlines;
                
                // Debug: Log the structure of the first headline
                if (NEWS_DEBUG && headlines.length > 0) {
                    log.log(`📰 First headline structure:`, JSON.stringify(headlines[0], null, 2));
                }

                // Attach news to individual symbols
                let attachmentCount = 0;
                headlines.forEach((newsItem) => {
                    if (newsItem.symbols && Array.isArray(newsItem.symbols)) {
                        newsItem.symbols.forEach((symbol) => {
                            store.attachNewsToSymbol(newsItem, symbol);
                            attachmentCount++;
                        });
                    }
                });
                if (NEWS_DEBUG) {
                    log.log(`📰 [ORACLE] Attached news to ${attachmentCount} symbol instances`);
                }

            // Broadcast to all configured news target windows with hydration flag
            let actualBroadcastCount = 0;
            NEWS_BROADCAST_TARGETS.forEach((windowName) => {
                const w = windows[windowName];
                if (w?.webContents && !w.webContents.isDestroyed()) {
                    w.webContents.send("news-headlines", headlines, { isHydration: true });
                    actualBroadcastCount++;
                } else {
                    if (NEWS_DEBUG) {
                        log.log(`⚠️ News window '${windowName}' not available for headlines broadcast (exists: ${!!w}, destroyed: ${w?.isDestroyed?.()})`);
                    }
                }
            });

                if (NEWS_DEBUG) {
                    log.log(`📤 Broadcasted ${headlines.length} headlines to ${actualBroadcastCount}/${NEWS_BROADCAST_TARGETS.length} windows`);
                }
            }

            // Handle filings
            if (filings.length > 0) {
                if (FILING_DEBUG) {
                    log.log(`📁 [ORACLE] Processing ${filings.length} filings for symbol attachment`);
                }
                
                // Store latest filings data
                latestFilings = filings;
                if(HYDRATION_DEBUG) {
                    log.log(`📁 [ORACLE] HYDRATION: Stored ${filings.length} filings in latestFilings`);
                }

                // Log filing object structure only once (from hydration or delta)
                if (FILING_DEBUG && !hasLoggedFilingStructure && filings.length > 0) {
                    log.log(`📁 Filing object structure (first time from hydration):`, JSON.stringify(filings[0], null, 2));
                    hasLoggedFilingStructure = true;
                }

                // Attach filings to individual symbols
                let filingAttachmentCount = 0;
                filings.forEach((filingItem) => {
                    if (filingItem.symbols && Array.isArray(filingItem.symbols)) {
                        filingItem.symbols.forEach((symbol) => {
                            store.attachFilingToSymbol(filingItem, symbol);
                            filingAttachmentCount++;
                            log.log(`📁 [ORACLE] HYDRATION: Attached filing to symbol ${symbol}`);
                        });
                    } else if (filingItem.symbol) {
                        // Handle single symbol case
                        store.attachFilingToSymbol(filingItem, filingItem.symbol);
                        filingAttachmentCount++;
                        log.log(`📁 [ORACLE] HYDRATION: Attached filing to single symbol ${filingItem.symbol}`);
                    } else {
                        log.log(`📁 [ORACLE] HYDRATION: Filing has no symbol or symbols array:`, {
                            symbol: filingItem.symbol,
                            symbols: filingItem.symbols,
                            title: filingItem.title
                        });
                    }
                });
                if (FILING_DEBUG) {
                    log.log(`📁 [ORACLE] Attached filings to ${filingAttachmentCount} symbol instances`);
                }

                // Broadcast to all configured filing target windows with hydration flag
                let actualBroadcastCount = 0;
                FILING_BROADCAST_TARGETS.forEach((windowName) => {
                    const w = windows[windowName];
                    if (w?.webContents && !w.webContents.isDestroyed()) {
                        w.webContents.send("filing-headlines", filings, { isHydration: true });
                        actualBroadcastCount++;
                        log.log(`📁 [ORACLE] HYDRATION: Broadcasted ${filings.length} filings to ${windowName}`);
                    } else {
                        log.log(`📁 [ORACLE] HYDRATION: Window '${windowName}' not available for filing broadcast (exists: ${!!w}, destroyed: ${w?.isDestroyed?.()})`);
                    }
                });
                log.log(`📁 [ORACLE] HYDRATION: Broadcasted filings to ${actualBroadcastCount}/${FILING_BROADCAST_TARGETS.length} windows`);

                if (FILING_DEBUG) {
                    log.log(`📤 Broadcasted ${filings.length} filings to ${FILING_BROADCAST_TARGETS.length} windows`);
                }
            }

            // Update counts
            latestNewsCount = metadata.headlines_count || headlines.length;
            latestFilingCount = metadata.filings_count || filings.length;

            if (HYDRATION_DEBUG) {
                log.log(`✅ [ORACLE] HYDRATION COMPLETE: ${headlines.length} headlines, ${filings.length} filings processed`);
            }
            
            // Mark news hydration as complete so news buffs will be computed going forward
            store.markNewsHydrationComplete();

            // Broadcast refresh signal to all windows that consume news and filings data
            // This ensures they refresh themselves to get the updated (potentially empty) data
            broadcastRefreshSignal();

            return;
        }

        // Handle News Management messages (legacy support)
        if (msg.type === "news_response") {
            // Handle full headlines list response
            const headlines = msg.headlines || [];
            if (NEWS_DEBUG) {
                log.log(`📰 Received ${headlines.length} headlines from CDSH news store`);
            }

            // Store latest headlines data
            latestNewsHeadlines = headlines;

            // Broadcast to all configured news target windows
            let actualBroadcastCount = 0;
            NEWS_BROADCAST_TARGETS.forEach((windowName) => {
                const w = windows[windowName];
                if (w?.webContents && !w.webContents.isDestroyed()) {
                    w.webContents.send("news-headlines", headlines);
                    actualBroadcastCount++;
                } else {
                    if (NEWS_DEBUG) {
                        log.log(`⚠️ News window '${windowName}' not available for legacy headlines broadcast (exists: ${!!w}, destroyed: ${w?.isDestroyed?.()})`);
                    }
                }
            });

            if (NEWS_DEBUG) {
                log.log(`📤 Broadcasted ${headlines.length} headlines to ${actualBroadcastCount}/${NEWS_BROADCAST_TARGETS.length} windows`);
            }
            return;
        }

        if (msg.type === "news_delta") {
            // Handle real-time news updates
            const newsItem = msg.news || msg;
            // if (process.env.DEBUG === "true") {
            //     log.log(`📰 Received news delta: ${newsItem.symbol || "unknown"} - ${newsItem.headline || "no title"}`);
            // }

            // Attach news to individual symbols
            if (newsItem.symbols && Array.isArray(newsItem.symbols)) {
                newsItem.symbols.forEach((symbol) => {
                    store.attachNewsToSymbol(newsItem, symbol);
                });
            }

            // Add to existing headlines (if we have them)
            if (latestNewsHeadlines && Array.isArray(latestNewsHeadlines)) {
                latestNewsHeadlines.unshift(newsItem); // Add to beginning for latest first

                // Keep only last 1000 headlines to prevent memory bloat
                if (latestNewsHeadlines.length > 1000) {
                    latestNewsHeadlines = latestNewsHeadlines.slice(0, 1000);
                }
            } else {
                // Initialize with this single item
                latestNewsHeadlines = [newsItem];
            }

            // Broadcast delta update to all configured news target windows with delta flag
            let actualBroadcastCount = 0;
            NEWS_BROADCAST_TARGETS.forEach((windowName) => {
                const w = windows[windowName];
                if (w?.webContents && !w.webContents.isDestroyed()) {
                    w.webContents.send("news-delta", newsItem, { isDelta: true });
                    actualBroadcastCount++;
                } else {
                    if (NEWS_DEBUG) {
                        log.log(`⚠️ News window '${windowName}' not available for broadcast (exists: ${!!w}, destroyed: ${w?.isDestroyed?.()})`);
                    }
                }
            });

            if (NEWS_DEBUG) {
                log.log(`📤 Broadcasted news delta to ${actualBroadcastCount}/${NEWS_BROADCAST_TARGETS.length} windows`);
            }
            return;
        }

        if (msg.type === "filing_delta") {
            // Handle real-time filing updates
            const filingItem = msg.filing || msg;
            if (FILING_DEBUG) {
                log.log(`📁 Received filing delta: ${filingItem.symbol || "unknown"} - ${filingItem.form_type || "no type"} - ${filingItem.title || "no title"}`);
                
                
                // Log filing object structure only once
                if (FILING_DEBUG && !hasLoggedFilingStructure) {
                    log.log(`📁 Filing object structure (first time):`, JSON.stringify(filingItem, null, 2));
                    hasLoggedFilingStructure = true;
                }
            }

            // Attach filing to individual symbols
            if (filingItem.symbols && Array.isArray(filingItem.symbols)) {
                filingItem.symbols.forEach((symbol) => {
                    store.attachFilingToSymbol(filingItem, symbol);
                });
            } else if (filingItem.symbol) {
                // Handle single symbol case
                store.attachFilingToSymbol(filingItem, filingItem.symbol);
            }

            // Add to existing filings (if we have them)
            if (latestFilings && Array.isArray(latestFilings)) {
                latestFilings.unshift(filingItem); // Add to beginning for latest first

                // Keep only last 1000 filings to prevent memory bloat
                if (latestFilings.length > 1000) {
                    latestFilings = latestFilings.slice(0, 1000);
                }
            } else {
                // Initialize with this single item
                latestFilings = [filingItem];
            }

            // Broadcast delta update to all configured filing target windows with delta flag
            FILING_BROADCAST_TARGETS.forEach((windowName) => {
                const w = windows[windowName];
                if (w?.webContents && !w.webContents.isDestroyed()) {
                    w.webContents.send("filing-delta", filingItem, { isDelta: true });
                }
            });

            if (FILING_DEBUG) {
                log.log(`📤 Broadcasted filing delta to ${FILING_BROADCAST_TARGETS.length} windows`);
            }
            return;
        }

        if (msg.type === "news_count") {
            // Handle news count response
            const count = msg.count || 0;
            if (NEWS_DEBUG) {
                log.log(`📊 News count: ${count} headlines available`);
            }

            // Store latest count
            latestNewsCount = count;

            // Broadcast count to all configured news target windows
            NEWS_BROADCAST_TARGETS.forEach((windowName) => {
                const w = windows[windowName];
                if (w?.webContents && !w.webContents.isDestroyed()) {
                    w.webContents.send("news-count", count);
                }
            });

            return;
        }

        // Log all message types to see what we're receiving
        if (msg.type && msg.type !== "ping" && msg.type !== "pong") {
            log.log(`📨 [ORACLE] Received message type: ${msg.type}`);
            
            // Log additional details for hydration-related messages
            if (msg.type.includes("hydration") || msg.type.includes("news") || msg.type.includes("filing")) {
                log.log(`📨 [ORACLE] Message details:`, {
                    type: msg.type,
                    hasPayload: !!msg.payload,
                    payloadKeys: msg.payload ? Object.keys(msg.payload) : null,
                    headlinesCount: msg.payload?.headlines?.length || 0,
                    filingsCount: msg.payload?.filings?.length || 0
                });
            }
        }

        // Debug: Log any unhandled message types (but not client_list)
        if (DEBUG && msg.type !== "client_list") {
            log.log(`🔍 DEBUG: Unhandled message type: ${msg.type}`);
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

// Hydration request function (replaces separate news and filing requests)
function requestHydration() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        log.warn("⚠️ Cannot request hydration - WebSocket not open");
        return;
    }

    const request = {
        type: "hydration_request",
        client_id: `${ORACLE_AUTH.userId}-terra`,
    };

    try {
        ws.send(JSON.stringify(request));
        if (HYDRATION_DEBUG) {
            log.log("🔄 [ORACLE] Requested hydration (headlines + filings) from CDSH");
        }
        if (NEWS_DEBUG || FILING_DEBUG) {
            log.log("🔄 Requested hydration (headlines + filings) from CDSH");
        }
    } catch (err) {
        log.error("❌ Failed to request hydration:", err.message);
    }
}

// Legacy news request functions (kept for backward compatibility)
function requestHeadlines() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        log.warn("⚠️ Cannot request headlines - WebSocket not open");
        return;
    }

    const request = {
        type: "news_request",
        client_id: `${ORACLE_AUTH.userId}-terra`,
        payload: {
            request_type: "full_list",
        },
    };

    try {
        ws.send(JSON.stringify(request));
        if (NEWS_DEBUG) {
            log.log("📰 Requested full headlines list from CDSH");
        }
    } catch (err) {
        log.error("❌ Failed to request headlines:", err.message);
    }
}

function requestNewsCount() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        log.warn("⚠️ Cannot request news count - WebSocket not open");
        return;
    }

    const request = {
        type: "news_request",
        client_id: `${ORACLE_AUTH.userId}-terra`,
        payload: {
            request_type: "count",
        },
    };

    try {
        ws.send(JSON.stringify(request));
        if (NEWS_DEBUG) {
            log.log("📊 Requested news count from CDSH");
        }
    } catch (err) {
        log.error("❌ Failed to request news count:", err.message);
    }
}

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
        if (SESSION_DEBUG) {
            log.log(`📊 IPC getXpSessionHistory: returning ${latestSessionHistory.sessions?.length || 0} sessions`);
        }
    } else {
        if (SESSION_DEBUG) {
            log.log(`📊 IPC getXpSessionHistory: no data available`);
        }
    }
    return latestSessionHistory;
};

const getXpSessionUpdate = () => {
    return latestSessionUpdate;
};

// IPC handlers for News data requests
const getNewsHeadlines = () => {
    if (latestNewsHeadlines) {
        if (NEWS_DEBUG) {
            log.log(`📰 IPC getNewsHeadlines: returning ${latestNewsHeadlines.length} headlines`);
            if (latestNewsHeadlines.length > 0) {
                log.log(`📰 First headline sample:`, {
                    symbol: latestNewsHeadlines[0].symbol,
                    headline: latestNewsHeadlines[0].headline?.substring(0, 50) + "...",
                    hasBody: !!latestNewsHeadlines[0].body,
                    timestamp: latestNewsHeadlines[0].created_at || latestNewsHeadlines[0].updated_at
                });
            }
        }
    } else {
        if (NEWS_DEBUG) {
            log.log(`📰 IPC getNewsHeadlines: no headlines available`);
        }
    }
    return latestNewsHeadlines;
};

const getNewsCount = () => {
    if (NEWS_DEBUG) {
        log.log(`📊 IPC getNewsCount: returning ${latestNewsCount} headlines`);
    }
    return latestNewsCount;
};

// IPC handlers for Filing data requests
const getFilingHeadlines = () => {
    if (latestFilings) {
        log.log(`📁 IPC getFilingHeadlines: returning ${latestFilings.length} filings`);
        if (FILING_DEBUG) {
            log.log(`📁 IPC getFilingHeadlines: returning ${latestFilings.length} filings`);
        }
    } else {
        log.log(`📁 IPC getFilingHeadlines: no filings available`);
        if (FILING_DEBUG) {
            log.log(`📁 IPC getFilingHeadlines: no filings available`);
        }
    }
    return latestFilings;
};

const getFilingCount = () => {
    if (FILING_DEBUG) {
        log.log(`📊 IPC getFilingCount: returning ${latestFilingCount} filings`);
    }
    return latestFilingCount;
};

module.exports = {
    oracle,
    getXpActiveStocks,
    getXpSessionHistory,
    getXpSessionUpdate,
    getNewsHeadlines,
    getNewsCount,
    getFilingHeadlines,
    getFilingCount,
    requestHydration,
    requestHeadlines,
    requestNewsCount,
};
