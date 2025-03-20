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

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const tickerStore = require("./store");

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
// WINDOWS

const { createSplashWindow } = require("./windows/splash");
const { createDockerWindow } = require("./windows/docker");
const { createSettingsWindow } = require("./windows/settings");
const { createDailyWindow } = require("./windows/daily");
const { createSessionWindow } = require("./windows/session");
const { createActiveWindow } = require("./windows/active");
const { createNewsWindow } = require("./windows/news");
const { createScannerWindow } = require("./windows/scanner");

let windows = {};

function createWindow(name, createFn) {
    windows[name] = createFn();
    return windows[name];
}

////////////////////////////////////////////////////////////////////////////////////
// COLLECTORS

const { connectMTP, fetchSymbolsFromServer } = require("./collectors/mtp");


////////////////////////////////////////////////////////////////////////////////////
// DATA

// Use system settings file for production, separate file for development
const SETTINGS_FILE = isDevelopment ? path.join(__dirname, "../data/settings.dev.json") : path.join(app.getPath("userData"), "settings.json");

const FIRST_RUN_FILE = path.join(app.getPath("userData"), "first-run.lock"); // used to determine if this is a fresh new install

// Default settings for fresh installs
const DEFAULT_SETTINGS = {
    top: {
        minPrice: 0,
        maxPrice: 100,
        minFloat: 0,
        maxFloat: 0,
        minScore: 0,
        maxScore: 0,
        minVolume: 0,
        maxVolume: 0,
        lists: {
            session: {
                Price: false,
                alertChangePercent: false,
                cumulativeUpChange: true,
                cumulativeDownChange: false,
                Score: true,
                Bonuses: true,
                length: 3,
            },
            daily: {
                Price: false,
                alertChangePercent: false,
                cumulativeUpChange: true,
                cumulativeDownChange: false,
                Score: true,
                Bonuses: true,
                length: 3,
            },
        },
    },
    news: {
        showTrackedTickers: false,
        filteredTickers: [],
        blockList: [],
        bullishList: [
            "FDA Approves",
            "Clinical Trials",
            "Noteworthy Insider Activity",
            "FDA Approval Granted",
            "Drug Trial Success",
            "Phase 3 Trial Results",
            "Breakthrough Therapy Designation",
            "Biotech Approval",
            "Positive Data from Clinical Study",
            "SEC Investigation Dropped",
            "Regulatory Approval Granted",
            "Government Contract Secured",
            "Lawsuit Settlement Reached",
            "Initiates Coverage",
            "Buy Rating",
            "Strong Buy",
            "Price Target Raised",
            "Upgrades to Buy",
            "Raises Price Target",
            "Maintains Overweight Rating",
            "Reiterates Buy",
            "New Wall Street Coverage",
            "Stock Upgrade",
            "Top Pick",
            "Bullish Call",
            "Underweight to Overweight",
            "Hedge Fund Buys",
            "Institutional Ownership Increases",
            "Buffett Increases Stake",
            "ARK Invest Adds",
            "Large Insider Purchase",
            "CEO Buys",
            "10% Owner Acquires",
            "Earnings Beat Expectations",
            "Revenue Surprise",
            "Raises Guidance",
            "Record Revenue",
            "Merger Announced",
            "Strategic Partnership",
            "Joint Venture Agreement",
            "Government Contract Awarded",
            "Short Interest at Record High",
            "Short Squeeze Potential",
            "Unusual Options Activity",
            "Massive Call Buying",
            "Dark Pool Order Detected",
            "Unusual Trading Volume"
        ],
        bearishList: [
            "Sell Alert",
            "Stock Downgrade",
            "Downgrades to Sell",
            "Lowers Price Target",
            "Underperform Rating",
            "Bearish Call",
            "To Acquire",
            "Snaps Up",
            "Takeover Attempt",
            "Exploring Strategic Alternatives",
            "CEO Sells",
            "Large Insider Selling",
            "Hedge Fund Exits",
            "Institutional Ownership Decreases",
            "Revenue Miss",
            "Earnings Miss",
            "Lowers Guidance",
            "Regulatory Investigation",
            "SEC Investigation Launched",
            "Short Report Released"
        ],
        allowMultiSymbols: false,
    },
};


// 🛠️ **Function to check if it's a fresh install**
function isFirstInstall() {
    return !fs.existsSync(SETTINGS_FILE) && !fs.existsSync(FIRST_RUN_FILE);
}

