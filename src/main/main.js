// ./src/main/main.js 🚀❌🛑⏳🟢💾📡⚠️✅🌐🛠️🔄📩🧹📡📊🔧📢🚨
////////////////////////////////////////////////////////////////////////////////////
// INIT
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const isDevelopment = process.env.NODE_ENV === "development";
const DEBUG = process.env.DEBUG === "true";
const forceUpdate = process.env.forceUpdate === "true";

////////////////////////////////////////////////////////////////////////////////////
// PACKAGES
log.log("Init app");

const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require("electron");
const { connectBridge, sendActiveSymbol } = require("../bridge");
const { autoUpdater } = require("electron-updater");
const tickerStore = require("./store");
const { safeSend } = require("./utils/safeSend");
const { broadcast } = require("./utils/broadcast");
const windowManager = require("./windowManager");

const path = require("path");
const fs = require("fs");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-gpu-process-crash-limit");

autoUpdater.autoDownload = false; // Enable auto-downloading updates
autoUpdater.allowPrerelease = true; // Ensure pre-releases are checked
autoUpdater.setFeedURL({
    provider: "github",
    owner: "DevelDoe",
    repo: "moms-trader-monitor",
});



////////////////////////////////////////////////////////////////////////////////////
// SERVICES

const { connectMTP, fetchSymbolsFromServer, flushMessageQueue, startMockAlerts } = require("./collectors/mtp");

////////////////////////////////////////////////////////////////////////////////////
// DATA

const { loadSettings, saveSettings } = require("./settings"); 

appSettings = loadSettings();

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

////////////////////////////////////////////////////////////////////////////////////
// WINDOWS

const { createWindow, destroyWindow, restoreWindows } = require("./windowManager");

const { getWindowState, saveWindowState } = require("./utils/windowState");

const { createSplashWindow } = require("./windows/splash");
const { createDockerWindow } = require("./windows/docker");
const { createSettingsWindow } = require("./windows/settings");
const { createLiveWindow } = require("./windows/live");
const { createFocusWindow } = require("./windows/focus");
const { createDailyWindow } = require("./windows/daily");
const { createActiveWindow } = require("./windows/active");
const { createScannerWindow } = require("./windows/scanner");
const { createInfobarWindow } = require("./windows/infobar");
const { createTradingViewWindow } = require("./windows/traderview");
const { createWizardWindow } = require("./windows/wizard");
const { createProgressWindow } = require("./windows/progress");

let windows = {};

////////////////////////////////////////////////////////////////////////////////////
// IPC COMM

let isQuitting = false;

function updateWindowVisibilityState(name, isOpen) {
    if (isQuitting || !windows[name]) return;
    const bounds = windows[name].getBounds();
    saveWindowState(`${name}Window`, bounds, isOpen);
}

// General
ipcMain.on("exit-app", () => {
    log.log("Exiting the app...");
    isQuitting = true;
    app.quit();
});

ipcMain.on("restart-app", () => {
    log.log("Restarting the app...");
    isQuitting = true;
    app.relaunch();
    app.exit(0);
});

app.on("before-quit", () => {
    isQuitting = true;
    windowManager.setQuitting(true); // ✅ sync with internal state
});

ipcMain.on("resize-window-to-content", (event, { width, height }) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow) {
        senderWindow.setBounds({
            x: senderWindow.getBounds().x,
            y: senderWindow.getBounds().y,
            width: Math.max(width, 1),
            height: Math.max(height, 1),
        });
    }
});

// Splash
ipcMain.on("close-splash", () => {
    if (windows.splash) {
        log.log("Closing Splash Screen");
        windows.splash.close();
        delete windows.splash; // ✅ Ensure reference is cleared
    }
});

// Settings
ipcMain.on("toggle-settings", () => {
    const settings = windowManager.windows.settings;
    
    if (settings && !settings.isDestroyed()) {
        log.log("[toggle-settings] Destroying settings window");
        destroyWindow("settings"); // Destroy the window
    } else {
        log.log("[toggle-settings] Creating settings window");
        windows.settings = createWindow("settings", () => createSettingsWindow(isDevelopment, buffs));
        windows.settings.show();
    }
});

