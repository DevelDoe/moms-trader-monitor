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

function createStore(name, keyPrefix = "", memoryOnly = false) {
    const path = require("path");
    const useCwd = !app || typeof app.getPath !== "function";
    
    let store;
    if (memoryOnly) {
        // Memory-only store - no persistence
        store = {
            get: (key, fallback) => fallback,
            set: (key, value) => {}, // No-op
            clear: () => {},
            _isMemoryOnly: true
        };
    } else {
        store = new Store({
            name, // "<name>.json"
            clearInvalidConfig: true,
            // In tests (no Electron app), persist under a temp folder
            ...(useCwd ? { cwd: path.join(process.cwd(), ".mtm-test-store") } : {}),
        });
    }

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
        const qualifiedKey = qualify(key);
        buffer.set(qualifiedKey, value);
        
        // Skip persistence for memory-only dynamic data
        if (memoryOnly || isMemoryOnlyKey(qualifiedKey)) {
            return; // Don't schedule flush for memory-only data
        }
        
        scheduleFlush();
    }
    
    function isMemoryOnlyKey(key) {
        // These keys should be memory-only (dynamic rankings)
        const memoryOnlyKeys = [
            'top3Entries',
            'top3UpdatedAt',
            'rating.top3Entries', 
            'rating.top3UpdatedAt',
            'xp.top3Entries',
            'xp.top3UpdatedAt',
            'change.top3Entries',
            'change.top3UpdatedAt'
        ];
        return memoryOnlyKeys.includes(key);
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

            // Build a single object for atomic store.set, excluding memory-only keys
            const batch = {};
            for (const [k, v] of snapshot.entries()) {
                if (!isMemoryOnlyKey(k)) {
                    batch[k] = v;
                }
            }
            
            // Only write to store if there are persistent keys
            if (Object.keys(batch).length > 0) {
                store.set(batch);
            }
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
            for (const [k, v] of buffer.entries()) {
                if (!isMemoryOnlyKey(k)) {
                    batch[k] = v;
                }
            }
            buffer.clear();
            
            // Only write to store if there are persistent keys
            if (Object.keys(batch).length > 0) {
                store.set(batch);
            }
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
let _xpShowSessionChange = xpSettingsStore.get("showSessionChange", true); // Default to visible

// XP Top3 data
let _xpTop3Entries = xpSettingsStore.get("top3Entries", []); // [{symbol, rank, trophy}]
let _xpTop3UpdatedAt = xpSettingsStore.get("top3UpdatedAt", 0);

function getXpListLength() {
    return _xpListLength;
}

function setXpListLength(length) {
    const newLength = Math.max(1, Number(length) || 25);
    if (newLength === _xpListLength) return false;
    
    _xpListLength = newLength;
    xpSettingsStore.set("listLength", _xpListLength);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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

function getXpShowSessionChange() {
    return _xpShowSessionChange;
}

function setXpShowSessionChange(show) {
    const newShow = Boolean(show);
    if (newShow === _xpShowSessionChange) return false;
    
    _xpShowSessionChange = newShow;
    xpSettingsStore.set("showSessionChange", _xpShowSessionChange);
    
    const payload = { listLength: _xpListLength, showHeaders: _xpShowHeaders, showUpXp: _xpShowUpXp, showDownXp: _xpShowDownXp, showRatio: _xpShowRatio, showTotal: _xpShowTotal, showNet: _xpShowNet, showPrice: _xpShowPrice, showTotalVolume: _xpShowTotalVolume, showLevel: _xpShowLevel, showSessionChange: _xpShowSessionChange };
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

// XP Top3 functions
function getXpTop3() {
    return { entries: _xpTop3Entries.slice(), updatedAt: _xpTop3UpdatedAt };
}

function setXpTop3(listOrEntries) {
    const next = normalizeTop3(listOrEntries);
    const changed =
        next.length !== _xpTop3Entries.length || next.some((e, i) => !_xpTop3Entries[i] || e.symbol !== _xpTop3Entries[i].symbol || e.rank !== _xpTop3Entries[i].rank || (e.trophy ?? null) !== (_xpTop3Entries[i].trophy ?? null));
    if (!changed) {
        return false;
    }

    _xpTop3Entries = next;
    _xpTop3UpdatedAt = Date.now();
    xpSettingsStore.set("top3Entries", _xpTop3Entries);
    xpSettingsStore.set("top3UpdatedAt", _xpTop3UpdatedAt);

    const payload = getXpTop3();
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("xp-top3:change", payload);
        } catch (err) {
            log.log("[xp-top3] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

if (app && ipcMain && typeof app.on === "function" && !app.__xp_settings_ipc_registered__) {
    app.__xp_settings_ipc_registered__ = true;

    ipcMain.removeHandler("xp-settings:get");
    ipcMain.removeHandler("xp-settings:set");
    ipcMain.removeHandler("xp-top3:get");
    ipcMain.removeHandler("xp-top3:set");
    
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
            showLevel: getXpShowLevel(),
            showSessionChange: getXpShowSessionChange()
        };
    });
    
    ipcMain.handle("xp-top3:get", () => {
        return getXpTop3();
    });
    
    ipcMain.handle("xp-top3:set", (_e, listOrEntries) => {
        return setXpTop3(listOrEntries);
    });
    ipcMain.handle("xp-settings:set", (_e, { listLength, showHeaders, showUpXp, showDownXp, showRatio, showTotal, showNet, showPrice, showTotalVolume, showLevel, showSessionChange }) => {
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
        if (showSessionChange !== undefined) {
            changed = setXpShowSessionChange(showSessionChange) || changed;
        }
        return changed;
    });

    ipcMain.removeAllListeners("xp-settings:subscribe");
    ipcMain.removeAllListeners("xp-top3:subscribe");
    
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
            showLevel: getXpShowLevel(),
            showSessionChange: getXpShowSessionChange()
        }); // prime immediately
        xpSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[xp-settings] unsubscribe WC", wc.id);
            xpSettingsBus.removeListener("change", push);
        });
    });
    
    ipcMain.on("xp-top3:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("xp-top3:change", data);
        push(getXpTop3()); // prime immediately
        wc.once("destroyed", () => {
            log.log("[xp-top3] unsubscribe WC", wc.id);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────
// Change Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const changeSettingsStore = createStore("change-settings-store", "change.");
const changeSettingsBus = new EventEmitter();

let _changeListLength = changeSettingsStore.get("listLength", 25); // Default to 25
let _changeShowHeaders = changeSettingsStore.get("showHeaders", true); // Default to visible
let _changeShowUpXp = changeSettingsStore.get("showUpXp", true); // Default to visible
let _changeShowDownXp = changeSettingsStore.get("showDownXp", true); // Default to visible
let _changeShowRatio = changeSettingsStore.get("showRatio", true); // Default to visible
let _changeShowTotal = changeSettingsStore.get("showTotal", true); // Default to visible
let _changeShowNet = changeSettingsStore.get("showNet", true); // Default to visible
let _changeShowPrice = changeSettingsStore.get("showPrice", true); // Default to visible
let _changeShowTotalVolume = changeSettingsStore.get("showTotalVolume", true); // Default to visible
let _changeShowLevel = changeSettingsStore.get("showLevel", true); // Default to visible
let _changeShowSessionChange = changeSettingsStore.get("showSessionChange", true); // Default to visible

// Change Top3 data
let _changeTop3Entries = changeSettingsStore.get("top3Entries", []); // [{symbol, rank, trophy}]
let _changeTop3UpdatedAt = changeSettingsStore.get("top3UpdatedAt", 0);

function getChangeListLength() {
    return _changeListLength;
}

function setChangeListLength(length) {
    const newLength = Math.max(1, Number(length) || 25);
    if (newLength === _changeListLength) return false;
    
    _changeListLength = newLength;
    changeSettingsStore.set("listLength", _changeListLength);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getChangeShowHeaders() {
    return _changeShowHeaders;
}

function setChangeShowHeaders(show) {
    const newShow = Boolean(show);
    if (newShow === _changeShowHeaders) return false;
    
    _changeShowHeaders = newShow;
    changeSettingsStore.set("showHeaders", _changeShowHeaders);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getChangeShowUpXp() {
    return _changeShowUpXp;
}

function setChangeShowUpXp(show) {
    const newShow = Boolean(show);
    if (newShow === _changeShowUpXp) return false;
    
    _changeShowUpXp = newShow;
    changeSettingsStore.set("showUpXp", _changeShowUpXp);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getChangeShowDownXp() {
    return _changeShowDownXp;
}

function setChangeShowDownXp(show) {
    const newShow = Boolean(show);
    if (newShow === _changeShowDownXp) return false;
    
    _changeShowDownXp = newShow;
    changeSettingsStore.set("showDownXp", _changeShowDownXp);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getChangeShowRatio() {
    return _changeShowRatio;
}

function setChangeShowRatio(show) {
    const newShow = Boolean(show);
    if (newShow === _changeShowRatio) return false;
    
    _changeShowRatio = newShow;
    changeSettingsStore.set("showRatio", _changeShowRatio);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getChangeShowTotal() {
    return _changeShowTotal;
}

function setChangeShowTotal(show) {
    const newShow = Boolean(show);
    if (newShow === _changeShowTotal) return false;
    
    _changeShowTotal = newShow;
    changeSettingsStore.set("showTotal", _changeShowTotal);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getChangeShowNet() {
    return _changeShowNet;
}

function setChangeShowNet(show) {
    const newShow = Boolean(show);
    if (newShow === _changeShowNet) return false;
    
    _changeShowNet = newShow;
    changeSettingsStore.set("showNet", _changeShowNet);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getChangeShowPrice() {
    return _changeShowPrice;
}

function setChangeShowPrice(show) {
    const newShow = Boolean(show);
    if (newShow === _changeShowPrice) return false;
    
    _changeShowPrice = newShow;
    changeSettingsStore.set("showPrice", _changeShowPrice);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getChangeShowTotalVolume() {
    return _changeShowTotalVolume;
}

function setChangeShowTotalVolume(show) {
    const newShow = Boolean(show);
    if (newShow === _changeShowTotalVolume) return false;
    
    _changeShowTotalVolume = newShow;
    changeSettingsStore.set("showTotalVolume", _changeShowTotalVolume);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getChangeShowLevel() {
    return _changeShowLevel;
}

function setChangeShowLevel(show) {
    const newShow = Boolean(show);
    if (newShow === _changeShowLevel) return false;
    
    _changeShowLevel = newShow;
    changeSettingsStore.set("showLevel", _changeShowLevel);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getChangeShowSessionChange() {
    return _changeShowSessionChange;
}

function setChangeShowSessionChange(show) {
    const newShow = Boolean(show);
    if (newShow === _changeShowSessionChange) return false;
    
    _changeShowSessionChange = newShow;
    changeSettingsStore.set("showSessionChange", _changeShowSessionChange);
    
    const payload = { listLength: _changeListLength, showHeaders: _changeShowHeaders, showUpXp: _changeShowUpXp, showDownXp: _changeShowDownXp, showRatio: _changeShowRatio, showTotal: _changeShowTotal, showNet: _changeShowNet, showPrice: _changeShowPrice, showTotalVolume: _changeShowTotalVolume, showLevel: _changeShowLevel, showSessionChange: _changeShowSessionChange };
    changeSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-settings:change", payload);
        } catch (err) {
            log.log("[change-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

// Change Top3 functions
function getChangeTop3() {
    return { entries: _changeTop3Entries.slice(), updatedAt: _changeTop3UpdatedAt };
}

function setChangeTop3(listOrEntries) {
    const next = normalizeTop3(listOrEntries);
    const changed =
        next.length !== _changeTop3Entries.length || next.some((e, i) => !_changeTop3Entries[i] || e.symbol !== _changeTop3Entries[i].symbol || e.rank !== _changeTop3Entries[i].rank || (e.trophy ?? null) !== (_changeTop3Entries[i].trophy ?? null));
    if (!changed) {
        return false;
    }

    _changeTop3Entries = next;
    _changeTop3UpdatedAt = Date.now();
    changeSettingsStore.set("top3Entries", _changeTop3Entries);
    changeSettingsStore.set("top3UpdatedAt", _changeTop3UpdatedAt);

    const payload = getChangeTop3();
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("change-top3:change", payload);
        } catch (err) {
            log.log("[change-top3] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

if (app && ipcMain && typeof app.on === "function" && !app.__change_settings_ipc_registered__) {
    app.__change_settings_ipc_registered__ = true;

    ipcMain.removeHandler("change-settings:get");
    ipcMain.removeHandler("change-settings:set");
    ipcMain.removeHandler("change-top3:get");
    ipcMain.removeHandler("change-top3:set");
    
    ipcMain.handle("change-settings:get", () => {
        return { 
            listLength: getChangeListLength(), 
            showHeaders: getChangeShowHeaders(),
            showUpXp: getChangeShowUpXp(),
            showDownXp: getChangeShowDownXp(),
            showRatio: getChangeShowRatio(),
            showTotal: getChangeShowTotal(),
            showNet: getChangeShowNet(),
            showPrice: getChangeShowPrice(),
            showTotalVolume: getChangeShowTotalVolume(),
            showLevel: getChangeShowLevel(),
            showSessionChange: getChangeShowSessionChange()
        };
    });
    
    ipcMain.handle("change-top3:get", () => {
        return getChangeTop3();
    });
    
    ipcMain.handle("change-top3:set", (_e, listOrEntries) => {
        return setChangeTop3(listOrEntries);
    });
    ipcMain.handle("change-settings:set", (_e, { listLength, showHeaders, showUpXp, showDownXp, showRatio, showTotal, showNet, showPrice, showTotalVolume, showLevel, showSessionChange }) => {
        let changed = false;
        if (listLength !== undefined) {
            changed = setChangeListLength(listLength) || changed;
        }
        if (showHeaders !== undefined) {
            changed = setChangeShowHeaders(showHeaders) || changed;
        }
        if (showUpXp !== undefined) {
            changed = setChangeShowUpXp(showUpXp) || changed;
        }
        if (showDownXp !== undefined) {
            changed = setChangeShowDownXp(showDownXp) || changed;
        }
        if (showRatio !== undefined) {
            changed = setChangeShowRatio(showRatio) || changed;
        }
        if (showTotal !== undefined) {
            changed = setChangeShowTotal(showTotal) || changed;
        }
        if (showNet !== undefined) {
            changed = setChangeShowNet(showNet) || changed;
        }
        if (showPrice !== undefined) {
            changed = setChangeShowPrice(showPrice) || changed;
        }
        if (showTotalVolume !== undefined) {
            changed = setChangeShowTotalVolume(showTotalVolume) || changed;
        }
        if (showLevel !== undefined) {
            changed = setChangeShowLevel(showLevel) || changed;
        }
        if (showSessionChange !== undefined) {
            changed = setChangeShowSessionChange(showSessionChange) || changed;
        }
        return changed;
    });

    ipcMain.removeAllListeners("change-settings:subscribe");
    ipcMain.removeAllListeners("change-top3:subscribe");
    
    ipcMain.on("change-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("change-settings:change", data);
        push({ 
            listLength: getChangeListLength(), 
            showHeaders: getChangeShowHeaders(),
            showUpXp: getChangeShowUpXp(),
            showDownXp: getChangeShowDownXp(),
            showRatio: getChangeShowRatio(),
            showTotal: getChangeShowTotal(),
            showNet: getChangeShowNet(),
            showPrice: getChangeShowPrice(),
            showTotalVolume: getChangeShowTotalVolume(),
            showLevel: getChangeShowLevel(),
            showSessionChange: getChangeShowSessionChange()
        }); // prime immediately
        changeSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[change-settings] unsubscribe WC", wc.id);
            changeSettingsBus.removeListener("change", push);
        });
    });
    
    ipcMain.on("change-top3:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("change-top3:change", data);
        push(getChangeTop3()); // prime immediately
        wc.once("destroyed", () => {
            log.log("[change-top3] unsubscribe WC", wc.id);
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
// Rating Top3 store (persist + broadcast) - Tiered ranking system
// ─────────────────────────────────────────────────────────────────────

const ratingTop3Store = createStore("rating-top3-store", "rating.");
const ratingTop3Bus = new EventEmitter();

// Rating Top3 data - supports multiple symbols per tier
let _ratingTop3Entries = ratingTop3Store.get("top3Entries", []); // [{symbol, rank, score, tier}]
let _ratingTop3UpdatedAt = ratingTop3Store.get("top3UpdatedAt", 0);

function getRatingTop3() {
    return { entries: _ratingTop3Entries.slice(), updatedAt: _ratingTop3UpdatedAt };
}

function setRatingTop3(listOrEntries) {
    const next = normalizeRatingTop3(listOrEntries);
    const changed = JSON.stringify(next) !== JSON.stringify(_ratingTop3Entries);
    
    if (!changed) {
        return false;
    }

    _ratingTop3Entries = next;
    _ratingTop3UpdatedAt = Date.now();
    ratingTop3Store.set("top3Entries", _ratingTop3Entries);
    ratingTop3Store.set("top3UpdatedAt", _ratingTop3UpdatedAt);

    const payload = getRatingTop3();
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("rating-top3:change", payload);
        } catch (err) {
            log.log("[rating-top3] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

// Helper function to normalize rating top3 data with tiered ranking
function normalizeRatingTop3(input) {
    if (!Array.isArray(input) || input.length === 0) {
        return [];
    }

    // Group by score to create tiers
    const scoreGroups = {};
    input.forEach((entry, index) => {
        const score = Number(entry.score) || 0;
        if (!scoreGroups[score]) {
            scoreGroups[score] = [];
        }
        scoreGroups[score].push({
            symbol: String(entry.symbol || "").toUpperCase(),
            score: score,
            originalIndex: index
        });
    });

    // Sort scores in descending order
    const sortedScores = Object.keys(scoreGroups)
        .map(Number)
        .sort((a, b) => b - a);

    // Assign ranks and tiers
    const result = [];
    let currentRank = 1;
    
    sortedScores.forEach((score, tierIndex) => {
        const symbols = scoreGroups[score];
        symbols.forEach((symbolData) => {
            result.push({
                symbol: symbolData.symbol,
                rank: currentRank,
                score: symbolData.score,
                tier: tierIndex + 1 // 1st tier, 2nd tier, 3rd tier, etc.
            });
        });
        currentRank += symbols.length; // Next rank starts after all symbols in this tier
    });

    return result;
}

if (app && ipcMain && typeof app.on === "function" && !app.__rating_top3_ipc_registered__) {
    app.__rating_top3_ipc_registered__ = true;

    ipcMain.removeHandler("rating-top3:get");
    ipcMain.removeHandler("rating-top3:set");
    
    ipcMain.handle("rating-top3:get", () => {
        return getRatingTop3();
    });
    
    ipcMain.handle("rating-top3:set", (_e, listOrEntries) => {
        return setRatingTop3(listOrEntries);
    });

    ipcMain.removeAllListeners("rating-top3:subscribe");
    ipcMain.on("rating-top3:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("rating-top3:change", data);
        push(getRatingTop3()); // prime immediately
        ratingTop3Bus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[rating-top3] unsubscribe WC", wc.id);
            ratingTop3Bus.removeListener("change", push);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────
// Stats Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const statsSettingsStore = createStore("stats-settings-store", "stats.");
const statsSettingsBus = new EventEmitter();

let _statsListLength = statsSettingsStore.get("listLength", 50); // Default to 50

function getStatsListLength() {
    return _statsListLength;
}

function setStatsListLength(length) {
    const newLength = Math.max(1, Number(length) || 50);
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

// Helper function to normalize top3 data
const up = (s) => String(s || "").toUpperCase();

function normalizeTop3(input) {
    const arr = (input || []).map((v, i) => {
        if (typeof v === "string") {
            return { symbol: up(v), rank: i + 1, trophy: null };
        }
        return { 
            symbol: up(v.symbol), 
            rank: Number(v.rank) || i + 1, 
            trophy: v.trophy || null 
        };
    });

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

// ─────────────────────────────────────────────────────────────────────
// News Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const newsSettingsStore = createStore("news-settings-store", "news.");
const newsSettingsBus = new EventEmitter();

// Default values
const DEFAULT_BLOCK_LIST = [
    "nasdaq surges",
    "Shares halted",
    "shares resume",
    "stocks moving in",
    "earnings scheduled",
    "Says experts",
    "us stocks",
    "futures waver",
    "shares are trading",
    "trading halt",
    "crude oil moves lower",
    "Market-moving news",
];

const DEFAULT_BULLISH_LIST = [
    "FDA Approves",
    "Clinical Trials",
    "Noteworthy Insider Activity",
    "equity purchase facility"
];

const DEFAULT_BEARISH_LIST = [
    "Sell Alert",
    "Stock Downgrade",
    "Downgrades to Sell"
];

let _newsListLength = newsSettingsStore.get("listLength", 50);
let _blockList = newsSettingsStore.get("blockList", DEFAULT_BLOCK_LIST);
let _bullishList = newsSettingsStore.get("bullishList", DEFAULT_BULLISH_LIST);
let _bearishList = newsSettingsStore.get("bearishList", DEFAULT_BEARISH_LIST);

function getNewsListLength() {
    return _newsListLength;
}

function setNewsListLength(length) {
    const newLength = Math.max(1, Number(length) || 50);
    if (newLength === _newsListLength) return false;
    
    _newsListLength = newLength;
    newsSettingsStore.set("listLength", _newsListLength);
    
    const payload = { 
        listLength: _newsListLength,
        blockList: _blockList,
        bullishList: _bullishList,
        bearishList: _bearishList
    };
    newsSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("news-settings:change", payload);
        } catch (err) {
            log.log("[news-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getBlockList() {
    return _blockList;
}

function setBlockList(list) {
    const newList = Array.isArray(list) ? list : [];
    if (JSON.stringify(newList) === JSON.stringify(_blockList)) return false;
    
    _blockList = newList;
    newsSettingsStore.set("blockList", _blockList);
    
    const payload = { 
        listLength: _newsListLength,
        blockList: _blockList,
        bullishList: _bullishList,
        bearishList: _bearishList
    };
    newsSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("news-settings:change", payload);
        } catch (err) {
            log.log("[news-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getBullishList() {
    return _bullishList;
}

function setBullishList(list) {
    const newList = Array.isArray(list) ? list : [];
    if (JSON.stringify(newList) === JSON.stringify(_bullishList)) return false;
    
    _bullishList = newList;
    newsSettingsStore.set("bullishList", _bullishList);
    
    const payload = { 
        listLength: _newsListLength,
        blockList: _blockList,
        bullishList: _bullishList,
        bearishList: _bearishList
    };
    newsSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("news-settings:change", payload);
        } catch (err) {
            log.log("[news-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

function getBearishList() {
    return _bearishList;
}

function setBearishList(list) {
    const newList = Array.isArray(list) ? list : [];
    if (JSON.stringify(newList) === JSON.stringify(_bearishList)) return false;
    
    _bearishList = newList;
    newsSettingsStore.set("bearishList", _bearishList);
    
    const payload = { 
        listLength: _newsListLength,
        blockList: _blockList,
        bullishList: _bullishList,
        bearishList: _bearishList
    };
    newsSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("news-settings:change", payload);
        } catch (err) {
            log.log("[news-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

if (app && ipcMain && typeof app.on === "function" && !app.__news_settings_ipc_registered__) {
    app.__news_settings_ipc_registered__ = true;

    ipcMain.removeHandler("news-settings:get");
    ipcMain.removeHandler("news-settings:set");
    ipcMain.removeHandler("news-settings:getBlockList");
    ipcMain.removeHandler("news-settings:setBlockList");
    ipcMain.removeHandler("news-settings:getBullishList");
    ipcMain.removeHandler("news-settings:setBullishList");
    ipcMain.removeHandler("news-settings:getBearishList");
    ipcMain.removeHandler("news-settings:setBearishList");
    
    ipcMain.handle("news-settings:get", () => {
        return { 
            listLength: getNewsListLength(),
            blockList: getBlockList(),
            bullishList: getBullishList(),
            bearishList: getBearishList()
        };
    });
    ipcMain.handle("news-settings:set", (_e, { listLength, blockList, bullishList, bearishList }) => {
        let changed = false;
        if (listLength !== undefined) {
            changed = setNewsListLength(listLength) || changed;
        }
        if (blockList !== undefined) {
            changed = setBlockList(blockList) || changed;
        }
        if (bullishList !== undefined) {
            changed = setBullishList(bullishList) || changed;
        }
        if (bearishList !== undefined) {
            changed = setBearishList(bearishList) || changed;
        }
        return changed;
    });
    
    ipcMain.handle("news-settings:getBlockList", () => {
        return getBlockList();
    });
    ipcMain.handle("news-settings:setBlockList", (_e, blockList) => {
        return setBlockList(blockList);
    });
    
    ipcMain.handle("news-settings:getBullishList", () => {
        return getBullishList();
    });
    ipcMain.handle("news-settings:setBullishList", (_e, bullishList) => {
        return setBullishList(bullishList);
    });
    
    ipcMain.handle("news-settings:getBearishList", () => {
        return getBearishList();
    });
    ipcMain.handle("news-settings:setBearishList", (_e, bearishList) => {
        return setBearishList(bearishList);
    });

    ipcMain.removeAllListeners("news-settings:subscribe");
    ipcMain.on("news-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("news-settings:change", data);
        push({ 
            listLength: getNewsListLength(),
            blockList: getBlockList(),
            bullishList: getBullishList(),
            bearishList: getBearishList()
        }); // prime immediately
        newsSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[news-settings] unsubscribe WC", wc.id);
            newsSettingsBus.removeListener("change", push);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────
// Filing Filter Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const filingFilterSettingsStore = createStore("filing-filter-settings-store", "filing.");
const filingFilterSettingsBus = new EventEmitter();

// Default filing filter settings
const DEFAULT_FILING_FILTERS = {
    // High Priority (1) - enabled by default
    group1Forms: {
        '8-K': true, '8-K/A': true,
        'S-3': true, 'S-3/A': true,
        'S-1': true, 'S-1/A': true,
        '424B1': true, '424B2': true, '424B3': true, '424B4': true, '424B5': true,
        '425': true,
        '10-Q': true, '10-Q/A': true,
        '10-K': true, '10-K/A': true,
        '6-K': true, '20-F': true, '40-F': true
    },
    
    // Medium Priority (2) - enabled by default
    group2Forms: {
        '13D': true, '13D/A': true,
        '13G': true, '13G/A': true,
        '4': true, '4/A': true,
        'DEF 14A': true, 'DEFA14A': true,
        'F-1': true, 'F-1/A': true,
        'F-3': true, 'F-3/A': true
    },
    
    // Low Priority (3) - disabled by default (display: none)
    group3Forms: {
        '11-K': false, '144': false, '144A': false, '305B2': false,
        'SC TO-T': false, 'SC 13E3': false,
        'N-Q': false, 'N-CSR': false, 'N-1A': false,
        'N-CSRS': false, 'N-MFP': false, 'N-MFP2': false, 'N-MFP3': false
    }
};

let _filingFilters = filingFilterSettingsStore.get("filters", DEFAULT_FILING_FILTERS);

function getFilingFilters() {
    return { ..._filingFilters };
}

function setFilingFilters(filters) {
    const newFilters = { ...DEFAULT_FILING_FILTERS, ...filters };
    if (JSON.stringify(newFilters) === JSON.stringify(_filingFilters)) return false;
    
    _filingFilters = newFilters;
    filingFilterSettingsStore.set("filters", _filingFilters);
    
    const payload = getFilingFilters();
    filingFilterSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("filing-filter-settings:change", payload);
        } catch (err) {
            log.log("[filing-filter-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}


function setFilingFormEnabled(groupNumber, formType, enabled) {
    const groupKey = `group${groupNumber}Forms`;
    if (_filingFilters[groupKey] && _filingFilters[groupKey][formType] !== enabled) {
        const newFilters = { 
            ..._filingFilters, 
            [groupKey]: { 
                ..._filingFilters[groupKey], 
                [formType]: enabled 
            } 
        };
        return setFilingFilters(newFilters);
    }
    return false;
}

if (app && ipcMain && typeof app.on === "function" && !app.__filing_filter_settings_ipc_registered__) {
    app.__filing_filter_settings_ipc_registered__ = true;

    ipcMain.removeHandler("filing-filter-settings:get");
    ipcMain.removeHandler("filing-filter-settings:set");
    ipcMain.removeHandler("filing-filter-settings:set-form-enabled");
    
    ipcMain.handle("filing-filter-settings:get", () => {
        return getFilingFilters();
    });
    
    ipcMain.handle("filing-filter-settings:set", (_e, filters) => {
        return setFilingFilters(filters);
    });
    
    
    ipcMain.handle("filing-filter-settings:set-form-enabled", (_e, { groupNumber, formType, enabled }) => {
        return setFilingFormEnabled(groupNumber, formType, enabled);
    });

    ipcMain.removeAllListeners("filing-filter-settings:subscribe");
    ipcMain.on("filing-filter-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("filing-filter-settings:change", data);
        push(getFilingFilters()); // prime immediately
        filingFilterSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[filing-filter-settings] unsubscribe WC", wc.id);
            filingFilterSettingsBus.removeListener("change", push);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────
// Frontline Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const frontlineSettingsStore = createStore("frontline-settings-store", "frontline.");
const frontlineSettingsBus = new EventEmitter();

let _frontlineListLength = frontlineSettingsStore.get("listLength", 14); // Default to 14 (matches legacy default)

function getFrontlineListLength() {
    return _frontlineListLength;
}

function setFrontlineListLength(length) {
    const newLength = Math.max(1, Number(length) || 14);
    if (newLength === _frontlineListLength) return false;
    
    _frontlineListLength = newLength;
    frontlineSettingsStore.set("listLength", _frontlineListLength);
    
    const payload = { listLength: _frontlineListLength };
    frontlineSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("frontline-settings:change", payload);
        } catch (err) {
            log.log("[frontline-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

if (app && ipcMain && typeof app.on === "function" && !app.__frontline_settings_ipc_registered__) {
    app.__frontline_settings_ipc_registered__ = true;

    ipcMain.removeHandler("frontline-settings:get");
    ipcMain.removeHandler("frontline-settings:set");
    
    ipcMain.handle("frontline-settings:get", () => {
        return { listLength: getFrontlineListLength() };
    });
    
    ipcMain.handle("frontline-settings:set", (_e, { listLength }) => {
        return setFrontlineListLength(listLength);
    });

    ipcMain.removeAllListeners("frontline-settings:subscribe");
    ipcMain.on("frontline-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("frontline-settings:change", data);
        push({ listLength: getFrontlineListLength() }); // prime immediately
        frontlineSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[frontline-settings] unsubscribe WC", wc.id);
            frontlineSettingsBus.removeListener("change", push);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────
// Heroes Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const heroesSettingsStore = createStore("heroes-settings-store", "heroes.");
const heroesSettingsBus = new EventEmitter();

let _heroesListLength = heroesSettingsStore.get("listLength", 3); // Default to 3 (matches legacy default)

function getHeroesListLength() {
    return _heroesListLength;
}

function setHeroesListLength(length) {
    const newLength = Math.max(1, Number(length) || 3);
    if (newLength === _heroesListLength) return false;
    
    _heroesListLength = newLength;
    heroesSettingsStore.set("listLength", _heroesListLength);
    
    const payload = { listLength: _heroesListLength };
    heroesSettingsBus.emit("change", payload);
    
    const targets = webContents.getAllWebContents();
    for (const wc of targets) {
        try {
            wc.send("heroes-settings:change", payload);
        } catch (err) {
            log.log("[heroes-settings] send failed", { target: wc.id, err: String(err) });
        }
    }
    return true;
}

if (app && ipcMain && typeof app.on === "function" && !app.__heroes_settings_ipc_registered__) {
    app.__heroes_settings_ipc_registered__ = true;

    ipcMain.removeHandler("heroes-settings:get");
    ipcMain.removeHandler("heroes-settings:set");
    
    ipcMain.handle("heroes-settings:get", () => {
        return { listLength: getHeroesListLength() };
    });
    
    ipcMain.handle("heroes-settings:set", (_e, { listLength }) => {
        return setHeroesListLength(listLength);
    });

    ipcMain.removeAllListeners("heroes-settings:subscribe");
    ipcMain.on("heroes-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("heroes-settings:change", data);
        push({ listLength: getHeroesListLength() }); // prime immediately
        heroesSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[heroes-settings] unsubscribe WC", wc.id);
            heroesSettingsBus.removeListener("change", push);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────
// Traderview Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const traderviewSettingsStore = createStore("traderview-settings-store", "traderview.");
const traderviewSettingsBus = new EventEmitter();

let _traderviewVisibility = traderviewSettingsStore.get("visibility", false);
let _traderviewEnableHeroes = traderviewSettingsStore.get("enableHeroes", false);
let _traderviewAutoClose = traderviewSettingsStore.get("autoClose", true);
let _traderviewEnableActiveChart = traderviewSettingsStore.get("enableActiveChart", true);
let _traderviewAutoCloseActive = traderviewSettingsStore.get("autoCloseActive", true);

function getTraderviewSettings() {
    return {
        visibility: _traderviewVisibility,
        enableHeroes: _traderviewEnableHeroes,
        autoClose: _traderviewAutoClose,
        enableActiveChart: _traderviewEnableActiveChart,
        autoCloseActive: _traderviewAutoCloseActive
    };
}

function setTraderviewSettings(settings) {
    let changed = false;
    
    if (settings.visibility !== undefined && settings.visibility !== _traderviewVisibility) {
        _traderviewVisibility = Boolean(settings.visibility);
        traderviewSettingsStore.set("visibility", _traderviewVisibility);
        changed = true;
    }
    
    if (settings.enableHeroes !== undefined && settings.enableHeroes !== _traderviewEnableHeroes) {
        _traderviewEnableHeroes = Boolean(settings.enableHeroes);
        traderviewSettingsStore.set("enableHeroes", _traderviewEnableHeroes);
        changed = true;
    }
    
    if (settings.autoClose !== undefined && settings.autoClose !== _traderviewAutoClose) {
        _traderviewAutoClose = Boolean(settings.autoClose);
        traderviewSettingsStore.set("autoClose", _traderviewAutoClose);
        changed = true;
    }
    
    if (settings.enableActiveChart !== undefined && settings.enableActiveChart !== _traderviewEnableActiveChart) {
        _traderviewEnableActiveChart = Boolean(settings.enableActiveChart);
        traderviewSettingsStore.set("enableActiveChart", _traderviewEnableActiveChart);
        changed = true;
    }
    
    if (settings.autoCloseActive !== undefined && settings.autoCloseActive !== _traderviewAutoCloseActive) {
        _traderviewAutoCloseActive = Boolean(settings.autoCloseActive);
        traderviewSettingsStore.set("autoCloseActive", _traderviewAutoCloseActive);
        changed = true;
    }
    
    if (changed) {
        const payload = getTraderviewSettings();
        traderviewSettingsBus.emit("change", payload);
        
        const targets = webContents.getAllWebContents();
        for (const wc of targets) {
            try {
                wc.send("traderview-settings:change", payload);
            } catch (err) {
                log.log("[traderview-settings] send failed", { target: wc.id, err: String(err) });
            }
        }
    }
    
    return changed;
}

// Individual setters for convenience
function setTraderviewVisibility(visibility) {
    return setTraderviewSettings({ visibility });
}

function setTraderviewEnableHeroes(enableHeroes) {
    return setTraderviewSettings({ enableHeroes });
}

function setTraderviewAutoClose(autoClose) {
    return setTraderviewSettings({ autoClose });
}

function setTraderviewEnableActiveChart(enableActiveChart) {
    return setTraderviewSettings({ enableActiveChart });
}

function setTraderviewAutoCloseActive(autoCloseActive) {
    return setTraderviewSettings({ autoCloseActive });
}

if (app && ipcMain && typeof app.on === "function" && !app.__traderview_settings_ipc_registered__) {
    app.__traderview_settings_ipc_registered__ = true;

    ipcMain.removeHandler("traderview-settings:get");
    ipcMain.removeHandler("traderview-settings:set");
    
    ipcMain.handle("traderview-settings:get", () => {
        return getTraderviewSettings();
    });
    
    ipcMain.handle("traderview-settings:set", (_e, settings) => {
        return setTraderviewSettings(settings);
    });

    ipcMain.removeAllListeners("traderview-settings:subscribe");
    ipcMain.on("traderview-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("traderview-settings:change", data);
        push(getTraderviewSettings()); // prime immediately
        traderviewSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[traderview-settings] unsubscribe WC", wc.id);
            traderviewSettingsBus.removeListener("change", push);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────
// World Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const worldSettingsStore = createStore("world-settings-store", "world.");
const worldSettingsBus = new EventEmitter();

let _worldMinPrice = worldSettingsStore.get("minPrice", 1);
let _worldMaxPrice = worldSettingsStore.get("maxPrice", 0);
let _worldMinFloat = worldSettingsStore.get("minFloat", 0);
let _worldMaxFloat = worldSettingsStore.get("maxFloat", 0);
let _worldMinScore = worldSettingsStore.get("minScore", 0);
let _worldMaxScore = worldSettingsStore.get("maxScore", 0);
let _worldMinVolume = worldSettingsStore.get("minVolume", 0);
let _worldMaxVolume = worldSettingsStore.get("maxVolume", 0);
let _worldMinChangePercent = worldSettingsStore.get("minChangePercent", 0);

function getWorldSettings() {
    return {
        minPrice: _worldMinPrice,
        maxPrice: _worldMaxPrice,
        minFloat: _worldMinFloat,
        maxFloat: _worldMaxFloat,
        minScore: _worldMinScore,
        maxScore: _worldMaxScore,
        minVolume: _worldMinVolume,
        maxVolume: _worldMaxVolume,
        minChangePercent: _worldMinChangePercent,
    };
}

function setWorldSettings(settings) {
    let changed = false;
    
    if (settings.minPrice !== undefined && settings.minPrice !== _worldMinPrice) {
        _worldMinPrice = Number(settings.minPrice) || 0;
        worldSettingsStore.set("minPrice", _worldMinPrice);
        changed = true;
    }
    
    if (settings.maxPrice !== undefined && settings.maxPrice !== _worldMaxPrice) {
        _worldMaxPrice = Number(settings.maxPrice) || 0;
        worldSettingsStore.set("maxPrice", _worldMaxPrice);
        changed = true;
    }
    
    if (settings.minFloat !== undefined && settings.minFloat !== _worldMinFloat) {
        _worldMinFloat = Number(settings.minFloat) || 0;
        worldSettingsStore.set("minFloat", _worldMinFloat);
        changed = true;
    }
    
    if (settings.maxFloat !== undefined && settings.maxFloat !== _worldMaxFloat) {
        _worldMaxFloat = Number(settings.maxFloat) || 0;
        worldSettingsStore.set("maxFloat", _worldMaxFloat);
        changed = true;
    }
    
    if (settings.minScore !== undefined && settings.minScore !== _worldMinScore) {
        _worldMinScore = Number(settings.minScore) || 0;
        worldSettingsStore.set("minScore", _worldMinScore);
        changed = true;
    }
    
    if (settings.maxScore !== undefined && settings.maxScore !== _worldMaxScore) {
        _worldMaxScore = Number(settings.maxScore) || 0;
        worldSettingsStore.set("maxScore", _worldMaxScore);
        changed = true;
    }
    
    if (settings.minVolume !== undefined && settings.minVolume !== _worldMinVolume) {
        _worldMinVolume = Number(settings.minVolume) || 0;
        worldSettingsStore.set("minVolume", _worldMinVolume);
        changed = true;
    }
    
    if (settings.maxVolume !== undefined && settings.maxVolume !== _worldMaxVolume) {
        _worldMaxVolume = Number(settings.maxVolume) || 0;
        worldSettingsStore.set("maxVolume", _worldMaxVolume);
        changed = true;
    }
    
    if (settings.minChangePercent !== undefined && settings.minChangePercent !== _worldMinChangePercent) {
        _worldMinChangePercent = Number(settings.minChangePercent) || 0;
        worldSettingsStore.set("minChangePercent", _worldMinChangePercent);
        changed = true;
    }
    
    if (changed) {
        const payload = getWorldSettings();
        worldSettingsBus.emit("change", payload);
        
        const targets = webContents.getAllWebContents();
        for (const wc of targets) {
            try {
                wc.send("world-settings:change", payload);
            } catch (err) {
                log.log("[world-settings] send failed", { target: wc.id, err: String(err) });
            }
        }
    }
    
    return changed;
}

// Individual setters for convenience
function setWorldMinPrice(minPrice) {
    return setWorldSettings({ minPrice });
}

function setWorldMaxPrice(maxPrice) {
    return setWorldSettings({ maxPrice });
}

function setWorldMinFloat(minFloat) {
    return setWorldSettings({ minFloat });
}

function setWorldMaxFloat(maxFloat) {
    return setWorldSettings({ maxFloat });
}

function setWorldMinScore(minScore) {
    return setWorldSettings({ minScore });
}

function setWorldMaxScore(maxScore) {
    return setWorldSettings({ maxScore });
}

function setWorldMinVolume(minVolume) {
    return setWorldSettings({ minVolume });
}

function setWorldMaxVolume(maxVolume) {
    return setWorldSettings({ maxVolume });
}

function setWorldMinChangePercent(minChangePercent) {
    return setWorldSettings({ minChangePercent });
}

if (app && ipcMain && typeof app.on === "function" && !app.__world_settings_ipc_registered__) {
    app.__world_settings_ipc_registered__ = true;

    ipcMain.removeHandler("world-settings:get");
    ipcMain.removeHandler("world-settings:set");
    
    ipcMain.handle("world-settings:get", () => {
        return getWorldSettings();
    });
    
    ipcMain.handle("world-settings:set", (_e, settings) => {
        return setWorldSettings(settings);
    });

    ipcMain.removeAllListeners("world-settings:subscribe");
    ipcMain.on("world-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("world-settings:change", data);
        push(getWorldSettings()); // prime immediately
        worldSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[world-settings] unsubscribe WC", wc.id);
            worldSettingsBus.removeListener("change", push);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────
// Audio Settings store (persist + broadcast)
// ─────────────────────────────────────────────────────────────────────

const audioSettingsStore = createStore("audio-settings-store", "audio.");
const audioSettingsBus = new EventEmitter();

let _audioComboVolume = audioSettingsStore.get("comboVolume", 0.55);
let _audioNewsVolume = audioSettingsStore.get("newsVolume", 1.0);
let _audioHodChimeVolume = audioSettingsStore.get("hodChimeVolume", 0.05);
let _audioComboMuted = audioSettingsStore.get("comboMuted", false);
let _audioNewsMuted = audioSettingsStore.get("newsMuted", false);
let _audioChimeMuted = audioSettingsStore.get("chimeMuted", false);

function getAudioSettings() {
    return {
        comboVolume: _audioComboVolume,
        newsVolume: _audioNewsVolume,
        hodChimeVolume: _audioHodChimeVolume,
        comboMuted: _audioComboMuted,
        newsMuted: _audioNewsMuted,
        chimeMuted: _audioChimeMuted
    };
}

function setAudioSettings(settings) {
    let changed = false;
    
    if (settings.comboVolume !== undefined && settings.comboVolume !== _audioComboVolume) {
        _audioComboVolume = Math.max(0, Math.min(1, Number(settings.comboVolume) || 0.55));
        audioSettingsStore.set("comboVolume", _audioComboVolume);
        changed = true;
    }
    
    if (settings.newsVolume !== undefined && settings.newsVolume !== _audioNewsVolume) {
        _audioNewsVolume = Math.max(0, Math.min(1, Number(settings.newsVolume) || 1.0));
        audioSettingsStore.set("newsVolume", _audioNewsVolume);
        changed = true;
    }
    
    if (settings.hodChimeVolume !== undefined && settings.hodChimeVolume !== _audioHodChimeVolume) {
        _audioHodChimeVolume = Math.max(0, Math.min(1, Number(settings.hodChimeVolume) || 0.05));
        audioSettingsStore.set("hodChimeVolume", _audioHodChimeVolume);
        changed = true;
    }
    
    if (settings.comboMuted !== undefined && settings.comboMuted !== _audioComboMuted) {
        _audioComboMuted = Boolean(settings.comboMuted);
        audioSettingsStore.set("comboMuted", _audioComboMuted);
        changed = true;
    }
    
    if (settings.newsMuted !== undefined && settings.newsMuted !== _audioNewsMuted) {
        _audioNewsMuted = Boolean(settings.newsMuted);
        audioSettingsStore.set("newsMuted", _audioNewsMuted);
        changed = true;
    }
    
    if (settings.chimeMuted !== undefined && settings.chimeMuted !== _audioChimeMuted) {
        _audioChimeMuted = Boolean(settings.chimeMuted);
        audioSettingsStore.set("chimeMuted", _audioChimeMuted);
        changed = true;
    }
    
    if (changed) {
        const payload = getAudioSettings();
        audioSettingsBus.emit("change", payload);
        
        const targets = webContents.getAllWebContents();
        for (const wc of targets) {
            try {
                wc.send("audio-settings:change", payload);
            } catch (err) {
                log.log("[audio-settings] send failed", { target: wc.id, err: String(err) });
            }
        }
    }
    
    return changed;
}

// Individual setters for convenience
function setAudioComboVolume(volume) {
    return setAudioSettings({ comboVolume: volume });
}

function setAudioNewsVolume(volume) {
    return setAudioSettings({ newsVolume: volume });
}

function setAudioHodChimeVolume(volume) {
    return setAudioSettings({ hodChimeVolume: volume });
}

function setAudioComboMuted(muted) {
    return setAudioSettings({ comboMuted: muted });
}

function setAudioNewsMuted(muted) {
    return setAudioSettings({ newsMuted: muted });
}

function setAudioChimeMuted(muted) {
    return setAudioSettings({ chimeMuted: muted });
}

if (app && ipcMain && typeof app.on === "function" && !app.__audio_settings_ipc_registered__) {
    app.__audio_settings_ipc_registered__ = true;

    ipcMain.removeHandler("audio-settings:get");
    ipcMain.removeHandler("audio-settings:set");
    
    ipcMain.handle("audio-settings:get", () => {
        return getAudioSettings();
    });
    
    ipcMain.handle("audio-settings:set", (_e, settings) => {
        return setAudioSettings(settings);
    });

    ipcMain.removeAllListeners("audio-settings:subscribe");
    ipcMain.on("audio-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("audio-settings:change", data);
        push(getAudioSettings()); // prime immediately
        audioSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            log.log("[audio-settings] unsubscribe WC", wc.id);
            audioSettingsBus.removeListener("change", push);
        });
    });
    
    // Audio playback IPC handlers - forward to progress window
    ipcMain.removeHandler("audio:play-news-alert");
    ipcMain.removeHandler("audio:play-hod-chime");
    ipcMain.removeHandler("audio:play-events-combo");
    ipcMain.removeHandler("audio:test-news-alert");
    ipcMain.removeHandler("audio:test-hod-chime");
    ipcMain.removeHandler("audio:test-events-combo");
    
    ipcMain.handle("audio:play-news-alert", () => {
        // Find progress window and send audio command
        const targets = webContents.getAllWebContents();
        for (const wc of targets) {
            try {
                wc.send("audio-command:play-news-alert");
            } catch (err) {
                // Ignore errors for closed windows
            }
        }
        return true;
    });
    
    ipcMain.handle("audio:play-hod-chime", () => {
        const targets = webContents.getAllWebContents();
        for (const wc of targets) {
            try {
                wc.send("audio-command:play-hod-chime");
            } catch (err) {
                // Ignore errors for closed windows
            }
        }
        return true;
    });
    
    ipcMain.handle("audio:play-events-combo", (_e, { strength = 0, isLongAlert = false, comboLevel = 2 } = {}) => {
        const targets = webContents.getAllWebContents();
        for (const wc of targets) {
            try {
                wc.send("audio-command:play-events-combo", { strength, isLongAlert, comboLevel });
            } catch (err) {
                // Ignore errors for closed windows
            }
        }
        return true;
    });
    
    ipcMain.handle("audio:test-news-alert", () => {
        const targets = webContents.getAllWebContents();
        for (const wc of targets) {
            try {
                wc.send("audio-command:test-news-alert");
            } catch (err) {
                // Ignore errors for closed windows
            }
        }
        return true;
    });
    
    ipcMain.handle("audio:test-hod-chime", () => {
        const targets = webContents.getAllWebContents();
        for (const wc of targets) {
            try {
                wc.send("audio-command:test-hod-chime");
            } catch (err) {
                // Ignore errors for closed windows
            }
        }
        return true;
    });
    
    ipcMain.handle("audio:test-events-combo", () => {
        const targets = webContents.getAllWebContents();
        for (const wc of targets) {
            try {
                wc.send("audio-command:test-events-combo");
            } catch (err) {
                // Ignore errors for closed windows
            }
        }
        return true;
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
        isOpen: true,
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
    // dockerWindow: { // Removed
    //     width: 200,
    //     height: 100,
    //     isOpen: true,
    // },
    progressWindow: {
        width: 800,
        height: 14,
        isOpen: true,
    },
    frontlineWindow: {
        width: 321,
        height: 479,
        isOpen: true,
    },
    activeWindow: {
        width: 802,
        height: 404,
        isOpen: false,
    },
    heroesWindow: {
        width: 850,
        height: 660,
        isOpen: true,
    },
    scrollXpWindow: {
        width: 300,
        height: 200,
        isOpen: false,
    },
    scrollChangeWindow: {
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
        isOpen: true,
    },
    sessionHistoryWindow: {
        width: 532,
        height: 168,
        isOpen: false,
    },
    haltsWindow: {
        width: 850,
        height: 660,
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
        // log.log("[window-settings] Screen module not ready, using safe defaults");
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
            // dockerWindow: { x: 100, y: 100 }, // Removed
            progressWindow: { x: 0, y: 100 },
            scrollXpWindow: { x: -100, y: 100 },
            scrollChangeWindow: { x: -100, y: 125 },
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
    // if (process.env.NODE_ENV === 'development') {
    //     log.log(`[window-settings] 📋 Initialized ${windowKey}:`, {
    //         position: storedState.position,
    //         isOpen: storedState.isOpen,
    //         width: storedState.width,
    //         height: storedState.height,
    //         x: _windowStates[windowKey].x,
    //         y: _windowStates[windowKey].y,
    //         hasStoredPosition
    //     });
    // }
}

// Function to recalculate positions when app is ready
function recalculatePositionsWhenReady() {
    // log.log("[window-settings] 🔄 Recalculating positions for windows without stored positions");
    
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
                
                // log.log(`[window-settings] 📍 Calculating new position for ${windowKey}:`, {
                //     from: { x: storedState.x, y: storedState.y },
                //     to: calculatedPos,
                //     width: storedState.width || defaultState.width,
                //     height: storedState.height || defaultState.height
                // });
                setWindowState(windowKey, { ...storedState, ...calculatedPos });
            } else {
                log.log(`[window-settings] ✅ ${windowKey} already has stored position:`, {
                    x: storedState.x,
                    y: storedState.y
                });
            }
        }
    }
    
    // log.log("[window-settings] ✅ Position recalculation complete");
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
            // log.log("[window-settings] App ready, recalculating window positions");
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
        // log.log("[window-settings] 🚨 Emergency reset triggered");
        return clearAllWindowSettings();
    });

    ipcMain.removeAllListeners("window-settings:subscribe");
    ipcMain.on("window-settings:subscribe", (e) => {
        const wc = e.sender;
        const push = (data) => wc.send("window-settings:change", data);
        push(getAllWindowStates()); // prime immediately
        windowSettingsBus.on("change", push);
        wc.once("destroyed", () => {
            // log.log("[window-settings] unsubscribe WC", wc.id); 
            windowSettingsBus.removeListener("change", push);
        });
    });
}

module.exports = {
    // keep your existing exports...
    getLastAckCursor,
    setLastAckCursor,
    resetCursor,

    // XP Top-3 exports
    getXpTop3,
    setXpTop3,
    
    // Change Top-3 exports
    getChangeTop3,
    setChangeTop3,
    
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
    
    // Change settings exports
    getChangeListLength,
    setChangeListLength,
    getChangeShowHeaders,
    setChangeShowHeaders,
    getChangeShowUpXp,
    setChangeShowUpXp,
    getChangeShowDownXp,
    setChangeShowDownXp,
    getChangeShowRatio,
    setChangeShowRatio,
    getChangeShowTotal,
    setChangeShowTotal,
    getChangeShowNet,
    setChangeShowNet,
    getChangeShowPrice,
    setChangeShowPrice,
    getChangeShowTotalVolume,
    setChangeShowTotalVolume,
    getChangeShowLevel,
    setChangeShowLevel,
    getChangeShowSessionChange,
    setChangeShowSessionChange,
    
    // HOD settings exports
    getHodListLength,
    setHodListLength,
    getHodChimeVolume,
    setHodChimeVolume,
    getHodTickVolume,
    setHodTickVolume,
    getHodSymbolLength,
    setHodSymbolLength,
    
    // Rating Top-3 exports
    getRatingTop3,
    setRatingTop3,
    
    // Stats settings exports
    getStatsListLength,
    setStatsListLength,
    
    // News settings exports
    getNewsListLength,
    setNewsListLength,
    
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
    
    // News store functions
    getBlockList,
    setBlockList,
    getBullishList,
    setBullishList,
    getBearishList,
    setBearishList,
    
    // Filing filter settings exports
    getFilingFilters,
    setFilingFilters,
    setFilingFormEnabled,
    
    // Frontline settings exports
    getFrontlineListLength,
    setFrontlineListLength,
    
    // Heroes settings exports
    getHeroesListLength,
    setHeroesListLength,
    
    // Traderview settings exports
    getTraderviewSettings,
    setTraderviewSettings,
    setTraderviewVisibility,
    setTraderviewEnableHeroes,
    setTraderviewAutoClose,
    setTraderviewEnableActiveChart,
    setTraderviewAutoCloseActive,
    
    // World settings exports
    getWorldSettings,
    setWorldSettings,
    setWorldMinPrice,
    setWorldMaxPrice,
    setWorldMinFloat,
    setWorldMaxFloat,
    setWorldMinScore,
    setWorldMaxScore,
    setWorldMinVolume,
    setWorldMaxVolume,
    setWorldMinChangePercent,
    
    // Audio settings exports
    getAudioSettings,
    setAudioSettings,
    setAudioComboVolume,
    setAudioNewsVolume,
    setAudioHodChimeVolume,
    setAudioComboMuted,
    setAudioNewsMuted,
    setAudioChimeMuted,
    
    // For testing - expose IPC handlers and stores
    ipcMain: app && ipcMain ? ipcMain : undefined,
    windowSettingsStore: app ? windowSettingsStore : undefined,
};