// 🛠️ Function to merge settings with defaults, ensuring all keys exist
function mergeSettingsWithDefaults(userSettings, defaultSettings) {
    return {
        ...defaultSettings,
        ...userSettings,
        top: {
            ...defaultSettings.top,
            ...userSettings.top,
            lists: {
                session: {
                    ...defaultSettings.top.lists.session,
                    ...userSettings.top?.lists?.session,
                    length: userSettings.top?.lists?.session?.length ?? defaultSettings.top.lists.session.length,
                },
                daily: {
                    ...defaultSettings.top.lists.daily,
                    ...userSettings.top?.lists?.daily,
                    length: userSettings.top?.lists?.daily?.length ?? defaultSettings.top.lists.daily.length,
                },
            },
            minFloat: userSettings.top?.minFloat ?? defaultSettings.top.minFloat,
            maxFloat: userSettings.top?.maxFloat ?? defaultSettings.top.maxFloat,
            minScore: userSettings.top?.minScore ?? defaultSettings.top.minScore,
            maxScore: userSettings.top?.maxScore ?? defaultSettings.top.maxScore,
            minVolume: userSettings.top?.minVolume ?? defaultSettings.top.minVolume,
            maxVolume: userSettings.top?.maxVolume ?? defaultSettings.top.maxVolume,
        },
        news: {
            ...defaultSettings.news,
            ...userSettings.news,
            blockList: userSettings.news?.blockList || [],
            bullishList: userSettings.news?.bullishList || [],
            bearishList: userSettings.news?.bearishList || [],
            allowMultiSymbols: userSettings.news?.allowMultiSymbols ?? false,
        },
    };
}

// 🛠️ Ensure `settings.dev.json` exists in development mode
if (isDevelopment && !fs.existsSync(SETTINGS_FILE)) {
    log.log("No `settings.dev.json` found, creating default dev settings...");
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
}

// 🛠️ **Function to initialize settings**
if (isFirstInstall()) {
    log.log("Fresh install detected! Creating default settings...");

    // Ensure the userData directory exists
    const settingsDir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(settingsDir)) {
        log.log(`Creating settings directory: ${settingsDir}`);
        fs.mkdirSync(settingsDir, { recursive: true }); // ✅ Ensure all parent folders exist
    }

    // Write default settings
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));

    // Create marker file to prevent future resets
    fs.writeFileSync(FIRST_RUN_FILE, "installed");

    log.log("Settings file initialized:", SETTINGS_FILE);
} else {
    log.log("Keeping existing settings");
}

// 🛠️ Function to load and validate settings from a file
function loadSettings() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            log.warn("Settings file not found. Using default settings.");
            return { ...DEFAULT_SETTINGS };
        }

        const data = fs.readFileSync(SETTINGS_FILE, "utf-8").trim();
        if (!data) {
            log.warn("Settings file is empty! Using default settings.");
            return { ...DEFAULT_SETTINGS };
        }

        const parsedSettings = JSON.parse(data);

        // ✅ Ensure missing attributes are merged
        const mergedSettings = mergeSettingsWithDefaults(parsedSettings, DEFAULT_SETTINGS);

        // ✅ Save back to file if any attributes were missing
        saveSettings(mergedSettings);

        return mergedSettings;
    } catch (err) {
        log.error("❌ Error loading settings, resetting to defaults.", err);
        return { ...DEFAULT_SETTINGS };
    }
}

// 🛠️ Function to save settings to the file
function saveSettings(settingsToSave = appSettings) {
    if (!settingsToSave) settingsToSave = { ...DEFAULT_SETTINGS };

    log.log("Saving settings file...");
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsToSave, null, 2));
}

// Assign loaded settings to `appSettings`
appSettings = loadSettings();
////////////////////////////////////////////////////////////////////////////////////
// IPC COMM

// General

ipcMain.on("exit-app", () => {
    log.log("Exiting the app...");
    app.quit();
});

ipcMain.on("restart-app", () => {
    app.relaunch();
    app.exit(0);
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
    if (windows.settings) {
        log.log("Toggle Settings Window");
        windows.settings.isVisible() ? windows.settings.hide() : windows.settings.show();
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

    saveSettings(); // ✅ Save settings after updates

    // ✅ Broadcast updated settings to all windows
    log.log("Broadcasting 'settings-updated' event...");

    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("settings-updated", appSettings);
    });
});

// Store
ipcMain.handle("get-all-symbols", () => {
    return tickerStore.getAllSymbols(); // Fetch all stored symbols
});

ipcMain.handle("get-symbol", (event, symbol) => {
    return tickerStore.getSymbol(symbol);
});

ipcMain.handle("get-tickers", (event, listType = "daily") => {
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

    // ✅ Send all news items at once instead of per ticker
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("news-updated", { newsItems });
    });
});

tickerStore.on("lists-update", () => {
    log.log("Broadcasting store update");
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("lists-updated");
    });
});

ipcMain.on("clear-session", () => {
    log.log("🔄 Received 'clear-session' event in main.js. ✅ CALLING STORE...");

    tickerStore.clearSessionData();

    setTimeout(() => {
        log.log("📢 Broadcasting clear session event to all windows... ✅");
        BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send("session-cleared");
        });
    }, 500); // ✅ Give store time to clear session
});