ipcMain.handle("get-settings", () => {
    log.log("Returning settings"); // ✅ Only logs once per second
    return appSettings;
});

ipcMain.on("update-settings", (event, newSettings) => {
    const now = Date.now();

    log.log("Updating Settings...");

    // ✅ Ensure `appSettings` exists
    if (!appSettings || typeof appSettings !== "object") {
        appSettings = { ...DEFAULT_SETTINGS };
    }

    log.log(appSettings)

    // ✅ Merge all new settings dynamically
    Object.keys(newSettings).forEach((key) => {
        if (typeof newSettings[key] === "object") {
            appSettings[key] = {
                ...appSettings[key], // Preserve existing settings
                ...newSettings[key], // Merge new properties
            };
        } else {
            log.warn(`Ignoring invalid setting update for key: ${key} (Expected an object)`);
        }
    });

    saveSettings(appSettings); // ✅ Save settings after updates

    // ✅ Broadcast updated settings to all windows
    log.log("Broadcasting 'settings-updated' event...");

    BrowserWindow.getAllWindows().forEach((win) => {
        safeSend(win, "settings-updated", appSettings);
    });
});

// Store
ipcMain.handle("get-all-symbols", () => {
    return tickerStore.getAllSymbols(); // Fetch all stored symbols
});

ipcMain.handle("get-symbol", (event, symbol) => {
    return tickerStore.getSymbol(symbol);
});

ipcMain.handle("get-tickers", (event, listType = "session") => {
    return tickerStore.getAllTickers(listType); // Fetch based on the requested type
});

ipcMain.handle("get-news", (event, ticker) => {
    return tickerStore.getTickerNews(ticker); // Fetch news for a specific ticker
});

ipcMain.handle("get-all-news", () => {
    return tickerStore.getAllNews(); // Fetch all news for tickers that have news
});

tickerStore.on("newsUpdated", (update) => {
    const { ticker, newsItems } = update;

    if (!Array.isArray(newsItems) || newsItems.length === 0) {
        log.warn(`❌ No news to broadcast for ticker: ${ticker}`);
        return; // Prevents unnecessary events
    }

    log.log(`Broadcasting ${newsItems.length} new articles`);

    broadcast("news-updated", { newsItems });
});

tickerStore.on("lists-update", () => {
    log.log("Broadcasting store update");
    broadcast("lists-updated");
});

ipcMain.on("clear-live", () => {
    log.log("🔄 Received 'clear-live' event in main.js. ✅ CALLING STORE...");

    tickerStore.clearLiveData();

    setTimeout(() => {
        log.log("📢 Broadcasting clear live event to all windows... ✅");
        broadcast("live-cleared");
    }, 500); // ✅ Give store time to clear live
});

ipcMain.handle("fetch-news", async () => {
    tickerStore.fetchNews();
});

// focus
ipcMain.on("toggle-focus", () => {
    const focus = windowManager.windows.focus;
    
    if (focus && !focus.isDestroyed()) {
        log.log("[toggle-focus] Destroying focus window");
        destroyWindow("focus"); // Destroy the window
    } else {
        log.log("[toggle-focus] Creating focus window");
        windows.focus = createWindow("focus", () => createFocusWindow(isDevelopment, buffs));
        windows.focus.show();
    }
});

ipcMain.on("recreate-focus", async () => {
    log.log("recreate focus window.");
    
    if (windows.focus) {
        windows.focus.close();  // Close the existing window
    }

    // ✅ Recreate the window with updated settings
    windows.focus = await createFocusWindow(isDevelopment);  // Recreate the window
    windows.focus.show();  // Show the newly created window
});

// Constants to fine-tune the algorithm
const BASE_MULTIPLIER = 0.5; // Starting multiplier
const VOLUME_SCALING = 50000; // Volume divisor for log2 scaling
const PRICE_SCALING = 3; // Root type for price influence: 2 = square root, 3 = cube root
const MAX_MULTIPLIER = 2.5; // Cap on the multiplier

