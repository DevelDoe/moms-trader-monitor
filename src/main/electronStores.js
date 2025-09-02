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
// XP Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const xpSettingsStore = createStore("xp-settings-store", "xp.");
const xpSettingsBus = new EventEmitter();

let _xpListLength = xpSettingsStore.get("listLength", 25); // Default to 25
let _xpShowHeaders = xpSettingsStore.get("showHeaders", true); // Default to visible
let _xpShowUpXp = xpSettingsStore.get("showUpXp", true); // Default to visible
let _xpShowDownXp = xpSettingsStore.get("showDownXp", true); // Default to visible
let _xpShowRatio = xpSettingsStore.get("showRatio", true); // Default to visible
let _xpShowTotal = xpSettingsStore.get("showTotal", true); // Default to visible
let _xpShowNet = xpSettingsStore.get("showNet", true); // Default to visible
let _xpShowPrice = xpSettingsStore.get("showPrice", true); // Default to visible

function getXpListLength() {
    return _xpListLength;
}

function setXpListLength(length) {
    const newLength = Math.max(1, Math.min(50, Number(length) || 25));
    if (newLength === _xpListLength) return false;
    
    _xpListLength = newLength;
    xpSettingsStore.set("listLength", _xpListLength);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice };
    xpSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("xp-settings:change", payload);
        } catch (err) {
            log.log("[xp-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getXpShowHeaders() {
    return _xpShowHeaders;
}

function setXpShowHeaders(show) {
    const newShow = Boolean(show);
    if (newShow === _xpShowHeaders) return false;
    
    _xpShowHeaders = newShow;
    xpSettingsStore.set("showHeaders", _xpShowHeaders);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice };
    xpSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("xp-settings:change", payload);
        } catch (err) {
            log.log("[xp-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getXpShowUpXp() {
    return _xpShowUpXp;
}

function setXpShowUpXp(show) {
    const newShow = Boolean(show);
    if (newShow === _xpShowUpXp) return false;
    
    _xpShowUpXp = newShow;
    xpSettingsStore.set("showUpXp", _xpShowUpXp);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice };
    xpSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("xp-settings:change", payload);
        } catch (err) {
            log.log("[xp-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getXpShowDownXp() {
    return _xpShowDownXp;
}

function setXpShowDownXp(show) {
    const newShow = Boolean(show);
    if (newShow === _xpShowDownXp) return false;
    
    _xpShowDownXp = newShow;
    xpSettingsStore.set("showDownXp", _xpShowDownXp);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice };
    xpSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("xp-settings:change", payload);
        } catch (err) {
            log.log("[xp-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getXpShowRatio() {
    return _xpShowRatio;
}

function setXpShowRatio(show) {
    const newShow = Boolean(show);
    if (newShow === _xpShowRatio) return false;
    
    _xpShowRatio = newShow;
    xpSettingsStore.set("showRatio", _xpShowRatio);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice };
    xpSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("xp-settings:change", payload);
        } catch (err) {
            log.log("[xp-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getXpShowTotal() {
    return _xpShowTotal;
}

function setXpShowTotal(show) {
    const newShow = Boolean(show);
    if (newShow === _xpShowTotal) return false;
    
    _xpShowTotal = newShow;
    xpSettingsStore.set("showTotal", _xpShowTotal);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice };
    xpSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("xp-settings:change", payload);
        } catch (err) {
            log.log("[xp-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getXpShowNet() {
    return _xpShowNet;
}

function setXpShowNet(show) {
    const newShow = Boolean(show);
    if (newShow === _xpShowNet) return false;
    
    _xpShowNet = newShow;
    xpSettingsStore.set("showNet", _xpShowNet);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice };
    xpSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("xp-settings:change", payload);
        } catch (err) {
            log.log("[xp-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getXpShowPrice() {
    return _xpShowPrice;
}

function setXpShowPrice(show) {
    const newShow = Boolean(show);
    if (newShow === _xpShowPrice) return false;
    
    _xpShowPrice = newShow;
    xpSettingsStore.set("showPrice", _xpShowPrice);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice };
    xpSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("xp-settings:change", payload);
        } catch (err) {
            log.log("[xp-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

if (app && ipcMain && typeof app.on === "function" && !app.__xp_settings_ipc_registered__) {
    app.__xp_settings_ipc_registered__ = true;

    ipcMain.removeHandler("xp-settings:get");
    ipcMain.removeHandler("xp-settings:set");
    ipcMain.handle("xp-settings:get", () => {
        return { 
            listLength: getXpListLength(), 
            showHeaders: getXpShowHeaders(),
            showUpXp: getXpShowUpXp(),
            showDownXp: getXpShowDownXp(),
            showRatio: getXpShowRatio(),
            showTotal: getXpShowTotal(),
            showNet: getXpShowNet(),
            showPrice: getXpShowPrice()
        };
    });
    ipcMain.handle("xp-settings:set", (_e, { listLength, showHeaders, showUpXp, showDownXp, showRatio, showTotal, showNet, showPrice }) => {
        let changed = false;
        if (listLength !== undefined) {
            changed = setXpListLength(listLength) || changed;
        }
        if (showHeaders !== undefined) {
            changed = setXpShowHeaders(showHeaders) || changed;
        }
        if (showUpXp !== undefined) {
            changed = setXpShowUpXp(showUpXp) || changed;
        }
        if (showDownXp !== undefined) {
            changed = setXpShowDownXp(showDownXp) || changed;
        }
        if (showRatio !== undefined) {
            changed = setXpShowRatio(showRatio) || changed;
        }
        if (showTotal !== undefined) {
            changed = setXpShowTotal(showTotal) || changed;
        }
        if (showNet !== undefined) {
            changed = setXpShowNet(showNet) || changed;
        }
        if (showPrice !== undefined) {
            changed = setXpShowPrice(showPrice) || changed;
        }
        return changed;
    });

    ipcMain.removeAllListeners("xp-settings:subscribe");
    ipcMain.on("xp-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("xp-settings:change", data);
        push({ 
            listLength: getXpListLength(), 
            showHeaders: getXpShowHeaders(),
            showUpXp: getXpShowUpXp(),
            showDownXp: getXpShowDownXp(),
            showRatio: getXpShowRatio(),
            showTotal: getXpShowTotal(),
            showNet: getXpShowNet(),
            showPrice: getXpShowPrice()
        }); // prime immediately
        xpSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[xp-settings] unsubscribe WC", wc.id);
            xpSettingsBus.removeListener("change", push);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────
// HOD Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const hodSettingsStore = createStore("hod-settings-store", "hod.");
const hodSettingsBus = new EventEmitter();

let _hodListLength = hodSettingsStore.get("listLength", 10); // Default to 10

function getHodListLength() {
    return _hodListLength;
}

function setHodListLength(length) {
    const newLength = Math.max(1, Math.min(50, Number(length) || 10));
    if (newLength === _hodListLength) return false;
    
    _hodListLength = newLength;
    hodSettingsStore.set("listLength", _hodListLength);
    
    const payload = { listLength: _hodListLength };
    hodSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("hod-settings:change", payload);
        } catch (err) {
            log.log("[hod-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

if (app && ipcMain && typeof app.on === "function" && !app.__hod_settings_ipc_registered__) {
    app.__hod_settings_ipc_registered__ = true;

    ipcMain.removeHandler("hod-settings:get");
    ipcMain.removeHandler("hod-settings:set");
    ipcMain.handle("hod-settings:get", () => {
        return { listLength: getHodListLength() };
    });
    ipcMain.handle("hod-settings:set", (_e, { listLength }) => {
        return setHodListLength(listLength);
    });

    ipcMain.removeAllListeners("hod-settings:subscribe");
    ipcMain.on("hod-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("hod-settings:change", data);
        push({ listLength: getHodListLength() }); // prime immediately
        hodSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[hod-settings] unsubscribe WC", wc.id);
            hodSettingsBus.removeListener("change", push);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────
// Stats Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const statsSettingsStore = createStore("stats-settings-store", "stats.");
const statsSettingsBus = new EventEmitter();

let _statsListLength = statsSettingsStore.get("listLength", 25); // Default to 25

function getStatsListLength() {
    return _statsListLength;
}

function setStatsListLength(length) {
    const newLength = Math.max(1, Math.min(50, Number(length) || 25));
    if (newLength === _statsListLength) return false;
    
    _statsListLength = newLength;
    statsSettingsStore.set("listLength", _statsListLength);
    
    const payload = { listLength: _statsListLength };
    statsSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("stats-settings:change", payload);
        } catch (err) {
            log.log("[stats-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

if (app && ipcMain && typeof app.on === "function" && !app.__stats_settings_ipc_registered__) {
    app.__stats_settings_ipc_registered__ = true;

    ipcMain.removeHandler("stats-settings:get");
    ipcMain.removeHandler("stats-settings:set");
    ipcMain.handle("stats-settings:get", () => {
        return { listLength: getStatsListLength() };
    });
    ipcMain.handle("stats-settings:set", (_e, { listLength }) => {
        return setStatsListLength(listLength);
    });

    ipcMain.removeAllListeners("stats-settings:subscribe");
    ipcMain.on("stats-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("stats-settings:change", data);
        push({ listLength: getStatsListLength() }); // prime immediately
        statsSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[stats-settings] unsubscribe WC", wc.id);
            statsSettingsBus.removeListener("change", push);
        });
    });
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
    
    // XP settings exports
    getXpListLength,
    setXpListLength,
    getXpShowHeaders,
    setXpShowHeaders,
    getXpShowUpXp,
    setXpShowUpXp,
    getXpShowDownXp,
    setXpShowDownXp,
    getXpShowRatio,
    setXpShowRatio,
    getXpShowTotal,
    setXpShowTotal,
    getXpShowNet,
    setXpShowNet,
    getXpShowPrice,
    setXpShowPrice,
    
    // HOD settings exports
    getHodListLength,
    setHodListLength,
    
    // Stats settings exports
    getStatsListLength,
    setStatsListLength,
};
