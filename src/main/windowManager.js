const { BrowserWindow } = require("electron");
const { getWindowState, saveWindowState, setWindowState, nukeTradingViewWindowStates, setWindowBounds } = require("./electronStores");
const { loadSettings } = require("./settings");
const log = require("../hlps/logger")(__filename);
const { safeSend } = require("./utils/safeSend");
const { debounce } = require("./utils//debounce");

const path = require("path");
const fs = require("fs");

const { createDockerWindow } = require("./windows/docker");
const { createSettingsWindow } = require("./windows/settings");
const { createFrontlineWindow } = require("./windows/frontline");
const { createHeroesWindow } = require("./windows/heroes");
const { createActiveWindow } = require("./windows/active");
const { createEventsWindow } = require("./windows/events");
const { createInfobarWindow } = require("./windows/infobar");
const { createWizardWindow } = require("./windows/wizard");
const { createProgressWindow } = require("./windows/progress");
const { createScrollXpWindow } = require("./windows/scrollXp");
const { createScrollStatsWindow } = require("./windows/scrollStats");
const { createScrollHodWindow } = require("./windows/scrollHOD");
const { createNewsWindow } = require("./windows/news");
const { createSessionHistoryWindow } = require("./windows/sessionHistory");

const isDevelopment = process.env.NODE_ENV === "development";

const windows = {};

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

    // Don't automatically set window state to open - let the caller decide
    // setWindowState(`${name}Window`, true);

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
    // log.log(`[WindowManager] Removed reference to closed window: ${name}`);
}

function destroyWindow(name) {
    const win = windows[name];
    if (win) {
        win.destroy(); // Ensure it is destroyed properly
        cleanupWindow(name, win);
        setWindowState(`${name}Window`, false);
        // log.log(`[WindowManager] Manually destroyed window: ${name}`);
    }
}

function getWindow(name) {
    return windows[name] || null;
}

async function restoreWindows() {
    const settings = loadSettings();

    const windowKeyMap = {
        settings: "settingsWindow",
        frontline: "frontlineWindow",
        heroes: "heroesWindow",
        events: "eventsWindow", // ✅ Fixed: events should map to eventsWindow
        infobar: "infobarWindow",
        docker: "dockerWindow",
        traderview: "traderviewWindow",
        wizard: "wizardWindow",
        progress: "progressWindow",
        scrollXp: "scrollXpWindow",
        scrollStats: "scrollStatsWindow",
        scrollHod: "scrollHodWindow",
        news: "newsWindow",
        sessionHistory: "sessionHistoryWindow",
    };

    // First, restore all non-dependent windows
    Object.entries(windowKeyMap).forEach(([name, stateKey]) => {
        const windowState = getWindowState(stateKey);
        // log.log(`[windowManager] Checking window ${name} (${stateKey}):`, {
        //     isOpen: windowState?.isOpen,
        //     hasState: !!windowState,
        //     stateData: windowState
        // });
        
        if (windowState?.isOpen) {
            // log.log(`[windowManager] ✅ Restoring window: ${name}`);
            try {
                windows[name] = createWindow(name, () => createWindowByName(name));
                windows[name].show();
                // Set the window state to open since we're restoring it
                setWindowState(stateKey, true);
                // log.log(`[windowManager] ✅ Successfully created and showed window: ${name}`);
            } catch (error) {
                log.error(`[windowManager] ❌ Failed to create window ${name}:`, error.message);
            }
        } else {
            log.log(`[windowManager] ⏭️ Skipping window ${name} - not open or no state`);
        }
    });

    // Now handle the active window (if needed)
    const activeWindowState = getWindowState("activeWindow");
    if (activeWindowState?.isOpen) {
        log.log("Restoring activeWindow (with dependency check)");

        // Ensure heroesWindow exists first (if needed)
        const heroesWindowState = getWindowState("heroesWindow");
        if (heroesWindowState?.isOpen && !windows.heroes) {
            windows.heroes = createWindow("heroes", () => createWindowByName("heroes"));
            windows.heroes.show();
            // Set the window state to open since we're restoring it
            setWindowState("heroesWindow", true);
        }

        // Create the active window
        windows.active = createWindow("active", () => createActiveWindow(isDevelopment));
        windows.active.show();
        // Set the window state to open since we're restoring it
        setWindowState("activeWindow", true); 

        // Immediately set buffered ticker (if any)
        if (global.sharedState?.activeTicker) {
            log.log(`♻️ Restoring buffered ticker: ${global.sharedState.activeTicker}`);
            safeSend(windows.active, "update-active-ticker", global.sharedState.activeTicker);
            pendingActiveSymbol = null; // Clear buffer
        }
    }

    if (!windows.docker) {
        log.log("Manually restoring docker window...");
        windows.docker = createWindow("docker", () => createDockerWindow(isDevelopment));
        windows.docker.show();
    }

    // Send settings to all windows (excluding window settings which are managed separately)
    const settingsWithoutWindows = { ...settings };
    delete settingsWithoutWindows.windows;
    
    // log.log(`[windowManager] 📊 Available windows after restore:`, {
    //     total: Object.keys(windows).length,
    //     windows: Object.keys(windows),
    //     progress: !!windows.progress,
    //     events: !!windows.events,
    //     docker: !!windows.docker
    // });
    
    Object.values(windows).forEach((win) => {
        safeSend(win, "settings-updated", settingsWithoutWindows);
    });
}

function createWindowByName(name) {
    switch (name) {
        case "docker":
            return createDockerWindow(isDevelopment); 
        case "settings":
            return createSettingsWindow(isDevelopment);
        case "frontline":
            return createFrontlineWindow(isDevelopment);
        case "heroes":
            return createHeroesWindow(isDevelopment);
        case "active":
            return createActiveWindow(isDevelopment, global.sharedState?.activeTicker);
        case "events":
            return createEventsWindow(isDevelopment);
        case "infobar":
            return createInfobarWindow(isDevelopment);
        case "wizard":
            return createWizardWindow(isDevelopment);
        case "progress":
            return createProgressWindow(isDevelopment);
        case "scrollXp":
            return createScrollXpWindow(isDevelopment);
        case "scrollStats":
            return createScrollStatsWindow(isDevelopment);
        case "scrollHod":
            return createScrollHodWindow(isDevelopment);
        case "news":
            return createNewsWindow(isDevelopment);
        case "sessionHistory":
            return createSessionHistoryWindow(isDevelopment);
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

    const debouncedSetBounds = debounce(() => {
        if (!win.isDestroyed()) {
            setWindowBounds(key, win.getBounds());
        }
    }, 300); // Adjust delay if needed

    win.on("move", debouncedSetBounds);
    win.on("resize", debouncedSetBounds);

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