ipcMain.handle("calculate-volume-impact", (_, { volume = 0, price = 1 }) => {
    // Adjust volume factor
    const volumeFactor = Math.log2(1 + volume / VOLUME_SCALING);

    // Adjust price weight based on chosen scaling
    const priceWeight = PRICE_SCALING === 3 ? Math.cbrt(price) : Math.sqrt(price);

    // Compute multiplier with cap
    const rawMultiplier = BASE_MULTIPLIER * volumeFactor * priceWeight;
    const multiplier = Math.min(rawMultiplier, MAX_MULTIPLIER);const path = require("path");
    const fs = require("fs");


    return {
        multiplier,
        icon: volumeFactor > 1.5 ? "🔥" : volumeFactor > 1.0 ? "🚛" : "💤",
        label: `Volume (${volume.toLocaleString()})`,
    };
});

// daily
ipcMain.on("toggle-daily", () => {
    const daily = windowManager.windows.daily;
   
    if (daily && !daily.isDestroyed()) {
        log.log("[toggle-daily] Destroying daily window");
        destroyWindow("daily"); // Destroy the window
    } else {
        log.log("[toggle-daily] Creating daily window");
        windows.daily = createWindow("daily", () => createDailyWindow(isDevelopment));
        windows.daily.show();
    }
});

ipcMain.on("recreate-daily", async () => {
    log.log("recreate daily window.");

    if (windows.daily) {
        windows.daily.close();  // Close the existing window
    }

    // ✅ Recreate the window with updated settings
    windows.daily = await createDailyWindow(isDevelopment);  // Recreate the window
    windows.daily.show();  // Show the newly created window
});

// live

// When toggling, check if it's visible or not:
ipcMain.on("toggle-live", () => {
    const live = windowManager.windows.live;

    if (live && !live.isDestroyed()) {
        log.log("[toggle-live] Destroying live window");
        destroyWindow("live"); // Destroy the window
    } else {
        log.log("[toggle-live] Creating live window");
        windows.live = createWindow("live", () => createLiveWindow(isDevelopment, buffs));
        windows.live.show();
    }
});

ipcMain.on("recreate-live", async () => {
    log.log("Recreating live window.");

    if (windows.live) {
        windows.live.close();  // Close the existing window
    }

    // ✅ Recreate the window with updated settings
    windows.live = await createLiveWindow(isDevelopment);  // Recreate the window
    windows.live.show();  // Show the newly created window
});

// active
ipcMain.on("toggle-active", () => {
    const active = windowManager.windows.active;

    if (active && !active.isDestroyed()) {
        log.log("[toggle-active] Destroying active window");
        destroyWindow("active"); // Destroy the window
    } else {
        log.log("[toggle-live] Creating active window");
        windows.active = createWindow("active", () => createActiveWindow(isDevelopment));
        windows.active.show();
    }
});

ipcMain.on("set-active-ticker", (event, ticker) => {
    if (typeof ticker !== "string") {
        ticker = String(ticker);
    }

    ticker = ticker.trim().toUpperCase();

    global.sharedState = global.sharedState || {};
    global.sharedState.activeTicker = ticker;

    // Send to static windows
    if (windows.active) {
        windows.active.webContents.send("update-active-ticker", ticker);
    }

    // 🔥 NEW: Send to MTT
    sendActiveSymbol(ticker);
});

// scanner
ipcMain.on("toggle-scanner", () => {
    const scanner = windowManager.windows.scanner;

    if (scanner && !scanner.isDestroyed()) {
        log.log("[toggle-scanner] Destroying scanner window");
        destroyWindow("scanner"); // Destroy the window
    } else {
        log.log("[toggle-scanner] Creating scanner window");
        windows.scanner = createWindow("scanner", () => createScannerWindow(isDevelopment));
        windows.scanner.show();
    }
});

tickerStore.on("new-high-price", ({ symbol, price, direction, change_percent, fiveMinVolume }) => {
    if (windows.scanner && windows.scanner.webContents) {
        log.log(`Sending new high price alert to scanner window: ${symbol} - ${price}`);
        windows.scanner.webContents.send("ws-alert", {
            symbol,
            price,
            direction: direction || "UP",
            change_percent: change_percent || 0,
            fiveMinVolume: fiveMinVolume || 0, // ✅ Corrected
            type: "new-high-price",
        });
    } else {
        log.warn("Scanner window not available.");
    }
});