// daily
ipcMain.on("toggle-daily", () => {
    if (windows.daily) {
        log.log("Toggle daily Window");
        windows.daily.isVisible() ? windows.daily.hide() : windows.daily.show();
    }
});

ipcMain.on("refresh-daily", async () => {
    log.log("Refreshing daily window.");

    if (windows.daily) {
        windows.daily.close(); // Close the old window
    }

    // ✅ Recreate the window with updated settings
    windows.daily = await createTopWindow(isDevelopment);
    windows.daily.show();
});

// session
ipcMain.on("toggle-session", () => {
    if (windows.session) {
        log.log("Toggle session Window");
        windows.session.isVisible() ? windows.session.hide() : windows.session.show();
    }
});

ipcMain.on("refresh-session", async () => {
    log.log("Refreshing session window.");

    if (windows.session) {
        windows.session.close(); // Close the old window
    }

    // ✅ Recreate the window with updated settings
    windows.session = await createSessionWindow(isDevelopment);
    windows.session.show();
});

// active
ipcMain.on("toggle-active", () => {
    if (windows.active) {
        log.log("Toggle Active Window");
        windows.active.isVisible() ? windows.active.hide() : windows.active.show();
    }
});

ipcMain.on("set-active-ticker", (event, ticker) => {
    log.log("Received ticker:", ticker, "Type:", typeof ticker);

    if (typeof ticker !== "string") {
        log.error("Invalid ticker type! Converting to string...");
        ticker = String(ticker);
    }

    if (windows.active) {
        log.log(`Sending Active Ticker to Renderer: ${ticker}`);
        windows.active.webContents.send("update-active-ticker", ticker);
    } else {
        log.warn("Active ticker window not found.");
    }
});

// news
ipcMain.on("toggle-news", () => {
    if (windows.news) {
        log.log("Toggle News Window");
        windows.news.isVisible() ? windows.news.hide() : windows.news.show();
    }
});

ipcMain.on("set-window-bounds", (event, bounds) => {
    if (windows.news) {
        // Use windows.news instead of window.news
        windows.news.setBounds(bounds);
    }
});

// scanner
ipcMain.on("toggle-scanner", async () => {
    if (windows.scanner) {
        log.log("Toggle Scanner Window");
        windows.scanner.isVisible() ? windows.scanner.hide() : windows.scanner.show();

        try {
            // ✅ Load current settings
            const settings = loadSettings();

            // ✅ Toggle scanner volume (0 <-> 0.7)
            settings.scanner.scannerVolume = settings.scanner.scannerVolume === 0 ? 0.7 : 0;

            // ✅ Save and apply new settings
            saveSettings(settings);

            // ✅ Notify renderer process about volume change
            if (windows.scanner.webContents) {
                windows.scanner.webContents.send("settings-updated", settings);
            }

            log.log(`🔊 Scanner volume toggled to: ${settings.scanner.scannerVolume}`);
        } catch (error) {
            log.error("❌ Failed to toggle scanner volume:", error);
        }
    }
});



tickerStore.on('new-high-price', ({ symbol, price }) => {
    if (windows.scanner && windows.scanner.webContents) {
        log.log(`Sending new high price alert to scanner window: ${symbol} - ${price}`);
        windows.scanner.webContents.send('ws-alert', { 
            type: 'new-high-price', 
            symbol, 
            price 
        });
    } else {
        log.warn('Scanner window not available.');
    }
});




////////////////////////////////////////////////////////////////////////////////////
// START APP

app.on("ready", async () => {
    log.log("App ready, bootstrapping...");

    windows.splash = createSplashWindow(isDevelopment);

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

        windows.docker = createWindow("docker", () => createDockerWindow(isDevelopment));
        windows.settings = createWindow("settings", () => createSettingsWindow(isDevelopment));
        windows.daily = createWindow("daily", () => createDailyWindow(isDevelopment));
        windows.session = createWindow("session", () => createSessionWindow(isDevelopment));
        windows.active = createWindow("active", () => createActiveWindow(isDevelopment));
        windows.news = createWindow("news", () => createNewsWindow(isDevelopment));
        windows.scanner = createWindow("scanner", () => createScannerWindow(isDevelopment));

        connectMTP(windows.scanner);

        Object.values(windows).forEach((window) => window?.hide());
        windows.docker.show();

        // 🟢 Sync settings across windows
        Object.values(windows).forEach((window) => {
            if (window?.webContents) {
                window.webContents.send("settings-updated", loadSettings()); // ✅ Ensure all windows get the correct settings
            }
        });
    });
});




// Quit the app when all windows are closed
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

process.on("exit", () => {
    log.log("Saving settings before exit...");
    saveSettings();
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
