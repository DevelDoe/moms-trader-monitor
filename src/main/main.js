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
const { createTopWindow } = require("./windows/top");
const { createNewsWindow } = require("./windows/news");

let windows = {};

function createWindow(name, createFn) {
    windows[name] = createFn();
    return windows[name];
}

////////////////////////////////////////////////////////////////////////////////////
// COLLECTORS
const { collectTickers } = require("./collectors/tickers.js");

////////////////////////////////////////////////////////////////////////////////////
// DATA

// Use system settings file for production, separate file for development
const SETTINGS_FILE = isDevelopment ? path.join(__dirname, "../data/settings.dev.json") : path.join(app.getPath("userData"), "settings.json");

const FIRST_RUN_FILE = path.join(app.getPath("userData"), "first-run.lock"); // used to determine if this is a fresh new install

// Default settings for fresh installs
const DEFAULT_SETTINGS = {
    top: {
        transparent: false,
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
                Price: true,
                ChangePercent: true,
                FiveM: true,
                Float: true,
                Volume: true,
                SprPercent: true,
                Time: true,
                HighOfDay: true,
                News: true,
                Count: true,
                Score: true,
                Bonuses: true,
                length: 10,
            },
            daily: {
                Price: false,
                ChangePercent: false,
                FiveM: false,
                Float: false,
                Volume: false,
                SprPercent: false,
                Time: false,
                HighOfDay: false,
                News: false,
                Count: false,
                Score: true,
                Bonuses: true,
                length: 4,
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
    log.log("Returning settings");
    return appSettings;
});

ipcMain.on("update-settings", (event, newSettings) => {
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
    log.log("Broadcasting 'filter-updated' event...");
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("settings-updated", appSettings);
    });
});

// Store
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

tickerStore.on("update", () => {
    log.log("Broadcasting update");
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("tickers-updated");
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



// ipcMain.handle("get-attributes", async (_event, listType) => {
//     log.log("Get Attributes:", listType);
//     return tickerStore.getAvailableAttributes(listType);
// });

// top
ipcMain.on("toggle-top", () => {
    if (windows.top) {
        log.log("Toggle Top Window");
        windows.top.isVisible() ? windows.top.hide() : windows.top.show();
    }
});

ipcMain.on("refresh-top", async () => {
    log.log("Refreshing top window.");

    if (windows.top) {
        windows.top.close(); // Close the old window
    }

    // ✅ Recreate the window with updated settings
    windows.top = await createTopWindow(isDevelopment);
    windows.top.show();
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

////////////////////////////////////////////////////////////////////////////////////
// START APP

app.on("ready", () => {
   
    
    
    log.log("App ready, bootstrapping...");


    // ✅ Only create the splash window after Electron is ready
    windows.splash = createSplashWindow(isDevelopment);

    windows.splash.once("closed", () => {
        log.log("Splash screen closed. Loading main app...");

        log.log("Starting ticker collection...");
        collectTickers(); // ✅ Start ticker collection

        windows.docker = createWindow("docker", () => createDockerWindow(isDevelopment));
        windows.settings = createWindow("settings", () => createSettingsWindow(isDevelopment));
        windows.top = createWindow("top", () => createTopWindow(isDevelopment));
        windows.news = createWindow("news", () => createNewsWindow(isDevelopment));

        Object.values(windows).forEach((window) => window?.hide());
        windows.docker.show();

        // 🟢 Sync settings across windows
        Object.values(windows).forEach((window) => {
            if (window?.webContents) {
                window.webContents.send("settings-updated", appSettings);
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