// infobar
ipcMain.on("toggle-infobar", () => {
    const infobar = windowManager.windows.infobar;

    if (infobar && !infobar.isDestroyed()) {
        log.log("[toggle-infobar] Destroying infobar window");
        destroyWindow("infobar"); // Destroy the window
    } else {
        log.log("[toggle-infobar] Creating infobar window");
        windows.infobar = createWindow("infobar", () => createInfobarWindow(isDevelopment));
        windows.infobar.show();
    }
});

ipcMain.on("refresh-infobar", () => {
    if (windows.infobar && windows.infobar.webContents) {
        windows.infobar.webContents.send("trigger-window-refresh");
    }
});

// Traderview
ipcMain.on("toggle-traderview-browser", async () => {
    // Ensure that the necessary global arrays exist.
    if (!global.traderviewWindows || !global.currentTopTickers) return;

    const newSymbols = global.currentTopTickers;
    // Determine if all current windows are visible.
    const allVisible = global.traderviewWindows.every((win) => win?.isVisible());

    // If all windows are currently visible, hide them and update their state.
    if (allVisible) {
        global.traderviewWindows.forEach((win, i) => {
            if (win) {
                win.hide();
                updateWindowVisibilityState(`traderviewWindow_${i}`, false);
            }
        });
        return;
    }

    // Loop over the list of new symbols.
    for (let i = 0; i < newSymbols.length; i++) {
        const symbol = newSymbols[i];
        let win = global.traderviewWindows[i];

        // If there's no window at this slot or the current window is showing a different symbol...
        if (!win || win.symbolLoaded !== symbol) {
            // If a window exists but with an incorrect symbol, destroy it.
            if (win) {
                win.destroy();
            }
            // Create a new window using your existing createTradingViewWindow function.
            win = createTradingViewWindow(symbol, i);
            // Mark the newly created window with the loaded symbol.
            win.symbolLoaded = symbol;
            // Save the new window in the appropriate slot.
            global.traderviewWindows[i] = win;
        } else {
            // If the window is already showing the correct symbol, simply show it.
            win.show();
        }
        // Update the visibility state for the window.
        updateWindowVisibilityState(`traderviewWindow_${i}`, true);
    }

    // If there are extra windows (i.e. the global window array has more windows than symbols),
    // hide or clean them up.
    if (global.traderviewWindows.length > newSymbols.length) {
        for (let i = newSymbols.length; i < global.traderviewWindows.length; i++) {
            const win = global.traderviewWindows[i];
            if (win) {
                win.hide();
                updateWindowVisibilityState(`traderviewWindow_${i}`, false);
            }
        }
    }
});

ipcMain.on("set-top-tickers", (event, newTickers) => {
    if (!global.traderviewWindows || global.traderviewWindows.length < 4) return;

    // 🔒 Ensure currentTopTickers is initialized and padded to 4
    global.currentTopTickers = global.currentTopTickers || [null, null, null, null];

    // 📦 Ensure newTickers has exactly 4 elements
    const paddedNewTickers = [...newTickers];
    while (paddedNewTickers.length < 4) {
        paddedNewTickers.push(null);
    }

    const updatedSymbols = [...global.currentTopTickers];

    for (let i = 0; i < 4; i++) {
        const newSymbol = paddedNewTickers[i];
        if (!newSymbol || updatedSymbols.includes(newSymbol)) continue;

        // 🔄 Find a window showing a ticker not in new top tickers
        let replaceIndex = updatedSymbols.findIndex((s) => !paddedNewTickers.includes(s));
        if (replaceIndex === -1) {
            // Edge case fallback (force replacement)
            replaceIndex = i;
        }

        const win = global.traderviewWindows[replaceIndex];
        if (win) {
            const encoded = encodeURIComponent(newSymbol);
            win.loadURL(`https://www.tradingview.com/chart/?symbol=${encoded}`);
            updatedSymbols[replaceIndex] = newSymbol;
        }
    }

    global.currentTopTickers = updatedSymbols;
});

