// ./src/main/main.js 🚀❌🛑⏳🟢 💾
////////////////////////////////////////////////////////////////////////////////////
// APP

const isDevelopment = process.env.NODE_ENV === "development";

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { verboseLog, log, logError, logSuccess, splash } = require("../hlps/logger"); // ✅ Correct
const { autoUpdater } = require("electron-updater");

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
const { createTopWindow } = require("./windows/top");


let windows = {};

function createWindow(name, createFn) {
    windows[name] = createFn();
    return windows[name];
}

// Collectors
const { collectTickers } = require("./collectors/tickers.js");

////////////////////////////////////////////////////////////////////////////////////
// DATA

// Use system settings file for production, separate file for development
const SETTINGS_FILE = isDevelopment ? path.join(__dirname, "../settings.dev.json") : path.join(app.getPath("userData"), "settings.json");

const FIRST_RUN_FILE = path.join(app.getPath("userData"), "first-run.lock"); // used to determine if this is a fresh new install

// 🛠️ **Function to check if it's a fresh install**
function isFirstInstall() {
    return !fs.existsSync(SETTINGS_FILE) && !fs.existsSync(FIRST_RUN_FILE);
}

// Default settings for fresh installs
const DEFAULT_SETTINGS = {
    top: [],
};

// 🛠️ **Function to initialize settings**
if (isFirstInstall()) {
    log("Fresh install detected! Creating default settings...");

    // Ensure the userData directory exists
    const settingsDir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(settingsDir)) {
        log(`Creating settings directory: ${settingsDir}`);
        fs.mkdirSync(settingsDir, { recursive: true }); // ✅ Ensure all parent folders exist
    }

    // Write default settings
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));

    // Create marker file to prevent future resets
    fs.writeFileSync(FIRST_RUN_FILE, "installed");

    log("Settings file initialized:", SETTINGS_FILE);
} else {
    log("App has been installed before. Keeping existing settings.");
}

// Function to load settings from a file
function loadSettings() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            log.warn("⚠️ Settings file not found. Using default settings.");
            return { ...DEFAULT_SETTINGS };
        }

        const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (err) {
        logError("⚠️ Error loading settings, resetting to defaults.", err);
        return { ...DEFAULT_SETTINGS }; // Prevents crashes
    }
}

let appSettings = loadSettings(); // Load app settings from file

function saveSettings() {
    if (!appSettings) appSettings = { ...DEFAULT_SETTINGS };

    // ✅ Ensure `top` is always an array
    appSettings.top = Array.isArray(appSettings.top) ? appSettings.top : [];

    log("Saving settings file...");
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2));
}

////////////////////////////////////////////////////////////////////////////////////
// UPDATES

if (!isDevelopment) {
    log("Production mode detected, checking for updates...");
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on("checking-for-update", () => {
        log("Checking for update...");
    });

    autoUpdater.on("update-available", (info) => {
        log(`🔔 Update found: ${info.version}`);

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
                        log("User confirmed download, starting...");
                        autoUpdater.downloadUpdate();
                    } else {
                        log("User postponed update.");
                    }
                });
        } else {
            // 🛠 If user hasn’t donated, update automatically
            log("User hasn't donated, auto-downloading update...");
            autoUpdater.downloadUpdate();
        }
    });

    autoUpdater.on("update-not-available", () => {
        log("No update available.");
    });

    autoUpdater.on("error", (err) => {
        logError("Update error:", err);
    });
    process.on("unhandledRejection", (reason, promise) => {
        logError("Unhandled Promise Rejection:", reason);
    });

    autoUpdater.on("download-progress", (progressObj) => {
        let logMessage = `Download speed: ${progressObj.bytesPerSecond} - `;
        logMessage += `Downloaded ${progressObj.percent}% (${progressObj.transferred} / ${progressObj.total})`;
        log(logMessage);
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
            log("User hasn't donated, installing update now...");
            autoUpdater.quitAndInstall();
        }
    });
} else {
    log("Skipping auto-updates in development mode.");
}

////////////////////////////////////////////////////////////////////////////////////
// SOCKETS

const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });

wss.on("connection", (ws) => {
    console.log("✅ WebSocket client connected");

    ws.on("message", (message) => {
        console.log("📩 Received from client:", message);
    });

    ws.on("close", () => {
        console.log("⚠️ WebSocket client disconnected");
    });
});

////////////////////////////////////////////////////////////////////////////////////
// IPC

// General

ipcMain.on("exit-app", () => {
    log("Exiting the app...");
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
        log("Closing Splash Screen");
        windows.splash.close();
        delete windows.splash; // ✅ Ensure reference is cleared
    }
});

// top
ipcMain.on("toggle-top", () => {
    if (windows.top) {
        log("Toggle Top Window");
        windows.top.isVisible() ? windows.top.hide() : windows.top.show();
    }
});

ipcMain.on("new-tickers-collected", (event, data) => {
    if (!Array.isArray(data) || data.length === 0) return; // ✅ Ignore invalid data

    try {
        const payload = JSON.stringify(data);

        // ✅ Send to WebSocket clients
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });

        // ✅ Send to renderer processes
        BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send("new-ticker-entries", data);
        });

    } catch (error) {
        logError("❌ Failed to send WebSocket message:", error);
    }
});


////////////////////////////////////////////////////////////////////////////////////
// START APP

app.on("ready", () => {
    log("App is starting...");

    // ✅ Only create the splash window after Electron is ready
    windows.splash = createSplashWindow(isDevelopment);

    log("📡 Starting scraper...");
    collectTickers();  // ✅ Start scraper here (before splash closes)

    windows.splash.once("closed", () => {
        log("Splash screen closed. Loading main app...");

        windows.docker = createWindow("docker", () => createDockerWindow(isDevelopment));

        if (!windows.docker) {
            logError("docker window could not be created.");
            return;
        }

        windows.top = createWindow("top", () => createTopWindow(isDevelopment));
        Object.values(windows).forEach((window) => window?.hide());

        windows.docker.show();
        windows.top.show();

        windows.top.webContents.once("dom-ready", () => {
            if (!Array.isArray(appSettings.top)) appSettings.top = [];
            windows.top.webContents.send("load-top-state", appSettings.top);
        });

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
    log("Saving settings before exit...");
    saveSettings();
});
