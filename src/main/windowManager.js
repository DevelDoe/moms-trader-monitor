const { BrowserWindow } = require("electron");
const { getWindowState, saveWindowState, setWindowState, nukeTradingViewWindowStates, setWindowBounds } = require("./utils/windowState");
const { loadSettings } = require("./settings");
const log = require("../hlps/logger")(__filename);
const { safeSend } = require("./utils/safeSend");

const path = require("path");
const fs = require("fs");

const { createSettingsWindow } = require("./windows/settings");
const { createLiveWindow } = require("./windows/live");
const { createFrontlineWindow } = require("./windows/frontline");
const { createFocusWindow } = require("./windows/focus");
const { createDailyWindow } = require("./windows/daily");
const { createActiveWindow } = require("./windows/active");
const { createScannerWindow } = require("./windows/scanner");
const { createInfobarWindow } = require("./windows/infobar");
const { createWizardWindow } = require("./windows/wizard");
const { createProgressWindow } = require("./windows/progress");

const isDevelopment = process.env.NODE_ENV === "development";

const windows = {};

// Buffs

const buffsPath = path.join(__dirname, "../data/buffs.json");
let buffs = [];

try {
    const raw = fs.readFileSync(buffsPath, "utf-8");
    buffs = JSON.parse(raw);
    log.log("[Buffs] Loaded", buffs.length, "buffs");
} catch (err) {
    log.error("[Buffs] Failed to load buffs.json:", err);
}

let quitting = false;

function setQuitting(val) {
    quitting = val;
}

function createWindow(name, createFn) {
    let win = windows[name];
    if (!win || win.isDestroyed()) {
        win = createFn();
        windows[name] = win;

        win.on("closed", () => {
            cleanupWindow(name, win);
        });
    }

    setWindowState(`${name}Window`, true);

    return win;
}

function cleanupWindow(name, win) {
    if (!quitting && windows[name] && !win.isDestroyed()) {
        try {
            const bounds = win.getBounds();
            saveWindowState(`${name}Window`, bounds, false); // save bounds on close
        } catch (err) {
            log.warn(`[WindowManager] Failed to save bounds for ${name}:`, err);
        }
    }
    delete windows[name];
    log.log(`[WindowManager] Removed reference to closed window: ${name}`);
}

function destroyWindow(name) {
    const win = windows[name];
    if (win) {
        win.destroy(); // Ensure it is destroyed properly
        cleanupWindow(name, win);
        setWindowState(`${name}Window`, false);
        log.log(`[WindowManager] Manually destroyed window: ${name}`);
    }
}

function getWindow(name) {
    return windows[name] || null;
}

async function restoreWindows() {
    const settings = loadSettings();

    const windowKeyMap = {
        settings: "settingsWindow",
        live: "liveWindow",
        frontline: "frontlineWindow",
        focus: "focusWindow",
        daily: "dailyWindow",
        scanner: "scannerWindow",
        infobar: "infobarWindow",
        docker: "dockerWindow",
        traderview: "traderviewWindow",
        wizard: "wizardWindow",
        progress: "progressWindow",
        // activeWindow handled separately
    };

    // First, restore all non-dependent windows
    Object.entries(windowKeyMap).forEach(([name, stateKey]) => {
        const windowState = getWindowState(stateKey);
        if (windowState?.isOpen) {
            log.log(`Restoring window: ${name}`);
            windows[name] = createWindow(name, () => createWindowByName(name));
            windows[name].show();
        }
    });

    // Now handle the active window (if needed)
    const activeWindowState = getWindowState("activeWindow");
    if (activeWindowState?.isOpen) {
        log.log("Restoring activeWindow (with dependency check)");

        // Ensure focusWindow exists first (if needed)
        const focusWindowState = getWindowState("focusWindow");
        if (focusWindowState?.isOpen && !windows.focus) {
            windows.focus = createWindow("focus", () => createWindowByName("focus"));
            windows.focus.show();
        }

        // Create the active window
        windows.active = createWindow("active", () => createActiveWindow(isDevelopment));
        windows.active.show();

        // Immediately set buffered ticker (if any)
        if (global.sharedState?.activeTicker) {
            log.log(`♻️ Restoring buffered ticker: ${global.sharedState.activeTicker}`);
            safeSend(windows.active, "update-active-ticker", global.sharedState.activeTicker);
            pendingActiveSymbol = null; // Clear buffer
        }
    }

    // Show docker window explicitly
    if (windows.docker) {
        windows.docker.show();
    }

    // Send settings to all windows
    Object.values(windows).forEach((win) => {
        safeSend(win, "settings-updated", settings);
    });
}