// Progress
// In your main process (electron.js or main.js)
ipcMain.on("activate-progress", () => {
    const progressWindow = windowManager.windows.progress;
    
    if (!progressWindow || progressWindow.isDestroyed()) {
        log.log("[progress] Creating progress window");
        windows.progress = createWindow("progress", () => createProgressWindow(isDevelopment));
        windows.progress.show();
    } else if (!progressWindow.isVisible()) {
        log.log("[progress] Showing existing progress window");
        progressWindow.show();
    }
});

ipcMain.on("deactivate-progress", () => {
    const progressWindow = windowManager.windows.progress;
    
    if (progressWindow && !progressWindow.isDestroyed()) {
        log.log("[progress] Hiding progress window");
        destroyWindow("progress");
    }
});

////////////////////////////////////////////////////////////////////////////////////
// START APP

app.on("ready", async () => {
    log.log("App ready, bootstrapping...");

    windows.splash = createSplashWindow(isDevelopment);createWizardWindow
    

    let symbolCount = 0;

    try {
        symbolCount = await fetchSymbolsFromServer(); // Fetch symbols and get count
        log.log(`Fetched ${symbolCount} symbols.`);
    } catch (error) {
        log.error("Failed to fetch symbols on startup:", error);
    }

    // Send symbol count to splash window
    if (windows.splash?.webContents) {
        windows.splash.webContents.send("symbols-fetched", symbolCount);
    }

    // ✅ Set scannerVolume to 0 before creating windows
    try {
        log.log("🔄 Loading settings...");
        let settings = loadSettings();

        if (!settings.scanner) settings.scanner = {};
        settings.scanner.scannerVolume = 0; // ✅ Ensure volume starts muted
        saveSettings(settings); // ✅ Persist the settings before windows load

        log.log("🔇 Scanner volume initialized to 0 (muted)");
    } catch (error) {
        log.error("❌ Failed to initialize scanner volume:", error);
    }

    windows.splash.once("closed", async () => {
        log.log("Splash screen closed. Loading main app...");

        // Create other windows if needed
        windows.docker = createWindow("docker", () => createDockerWindow(isDevelopment));
        
        // windows.live = createWindow("live", () => createLiveWindow(isDevelopment));
        // windows.focus = createWindow("focus", () => createFocusWindow(isDevelopment, buffs));
        // windows.daily = createWindow("daily", () => createDailyWindow(isDevelopment));
        // windows.active = createWindow("active", () => createActiveWindow(isDevelopment));
        // windows.scanner = createWindow("scanner", () => createScannerWindow(isDevelopment));
        // windows.infobar = createWindow("infobar", () => createInfobarWindow(isDevelopment));

        // Call restoreWindows to handle windows that should be restored
        restoreWindows();

        // windows.traderview_1 = createTradingViewWindow("AAPL", 0, isDevelopment);
        // windows.traderview_2 = createTradingViewWindow("TSLA", 1, isDevelopment);
        // windows.traderview_3 = createTradingViewWindow("NVDA", 2, isDevelopment);
        // windows.traderview_4 = createTradingViewWindow("GOOGL", 3, isDevelopment);

        global.traderviewWindows = [windows.traderview_1, windows.traderview_2, windows.traderview_3, windows.traderview_4];

        connectMTP();
        flushMessageQueue();
        connectBridge();

        if (windows.docker) {
            windows.docker.show();
        }


        const settings = loadSettings(); // load once, reuse

        Object.values(windows).forEach((win) => {
            safeSend(win, "settings-updated", settings);
        });

        startMockAlerts();
    });
});

app.whenReady().then(() => {
    // Already exists...
    globalShortcut.register("Control+Shift+L", () => {
        const live = getWindow("live");
        if (live) {
            log.log("[CrashTest] Crashing Live window renderer...");
            live.webContents.forcefullyCrashRenderer();
        } else {
            log.warn("[CrashTest] Live window not found.");
        }
    });
});

