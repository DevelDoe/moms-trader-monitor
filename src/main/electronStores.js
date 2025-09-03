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

    function clear() {
        // Clear the buffer first
        buffer.clear();
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        // Clear the underlying store
        store.clear();
    }

    return { get, set, flushSync, clear, _store: store };
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
let _xpShowTotalVolume = xpSettingsStore.get("showTotalVolume", true); // Default to visible
let _xpShowLevel = xpSettingsStore.get("showLevel", true); // Default to visible

function getXpListLength() {
    return _xpListLength;
}

function setXpListLength(length) {
    const newLength = Math.max(1, Number(length) || 25);
    if (newLength === _xpListLength) return false;
    
    _xpListLength = newLength;
    xpSettingsStore.set("listLength", _xpListLength);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel };
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

function getXpShowTotalVolume() {
    return _xpShowTotalVolume;
}

function setXpShowTotalVolume(show) {
    const newShow = Boolean(show);
    if (newShow === _xpShowTotalVolume) return false;
    
    _xpShowTotalVolume = newShow;
    xpSettingsStore.set("showTotalVolume", _xpShowTotalVolume);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel };
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

function getXpShowLevel() {
    return _xpShowLevel;
}

function setXpShowLevel(show) {
    const newShow = Boolean(show);
    if (newShow === _xpShowLevel) return false;
    
    _xpShowLevel = newShow;
    xpSettingsStore.set("showLevel", _xpShowLevel);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel };
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
            showPrice: getXpShowPrice(),
            showTotalVolume: getXpShowTotalVolume(),
            showLevel: getXpShowLevel()
        };
    });
    ipcMain.handle("xp-settings:set", (_e, { listLength, showHeaders, showUpXp, showDownXp, showRatio, showTotal, showNet, showPrice, showTotalVolume, showLevel }) => {
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
        if (showTotalVolume !== undefined) {
            changed = setXpShowTotalVolume(showTotalVolume) || changed;
        }
        if (showLevel !== undefined) {
            changed = setXpShowLevel(showLevel) || changed;
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
            showPrice: getXpShowPrice(),
            showTotalVolume: getXpShowTotalVolume(),
            showLevel: getXpShowLevel()
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
let _hodChimeVolume = hodSettingsStore.get("chimeVolume", 0.05); // Default to 0.05
let _hodTickVolume = hodSettingsStore.get("tickVolume", 0.05); // Default to 0.05
let _hodSymbolLength = hodSettingsStore.get("symbolLength", 10); // Default to 10

function getHodListLength() {
    return _hodListLength;
}

function setHodListLength(length) {
    const newLength = Math.max(1, Number(length) || 10);
    if (newLength === _hodListLength) return false;
    
    _hodListLength = newLength;
    hodSettingsStore.set("listLength", _hodListLength);
    
    const payload = { 
        listLength: _hodListLength,
        chimeVolume: _hodChimeVolume,
        tickVolume: _hodTickVolume,
        symbolLength: _hodSymbolLength
    };
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

function getHodChimeVolume() {
    return _hodChimeVolume;
}

function setHodChimeVolume(volume) {
    const newVolume = Math.max(0, Math.min(1, Number(volume) || 0.05));
    if (newVolume === _hodChimeVolume) return false;
    
    _hodChimeVolume = newVolume;
    hodSettingsStore.set("chimeVolume", _hodChimeVolume);
    
    const payload = { 
        listLength: _hodListLength,
        chimeVolume: _hodChimeVolume,
        tickVolume: _hodTickVolume,
        symbolLength: _hodSymbolLength
    };
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

function getHodTickVolume() {
    return _hodTickVolume;
}

function setHodTickVolume(volume) {
    const newVolume = Math.max(0, Math.min(1, Number(volume) || 0.05));
    if (newVolume === _hodTickVolume) return false;
    
    _hodTickVolume = newVolume;
    hodSettingsStore.set("tickVolume", _hodTickVolume);
    
    const payload = { 
        listLength: _hodListLength,
        chimeVolume: _hodChimeVolume,
        tickVolume: _hodTickVolume,
        symbolLength: _hodSymbolLength
    };
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

function getHodSymbolLength() {
    return _hodSymbolLength;
}

function setHodSymbolLength(length) {
    const newLength = Math.max(1, Number(length) || 10);
    if (newLength === _hodSymbolLength) return false;
    
    _hodSymbolLength = newLength;
    hodSettingsStore.set("symbolLength", _hodSymbolLength);
    
    const payload = { 
        listLength: _hodListLength,
        chimeVolume: _hodChimeVolume,
        tickVolume: _hodTickVolume,
        symbolLength: _hodSymbolLength
    };
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
        return { 
            listLength: getHodListLength(),
            chimeVolume: getHodChimeVolume(),
            tickVolume: getHodTickVolume(),
            symbolLength: getHodSymbolLength()
        };
    });
    ipcMain.handle("hod-settings:set", (_e, { listLength, chimeVolume, tickVolume, symbolLength }) => {
        let changed = false;
        if (listLength !== undefined) {
            changed = setHodListLength(listLength) || changed;
        }
        if (chimeVolume !== undefined) {
            changed = setHodChimeVolume(chimeVolume) || changed;
        }
        if (tickVolume !== undefined) {
            changed = setHodTickVolume(tickVolume) || changed;
        }
        if (symbolLength !== undefined) {
            changed = setHodSymbolLength(symbolLength) || changed;
        }
        return changed;
    });

    ipcMain.removeAllListeners("hod-settings:subscribe");
    ipcMain.on("hod-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("hod-settings:change", data);
        push({ 
            listLength: getHodListLength(),
            chimeVolume: getHodChimeVolume(),
            tickVolume: getHodTickVolume(),
            symbolLength: getHodSymbolLength()
        }); // prime immediately
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
    const newLength = Math.max(1, Number(length) || 25);
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

// ─────────────────────────────────────────────────────────────────────
// Window Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const windowSettingsStore = createStore("window-settings-store", "windows.");
const windowSettingsBus = new EventEmitter();

// Default window states - positions calculated dynamically
const DEFAULT_WINDOW_STATES = {
    eventsWindow: {
        width: 167,
        height: 479,
        isOpen: false,
    },
    settingsWindow: {
        width: 907,
        height: 755,
        isOpen: false,
    },
    infobarWindow: {
        width: 465,
        height: 39,
        isOpen: false,
    },
    wizardWindow: {
        width: 2400,
        height: 504,
        isOpen: false,
    },
    dockerWindow: {
        width: 200,
        height: 100,
        isOpen: true,
    },
    progressWindow: {
        width: 800,
        height: 14,
        isOpen: false,
    },
    frontlineWindow: {
        width: 321,
        height: 479,
        isOpen: false,
    },
    activeWindow: {
        width: 802,
        height: 404,
        isOpen: false,
    },
    heroesWindow: {
        width: 850,
        height: 660,
        isOpen: false,
    },
    scrollXpWindow: {
        width: 300,
        height: 200,
        isOpen: false,
    },
    scrollStatsWindow: {
        width: 300,
        height: 200,
        isOpen: false,
    },
    newsWindow: {
        width: 582,
        height: 529,
        isOpen: false,
    },
    scrollHodWindow: {
        width: 297,
        height: 447,
        isOpen: false,
    },
    sessionHistoryWindow: {
        width: 532,
        height: 168,
        isOpen: false,
    },
};

// Load all window states from store or use defaults
let _windowStates = {};

// Smart positioning system to prevent window overlap
function calculateWindowPosition(position, width = 0, height = 0) {
    try {
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
        
        // Add some padding from screen edges
        const padding = 20;
        const safeWidth = Math.max(0, screenWidth - padding * 2);
        const safeHeight = Math.max(0, screenHeight - padding * 2);
        
        switch (position) {
            case "top-left":
                return { x: padding, y: padding };
            case "top-center":
                return { x: Math.max(padding, (screenWidth - width) / 2), y: padding };
            case "top-right":
                return { x: Math.max(padding, screenWidth - width - padding), y: padding };
            case "center-left":
                return { x: padding, y: Math.max(padding, (screenHeight - height) / 2) };
            case "center":
                return { 
                    x: Math.max(padding, (screenWidth - width) / 2), 
                    y: Math.max(padding, (screenHeight - height) / 2) 
                };
            case "center-right":
                return { 
                    x: Math.max(padding, screenWidth - width - padding), 
                    y: Math.max(padding, (screenHeight - height) / 2) 
                };
            case "bottom-left":
                return { x: padding, y: Math.max(padding, screenHeight - height - padding) };
            case "bottom-center":
                return { x: Math.max(padding, (screenWidth - width) / 2), y: Math.max(padding, screenHeight - height - padding) };
            case "bottom-right":
                return { x: Math.max(padding, screenWidth - width - padding), y: Math.max(padding, screenHeight - height - padding) };
            default:
                return { x: padding, y: padding };
        }
    } catch (error) {
        // If screen module is not available (app not ready), return safe defaults
        log.log("[window-settings] Screen module not ready, using safe defaults");
        return { x: 20, y: 20 };
    }
}

// Simple positioning - windows default near center (where mouse typically is)
function calculateSmartWindowPosition(windowKey, width = 0, height = 0) {
    try {
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
        
        const padding = 20;
        
        // Simple approach: spread windows around the center area with small offsets
        const centerX = (screenWidth - width) / 2;
        const centerY = (screenHeight - height) / 2;
        
        // Small offsets to prevent exact overlap
        const offsets = {
            eventsWindow: { x: 50, y: -100 },
            frontlineWindow: { x: -50, y: -100 },
            infobarWindow: { x: 0, y: -200 },
            activeWindow: { x: -100, y: 0 },
            heroesWindow: { x: 100, y: 0 },
            settingsWindow: { x: 0, y: 0 },
            wizardWindow: { x: 0, y: 0 },
            dockerWindow: { x: 100, y: 100 },
            progressWindow: { x: 0, y: 100 },
            scrollXpWindow: { x: -100, y: 100 },
            scrollStatsWindow: { x: -100, y: 150 },
            newsWindow: { x: -100, y: 200 },
            scrollHodWindow: { x: -100, y: 250 },
            sessionHistoryWindow: { x: -100, y: 300 },
        };
        
        const offset = offsets[windowKey] || { x: 0, y: 0 };
        const x = Math.max(padding, Math.min(screenWidth - width - padding, centerX + offset.x));
        const y = Math.max(padding, Math.min(screenHeight - height - padding, centerY + offset.y));
        
        return { x, y };
        
    } catch (error) {
        log.log("[window-settings] Screen module not ready, using safe defaults");
        return { x: 20, y: 20 };
    }
}

// Initialize window states (preserve stored positions if they exist)
for (const [windowKey, defaultState] of Object.entries(DEFAULT_WINDOW_STATES)) {
    const storedState = windowSettingsStore.get(windowKey, defaultState);
    
    // Preserve stored positions if they exist, otherwise use safe defaults
    const hasStoredPosition = storedState.x !== undefined && storedState.y !== undefined;
    
    _windowStates[windowKey] = {
        ...storedState,
        x: hasStoredPosition ? storedState.x : 0,
        y: hasStoredPosition ? storedState.y : 0
    };
    
    // Log only in development or when debugging
    if (process.env.NODE_ENV === 'development') {
        log.log(`[window-settings] 📋 Initialized ${windowKey}:`, {
            position: storedState.position,
            isOpen: storedState.isOpen,
            width: storedState.width,
            height: storedState.height,
            x: _windowStates[windowKey].x,
            y: _windowStates[windowKey].y,
            hasStoredPosition
        });
    }
}

// Function to recalculate positions when app is ready
function recalculatePositionsWhenReady() {
    log.log("[window-settings] 🔄 Recalculating positions for windows without stored positions");
    
    for (const [windowKey, storedState] of Object.entries(_windowStates)) {
        const defaultState = DEFAULT_WINDOW_STATES[windowKey];
        if (defaultState) {
            // Only recalculate if no stored position exists
            const hasStoredPosition = storedState.x !== undefined && storedState.y !== undefined;
            
            if (!hasStoredPosition) {
                // Use smart positioning to prevent overlap
                const calculatedPos = calculateSmartWindowPosition(
                    windowKey,
                    storedState.width || defaultState.width,
                    storedState.height || defaultState.height
                );
                
                log.log(`[window-settings] 📍 Calculating new position for ${windowKey}:`, {
                    from: { x: storedState.x, y: storedState.y },
                    to: calculatedPos,
                    width: storedState.width || defaultState.width,
                    height: storedState.height || defaultState.height
                });
                setWindowState(windowKey, { ...storedState, ...calculatedPos });
            } else {
                log.log(`[window-settings] ✅ ${windowKey} already has stored position:`, {
                    x: storedState.x,
                    y: storedState.y
                });
            }
        }
    }
    
    log.log("[window-settings] ✅ Position recalculation complete");
}

function getAllWindowStates() {
    return { ..._windowStates };
}

function getWindowState(windowKey) {
    const state = _windowStates[windowKey] ? { ..._windowStates[windowKey] } : null;
    return state;
}

function setWindowState(windowKey, state) {
    if (!_windowStates[windowKey]) {
        _windowStates[windowKey] = {};
    }
    
    const oldState = _windowStates[windowKey];
    const newState = { ..._windowStates[windowKey], ...state };
    
    // Check if anything actually changed
    const changed = JSON.stringify(oldState) !== JSON.stringify(newState);
    if (!changed) {
        return false;
    }
    
    _windowStates[windowKey] = newState;
    
    windowSettingsStore.set(windowKey, newState);
    
    const payload = getAllWindowStates();
    windowSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("window-settings:change", payload);
        } catch (err) {
            log.log("[window-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function setWindowBounds(windowKey, bounds) {
    return setWindowState(windowKey, bounds);
}

function setWindowOpenState(windowKey, isOpen) {
    return setWindowState(windowKey, { isOpen });
}

function resetWindowToDefault(windowKey) {
    if (DEFAULT_WINDOW_STATES[windowKey]) {
        const defaultState = DEFAULT_WINDOW_STATES[windowKey];
        const calculatedPos = calculateSmartWindowPosition(
            windowKey,
            defaultState.width,
            defaultState.height
        );
        return setWindowState(windowKey, { ...defaultState, ...calculatedPos });
    }
    return false;
}

function resetAllWindowsToDefault() {
    let changed = false;
    for (const [windowKey, defaultState] of Object.entries(DEFAULT_WINDOW_STATES)) {
        const calculatedPos = calculateSmartWindowPosition(
            windowKey,
            defaultState.width,
            defaultState.height
        );
        changed = setWindowState(windowKey, { ...defaultState, ...calculatedPos }) || changed;
    }
    return changed;
}

function clearAllWindowSettings() {
    const initialState = {};
    for (const [windowKey, defaultState] of Object.entries(DEFAULT_WINDOW_STATES)) {
        initialState[windowKey] = {
            ...defaultState,
            x: 0,
            y: 0
        };
    }
    _windowStates = initialState;
    windowSettingsStore.clear(); // Clear all stored settings
    windowSettingsBus.emit("change", initialState);
    return true;
}

// Recalculate all window positions (useful for screen size changes)
function recalculateAllPositions() {
    let changed = false;
    for (const [windowKey, storedState] of Object.entries(_windowStates)) {
        const defaultState = DEFAULT_WINDOW_STATES[windowKey];
        if (defaultState && storedState.position) {
            const calculatedPos = calculateWindowPosition(
                storedState.position,
                storedState.width,
                storedState.height
            );
            changed = setWindowState(windowKey, { ...storedState, ...calculatedPos }) || changed;
        }
    }
    return changed;
}

if (app && ipcMain && typeof app.on === "function" && !app.__window_settings_ipc_registered__) {
    app.__window_settings_ipc_registered__ = true;
    
    // Recalculate window positions when app is ready
    if (app && !app.__window_positions_calculated__) {
        app.__window_positions_calculated__ = true;
        app.once('ready', () => {
            log.log("[window-settings] App ready, recalculating window positions");
            recalculatePositionsWhenReady();
        });
    }

    ipcMain.removeHandler("window-settings:get");
    ipcMain.removeHandler("window-settings:get-window");
    ipcMain.removeHandler("window-settings:set-window");
    ipcMain.removeHandler("window-settings:set-bounds");
    ipcMain.removeHandler("window-settings:set-open-state");
    ipcMain.removeHandler("window-settings:reset-window");
    ipcMain.removeHandler("window-settings:reset-all");
    ipcMain.removeHandler("window-settings:clear-all");
    
    ipcMain.handle("window-settings:get", () => {
        return getAllWindowStates();
    });
    
    ipcMain.handle("window-settings:get-window", (_e, windowKey) => {
        return getWindowState(windowKey);
    });
    
    ipcMain.handle("window-settings:set-window", (_e, { windowKey, state }) => {
        return setWindowState(windowKey, state);
    });
    
    ipcMain.handle("window-settings:set-bounds", (_e, { windowKey, bounds }) => {
        return setWindowBounds(windowKey, bounds);
    });
    
    ipcMain.handle("window-settings:set-open-state", (_e, { windowKey, isOpen }) => {
        return setWindowOpenState(windowKey, isOpen);
    });
    
    ipcMain.handle("window-settings:reset-window", (_e, windowKey) => {
        return resetWindowToDefault(windowKey);
    });
    
    ipcMain.handle("window-settings:reset-all", () => {
        return resetAllWindowsToDefault();
    });

    ipcMain.handle("window-settings:clear-all", () => {
        return clearAllWindowSettings();
    });

    // Emergency reset handler - accessible from any window
    ipcMain.handle("emergency-reset-windows", () => {
        log.log("[window-settings] 🚨 Emergency reset triggered");
        return clearAllWindowSettings();
    });

    ipcMain.removeAllListeners("window-settings:subscribe");
    ipcMain.on("window-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("window-settings:change", data);
        push(getAllWindowStates()); // prime immediately
        windowSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[window-settings] unsubscribe WC", wc.id);
            windowSettingsBus.removeListener("change", push);
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
    getXpShowTotalVolume,
    setXpShowTotalVolume,
    getXpShowLevel,
    setXpShowLevel,
    
    // HOD settings exports
    getHodListLength,
    setHodListLength,
    getHodChimeVolume,
    setHodChimeVolume,
    getHodTickVolume,
    setHodTickVolume,
    getHodSymbolLength,
    setHodSymbolLength,
    
    // Stats settings exports
    getStatsListLength,
    setStatsListLength,
    
    // Window settings exports
    getAllWindowStates,
    getWindowState,
    setWindowState,
    setWindowBounds,
    setWindowOpenState,
    resetWindowToDefault,
    resetAllWindowsToDefault,
    recalculateAllPositions,
    clearAllWindowSettings,
    
    // For testing - expose IPC handlers and stores
    ipcMain: app && ipcMain ? ipcMain : undefined,
    windowSettingsStore: app ? windowSettingsStore : undefined,
};