function createWindowByName(name) {
    switch (name) {
        case "settings":
            return createSettingsWindow(isDevelopment);
        case "live":
            return createLiveWindow(isDevelopment, buffs);
        case "frontline":
            return createFrontlineWindow(isDevelopment);
        case "focus":
            return createFocusWindow(isDevelopment, buffs);
        case "daily":
            return createDailyWindow(isDevelopment);
        case "active":
            return createActiveWindow(isDevelopment, global.sharedState?.activeTicker);
        case "scanner":
            return createScannerWindow(isDevelopment);
        case "infobar":
            return createInfobarWindow(isDevelopment);
        case "wizard":
            return createWizardWindow(isDevelopment);
        case "progress":
            return createProgressWindow(isDevelopment);
        default:
            throw new Error(`No creator function for window: ${name}`);
    }
}

module.exports = {
    windows,
    createWindow,
    destroyWindow,
    getWindow,
    setQuitting,
    restoreWindows, // Export the restoreWindows function
};

///////////////////////////////////////////////////////////////// Traderview window management

// You can hook into restoreWindows() later if you want traderviewWindow_0 to auto-show too —
// just track them like any other window state, or group them under a shared visibility flag.

const tradingViewWindows = new Map(); // key = symbol

function registerTradingViewWindow(symbol = "AAPL", isDev = false) {
    let win = tradingViewWindows.get(symbol);
    if (win && !win.isDestroyed()) return win;

    const key = `traderviewWindow_${symbol}`;
    const state = getWindowState(key);

    win = new BrowserWindow({
        width: state.width || 850,
        height: state.height || 660,
        x: state.x,
        y: state.y,
        backgroundColor: "#00000000",
        webPreferences: {
            preload: path.join(__dirname, "../renderer/preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const encoded = encodeURIComponent(symbol);
    win.loadURL(`https://www.tradingview.com/chart/?symbol=${encoded}`);
    win.symbolLoaded = symbol;

    win.on("move", () => setWindowBounds(key, win.getBounds()));
    win.on("resize", () => setWindowBounds(key, win.getBounds()));

    win.on("closed", () => {
        tradingViewWindows.delete(symbol);
        setWindowState(key, false); // 👈 Visibility off on close
    });

    tradingViewWindows.set(symbol, win);
    setWindowState(key, true); // 👈 Visibility on after create

    return win;
}

function destroyTradingViewWindows() {
    for (const [symbol, win] of tradingViewWindows.entries()) {
        if (!win.isDestroyed()) {
            win.destroy();
        }
    }

    tradingViewWindows.clear();

    // 💥 Only nuke state if app is quitting
    if (quitting) {
        log.log("🧨 Quitting detected, nuking TradingView window states");
        nukeTradingViewWindowStates();
    }
}

function updateTradingViewWindows(symbols = []) {
    // Close windows that are no longer in top list
    for (const [symbol, win] of tradingViewWindows.entries()) {
        if (!symbols.includes(symbol)) {
            if (win && !win.isDestroyed()) win.destroy();
            tradingViewWindows.delete(symbol);
        }
    }

    // Ensure each symbol has a window
    for (const symbol of symbols) {
        registerTradingViewWindow(symbol);
    }
}

module.exports = {
    ...module.exports,
    registerTradingViewWindow, // ✅
    destroyTradingViewWindows,
    updateTradingViewWindows,
};