// Quit the app when all windows are closed
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

process.on("exit", () => {
    log.log("Saving settings before exit...");
    // saveSettings(appSettings);
});

////////////////////////////////////////////////////////////////////////////////////
// UPDATES

if (!isDevelopment || forceUpdate) {
    if (forceUpdate) {
        autoUpdater.forceDevUpdateConfig = true;
        autoUpdater.allowDowngrade = true;
    }

    log.log("Production mode detected, checking for updates...");
    autoUpdater.checkForUpdatesAndNotify();

    if (forceUpdate) {
        ipcMain.on("force-update-check", () => {
            log.log("Forcing update check in development mode...");
            autoUpdater.checkForUpdatesAndNotify();
        });
    }

    autoUpdater.on("checking-for-update", () => {
        log.log("Checking for update...");
    });

    autoUpdater.on("update-available", (info) => {
        log.log(`🔔 Update found: ${info.version}`);

        // ✅ Close splash screen if it's still open
        if (windows.splash && !windows.splash.isDestroyed()) {
            log.log("Closing splash screen before starting update...");
            windows.splash.close();
            delete windows.splash; // ✅ Ensure reference is removed
        }

        if (appSettings.hasDonated) {
            // 🛠 If user has donated, let them decide
            dialog
                .showMessageBox({
                    type: "info",
                    title: "Update Available",
                    message: `A new update (${info.version}) is available. Would you like to download it now?`,
                    buttons: ["Download", "Later"],
                })
                .then((result) => {
                    if (result.response === 0) {
                        log.log("User confirmed download, starting...");
                        autoUpdater.downloadUpdate();
                    } else {
                        log.log("User postponed update.");
                    }
                });
        } else {
            // 🛠 If user hasn’t donated, update automatically
            log.log("User hasn't donated, auto-downloading update...");
            autoUpdater.downloadUpdate();
        }
    });

    autoUpdater.on("update-not-available", () => {
        log.log("No update available.");
    });

    autoUpdater.on("error", (err) => {
        log.error("Update error:", err);
    });
    process.on("unhandledRejection", (reason, promise) => {
        log.error("Unhandled Promise Rejection:", reason);
    });

    autoUpdater.on("download-progress", (progressObj) => {
        let logMessage = `Download speed: ${progressObj.bytesPerSecond} - `;
        logMessage += `Downloaded ${progressObj.percent}% (${progressObj.transferred} / ${progressObj.total})`;
        log.log(logMessage);
    });

    autoUpdater.on("update-downloaded", () => {
        if (appSettings.hasDonated) {
            // 🛠 Donors can choose when to install
            dialog
                .showMessageBox({
                    type: "info",
                    title: "Update Ready",
                    message: "The update has been downloaded. Would you like to restart the app now to install it?",
                    buttons: ["Restart", "Later"],
                })
                .then((result) => {
                    if (result.response === 0) {
                        autoUpdater.quitAndInstall();
                    }
                });
        } else {
            // 🛠 Non-donors get auto-installed updates
            log.log("User hasn't donated, installing update now...");
            autoUpdater.quitAndInstall();
        }
        updateShortcutIcon();
    });
    const { exec } = require("child_process");
} else {
    log.log("Skipping auto-updates in development mode");
}

function updateShortcutIcon() {
    const shortcutPath = path.join(
        process.env.APPDATA,
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs",
        "MomsTraderMonitor.lnk" // ✅ Make sure this matches the actual shortcut name
    );

    const iconPath = path.join(__dirname, "build", "icon.ico"); // ✅ Ensure this icon exists

    const command = `
        $WScriptShell = New-Object -ComObject WScript.Shell;
        $Shortcut = $WScriptShell.CreateShortcut('${shortcutPath}');
        $Shortcut.IconLocation = '${iconPath}';
        $Shortcut.Save();
    `;

    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {
        if (error) {
            log.error("Error updating shortcut icon:", error);
        } else {
            log.log("Shortcut icon updated successfully.");
        }
    });
}

module.exports = {
    getWindowState,
    saveWindowState,
};
