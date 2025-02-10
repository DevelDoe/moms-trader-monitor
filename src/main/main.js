// ./src/main/main.js 🚀❌🛑⏳🟢💾📡⚠️✅🌐🛠️🔄📩🧹📡📊🔧
////////////////////////////////////////////////////////////////////////////////////
// INIT
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const isDevelopment = process.env.NODE_ENV === "development";

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
log.log("init windows");

const { createSplashWindow } = require("./windows/splash");
const { createDockerWindow } = require("./windows/docker");
const { createSettingsWindow } = require("./windows/settings");
const { createTopWindow } = require("./windows/top");

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
log.log("init data");

// Use system settings file for production, separate file for development
const SETTINGS_FILE = isDevelopment ? path.join(__dirname, "../config/settings.dev.json") : path.join(app.getPath("userData"), "settings.json");

const FIRST_RUN_FILE = path.join(app.getPath("userData"), "first-run.lock"); // used to determine if this is a fresh new install

// 🛠️ **Function to check if it's a fresh install**
function isFirstInstall() {
    return !fs.existsSync(SETTINGS_FILE) && !fs.existsSync(FIRST_RUN_FILE);
}

// Default settings for fresh installs
const DEFAULT_SETTINGS = {
    top: {
        transparent: false,
        minPrice: 0,
        maxPrice: 100
    },
};

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

// Function to load settings from a file
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

        // ✅ Ensure missing settings are filled with defaults
        return { 
            ...DEFAULT_SETTINGS, 
            ...parsedSettings 
        };

    } catch (err) {
        log.error("❌ Error loading settings, resetting to defaults.", err);
        return { ...DEFAULT_SETTINGS }; // Prevents crashes
    }
}


let appSettings = loadSettings(); // Load app settings from file

function saveSettings() {
    if (!appSettings) appSettings = { ...DEFAULT_SETTINGS };

    log.log("💾 Saving settings file...", appSettings);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2));
}

////////////////////////////////////////////////////////////////////////////////////
// IPC COMM
log.log("init ipc");

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
    log.log("Received newSettings before merging:", newSettings);

    // ✅ Ensure `appSettings` exists
    if (!appSettings || typeof appSettings !== "object") {
        appSettings = { ...DEFAULT_SETTINGS };
    }

    // ✅ List of allowed top-level setting categories
    const allowedCategories = ["top", "general", "audio"];

    // ✅ Merge new settings ONLY into valid categories
    Object.keys(newSettings).forEach((key) => {
        if (allowedCategories.includes(key) && typeof newSettings[key] === "object") {
            appSettings[key] = {
                ...appSettings[key], // Preserve existing settings for this category
                ...newSettings[key], // Merge only the provided properties
            };
        } else {
            log.warn(`Ignoring invalid setting update: ${key}`);
        }
    });

    log.log("✅ Merged appSettings (cleaned):", appSettings);
    saveSettings();
});




// Store
ipcMain.handle("get-tickers", (event, listType = "daily") => {
    return tickerStore.getAllTickers(listType); // Fetch based on the requested type
});

tickerStore.on("update", () => {
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("tickers-updated");
    });
});

ipcMain.on("clear-session", () => {
    tickerStore.clearSessionData(); // ✅ Clears session data in the store
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("session-cleared"); // ✅ Notify renderer
    });
});

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
ipcMain.on("apply-filters", (event, { min, max }) => {
    log.log(`📊 Applying filters: Min=${min}, Max=${max}`);

    // ✅ Notify renderer process
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("filter-updated");
    });
});

////////////////////////////////////////////////////////////////////////////////////
// START APP
log.log("init application");

app.on("ready", () => {
    log.log("App ready, bootstrapping...");

    // ✅ Only create the splash window after Electron is ready
    windows.splash = createSplashWindow(isDevelopment);

    log.log("Calling ticker collector");
    collectTickers(); // ✅ Start scraper here (before splash closes)

    windows.splash.once("closed", () => {
        log.log("Splash screen closed. Loading main app...");

        windows.docker = createWindow("docker", () => createDockerWindow(isDevelopment));
        windows.settings = createWindow("settings", () => createSettingsWindow(isDevelopment));
        windows.top = createWindow("top", () => createTopWindow(isDevelopment));

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
log.log("init data");

if (!isDevelopment) {
    log.log("Production mode detected, checking for updates...");
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on("checking-for-update", () => {
        log.log("Checking for update...");
    });

    autoUpdater.on("update-available", (info) => {
        log.log(`🔔 Update found: ${info.version}`);

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
    });
} else {
    log.log("Skipping auto-updates in development mode");
}
