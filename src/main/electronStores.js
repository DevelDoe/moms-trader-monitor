// File: src/main/electronStores.js  (CommonJS)
let app, ipcMain, webContents;
try {
    const el = require("electron");
    app = el.app;
    ipcMain = el.ipcMain;
    webContents = el.webContents;
} catch (_) {
    // Running in plain Node tests; leave undefined and guard below
}
// Fallback to avoid crashes if webContents is missing in tests
if (!webContents) webContents = { getAllWebContents: () => [] };
const Store = require("electron-store");
const { EventEmitter } = require("events");
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);

function createStore(name, keyPrefix = "") {
    const path = require("path");
    const useCwd = !app || typeof app.getPath !== "function";
    const store = new Store({
        name, // "<name>.json"
        clearInvalidConfig: true,
        // In tests (no Electron app), persist under a temp folder
        ...(useCwd ? { cwd: path.join(process.cwd(), ".mtm-test-store") } : {}),
    });

    // Coalescing buffer: key -> latest value
    let buffer = new Map();
    let flushing = false;
    let flushTimer = null;
    const FLUSH_INTERVAL_MS = 100; // your original cadence

    function qualify(key) {
        return `${keyPrefix}${key}`;
    }

    function get(key, fallback) {
        return store.get(qualify(key), fallback);
    }

    function set(key, value) {
        buffer.set(qualify(key), value);
        scheduleFlush();
    }

    function scheduleFlush() {
        if (flushing) return;
        if (flushTimer) return;
        flushTimer = setTimeout(flushLoop, FLUSH_INTERVAL_MS);
    }

    async function flushLoop() {
        flushTimer = null;
        if (buffer.size === 0) return;
        flushing = true;

        try {
            // Snapshot & clear the buffer so new writes can queue up while we write
            const snapshot = buffer;
            buffer = new Map();

            // Build a single object for atomic store.set
            const batch = {};
            for (const [k, v] of snapshot.entries()) {
                batch[k] = v;
            }
            // electron-store set(object) merges keys in one synchronous write
            store.set(batch);
        } catch (err) {
            console.error(`[${name}] ❌ Failed to persist batch:`, err);
        } finally {
            flushing = false;
            // If more writes arrived during the write, schedule another pass
            if (buffer.size > 0) scheduleFlush();
        }
    }

    function flushSync() {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        if (buffer.size === 0) return;
        try {
            const batch = {};
            for (const [k, v] of buffer.entries()) batch[k] = v;
            buffer.clear();
            store.set(batch);
        } catch (err) {
            console.error(`[${name}] ❌ Failed sync flush:`, err);
        }
    }

    // Attach once per process
    if (app && typeof app.on === "function" && !app.__arcane_store_flush_hook__) {
        app.__arcane_store_flush_hook__ = true;
        app.on("before-quit", () => {
            try {
                flushSync();
            } catch {}
        });
    }

    return { get, set, flushSync, _store: store };
}

// --- Oracle cursor store ---
const oracleStore = createStore("oracle-store", "symbols.");

let lastAckCursor = Number(oracleStore.get("lastAckCursor", 0)) || 0;

function getLastAckCursor() {
    return lastAckCursor;
}

function setLastAckCursor(c) {
    const n = Number(c);
    if (!Number.isFinite(n)) return;
    if (n <= lastAckCursor) return;
    lastAckCursor = n; // update memory immediately
    oracleStore.set("lastAckCursor", n); // coalesced async persist
}

function resetCursor() {
    lastAckCursor = 0;
    oracleStore.set("lastAckCursor", 0);
}

// ─────────────────────────────────────────────────────────────────────
// Top-3 store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const top3Store = createStore("top3-store", "top.");
const top3Bus = new EventEmitter();

let _entries = top3Store.get("entries", []); // [{symbol, rank, score}]
let _updatedAt = top3Store.get("updatedAt", 0);

// Boot visibility
// log.log("[top3] boot", { entries: _entries, updatedAt: _updatedAt });

const up = (s) => String(s || "").toUpperCase();

function normalize(input) {
    const arr = (input || []).map((v, i) => (typeof v === "string" ? { symbol: up(v), rank: i + 1, score: null } : { symbol: up(v.symbol), rank: Number(v.rank) || i + 1, score: v.score ?? null }));

    const seen = new Set();
    const out = [];
    for (const e of arr) {
        if (!e.symbol || e.rank < 1 || e.rank > 3) continue;
        if (seen.has(e.symbol)) continue;
        seen.add(e.symbol);
        out.push(e);
        if (out.length === 3) break;
    }

    out.sort((a, b) => a.rank - b.rank);
    return out.map((e, i) => ({ ...e, rank: i + 1 }));
}

function getTop3() {
    // log.log("[top3] getTop3()", { entries: _entries, updatedAt: _updatedAt });
    return { entries: _entries.slice(), updatedAt: _updatedAt };
}

function setTop3(listOrEntries) {
    // log.log("[top3] setTop3(request)", listOrEntries);
    const next = normalize(listOrEntries);
    const changed =
        next.length !== _entries.length || next.some((e, i) => !_entries[i] || e.symbol !== _entries[i].symbol || e.rank !== _entries[i].rank || (e.score ?? null) !== (_entries[i].score ?? null));
    if (!changed) {
        // log.log("[top3] setTop3: no change; skipping persist/broadcast");
        return false;
    }

    _entries = next;
    _updatedAt = Date.now();
    top3Store.set("entries", _entries);
    top3Store.set("updatedAt", _updatedAt);

    const payload = getTop3();
    const targets = webContents.getAllWebContents();
    // log.log("[top3] broadcasting", {
    //     entries: payload.entries,
    //     updatedAt: payload.updatedAt,
    //     targets: targets.map((wc) => wc.id),
    // });
    top3Bus.emit("change", payload);
    for (const wc of targets) {
        try {
            wc.send("top3:change", payload);
        } catch (err) {
            log.log("[top3] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

if (app && ipcMain && typeof app.on === "function" && !app.__top3_ipc_registered__) {
    app.__top3_ipc_registered__ = true;

    ipcMain.removeHandler("top3:get");
    ipcMain.removeHandler("top3:set");
    ipcMain.handle("top3:get", () => {
        // log.log("[top3] IPC handle: top3:get");
        return getTop3();
    });
    ipcMain.handle("top3:set", (_e, listOrEntries) => {
        // log.log("[top3] IPC handle: top3:set", listOrEntries);
        return setTop3(listOrEntries);
    });

    ipcMain.removeAllListeners("top3:subscribe");
    ipcMain.on("top3:subscribe", (e) => {
        const wc = e.sender;
        // log.log("[top3] IPC on: top3:subscribe from WC", wc.id);
        const push = (data) => wc.send("top3:change", data);
        push(getTop3()); // prime immediately
        top3Bus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[top3] unsubscribe WC", wc.id);
            top3Bus.removeListener("change", push);
        });
    });
}

module.exports = {
    // keep your existing exports...
    getLastAckCursor,
    setLastAckCursor,
    resetCursor,

    // new exports (optional for other main modules)
    getTop3,
    setTop3,
};
