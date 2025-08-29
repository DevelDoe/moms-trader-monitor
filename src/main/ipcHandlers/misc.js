const { ipcMain, BrowserWindow } = require("electron");
const { loadSettings, saveSettings } = require("../settings");
const { getLastAckCursor, setLastAckCursor, setTop3, getTop3 } = require("../electronStores");

function setupMiscHandlers(buffManager, tickerStore) {
    // Buffs management
    ipcMain.handle("buffs:get", () => {
        return buffManager.getBuffs();
    });

    buffManager.on("update", (buffs) => {
        BrowserWindow.getAllWindows().forEach((win) => {
            if (win.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send("buffs:update", buffs);
            }
        });
    });

    // Electron stores
    ipcMain.handle("get-last-ack-cursor", () => getLastAckCursor());
    ipcMain.handle("set-last-ack-cursor", (_evt, cursor) => setLastAckCursor(cursor));

    // Top3 API
    ipcMain.handle("top3:set", (event, list) => {
        return setTop3(list);
    });

    ipcMain.handle("top3:get", () => {
        return getTop3();
    });

    ipcMain.on("top3:subscribe", (event) => {
        // Handle subscription logic here
        console.log("Top3 subscription requested");
    });

    // Traderview functionality
    global.currentTopTickers = [];

    ipcMain.on("set-top-tickers", (event, newTickers) => {
        applyTopTickers(newTickers);
    });

    ipcMain.on("set-enable-heroes", (event, enabled) => {
        const settings = loadSettings();
        settings.traderview = {
            ...(settings.traderview || {}),
            enableHeroes: enabled,
        };
        saveSettings(settings);

        if (!enabled) return;

        if (!Array.isArray(global.currentTopTickers) || global.currentTopTickers.length === 0) {
            console.log("[Traderview] EnableHeroes toggled but no top tickers available yet.");
            return;
        }

        ipcMain.emit("set-top-tickers", event, global.currentTopTickers);
    });

    // Tracked tickers publishing
    let lastKey = ""; // optional: avoid rebroadcasting identical lists
    ipcMain.on("publish-tracked-tickers", (_evt, tracked = []) => {
        try {
            const list = Array.isArray(tracked) ? Array.from(new Set(tracked.map((s) => String(s || "").toUpperCase()).filter(Boolean))) : [];

            const key = list.join(",");
            if (key === lastKey) return; // optional dedupe in main too
            lastKey = key;

            const s = loadSettings();
            s.news = { ...(s.news || {}), trackedTickers: list };
            saveSettings(s);

            BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("settings-updated", s));
        } catch (err) {
            console.error("publish-tracked-tickers failed:", err);
        }
    });

    // Volume logging
    ipcMain.on("log-volume", (event, { timestamp, volume }) => {
        const { logVolumeSnapshot } = require("../settings");
        logVolumeSnapshot(timestamp, volume);
    });

    // Active ticker management
    let activeWindowReady = false;
    let pendingActiveSymbol = null;

    ipcMain.on("set-active-ticker", (event, ticker) => {
        ticker = typeof ticker === "string" ? ticker.trim().toUpperCase() : String(ticker).toUpperCase();

        // Update global state
        global.sharedState = global.sharedState || {};
        global.sharedState.activeTicker = ticker;

        // Case 1: Active window exists & is ready → Send immediately
        const activeWindow = require("../windowManager").getWindow("active");
        if (activeWindow && !activeWindow.isDestroyed() && activeWindowReady) {
            require("../utils/safeSend").safeSend(activeWindow, "update-active-ticker", ticker);
            console.log(`✅ Active ticker updated (live): ${ticker}`);
        }
        // Case 2: Window is being restored → Buffer until ready
        else if (activeWindow && !activeWindowReady) {
            pendingActiveSymbol = ticker;
            console.log(`⏳ Buffering ticker (window loading): ${ticker}`);
        }
        // Case 3: No active window → Store in global state
        else {
            pendingActiveSymbol = ticker;
            console.log(`📦 Storing ticker (no window): ${ticker}`);
        }

        // Send to MTT (or other systems)
        const { sendActiveSymbol } = require("../../bridge");
        sendActiveSymbol(ticker);
    });

    ipcMain.on("active-window-ready", () => {
        activeWindowReady = true;
        if (pendingActiveSymbol) {
            const activeWindow = require("../windowManager").getWindow("active");
            require("../utils/safeSend").safeSend(activeWindow, "update-active-ticker", pendingActiveSymbol);
            pendingActiveSymbol = null;
        }
    });
}

function applyTopTickers(newTickers) {
    const settings = loadSettings();
    const enableHeroes = settings.traderview?.enableHeroes ?? false;
    const autoClose = settings.traderview?.autoClose ?? true;

    global.currentTopTickers = [...newTickers];

    if (!enableHeroes) return;

    const { destroyTradingViewWindow, registerTradingViewWindow } = require("../windowManager");
    const openSymbols = Object.keys(global.traderviewWindowRefs || {}).filter((s) => global.traderviewWindowRefs[s]);
    const openSet = new Set(openSymbols);
    const desiredSet = new Set(newTickers);

    if (autoClose) {
        // Close windows for tickers no longer in the list
        openSymbols.forEach((symbol) => {
            if (!desiredSet.has(symbol)) {
                destroyTradingViewWindow(symbol);
            }
        });
    }

    // Open windows for new tickers not yet displayed
    newTickers.forEach((symbol) => {
        if (!global.traderviewWindowRefs?.[symbol]) {
            registerTradingViewWindow(symbol, process.env.NODE_ENV === "development");
        }
    });

    global.traderviewWindowsVisible = true;
}

module.exports = { setupMiscHandlers };
