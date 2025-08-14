// ./src/main/main.js 🚀❌🛑⏳🟢💾📡⚠️✅🌐🛠️🔄📩🧹📡📊🔧📢🚨
////////////////////////////////////////////////////////////////////////////////////
// INIT
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);

process.on("uncaughtException", (err) => {
    log.error("❌ Uncaught Exception:", err.message);
    log.error(err.stack);

    if (isUpdating) return; // 🚫 Prevent relaunch if an update is installing

    log.warn("Attempting graceful app restart in 5 seconds...");
    setTimeout(() => {
        app.relaunch({ args: process.argv.slice(1).concat(["--scheduled-restart"]) });
        app.exit(1);
    }, 5000);
});

process.on("unhandledRejection", (reason) => {
    log.error("❌ Unhandled Promise Rejection:", reason);

    if (isUpdating) return;

    log.warn("Attempting graceful app restart in 5 seconds...");
    setTimeout(() => {
        app.relaunch({ args: process.argv.slice(1).concat(["--scheduled-restart"]) });
        app.exit(1);
    }, 5000);
});

const isDevelopment = process.env.NODE_ENV === "development";
const DEBUG = process.env.DEBUG === "true";
const forceUpdate = process.env.forceUpdate === "true";
let isUpdating = false;

////////////////////////////////////////////////////////////////////////////////////
// PACKAGES
log.log("Init app");

const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// 🔒 Encrypted password storage
const PASSWORD_FILE = path.join(app.getPath("userData"), "password.json");

// Simple static key + IV for fast local crypto (not secure for high-sensitivity apps)
const algorithm = "aes-256-cbc";
const secretKey = crypto.createHash("sha256").update("arcane-magic-key").digest();
const iv = Buffer.alloc(16, 0);

function encrypt(text) {
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
}

function decrypt(encryptedText) {
    const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

// 🧠 Set unique userData path for dev builds to avoid cache conflict
if (process.env.NODE_ENV === "development") {
    const devPath = path.join(app.getPath("appData"), "Moms_Trader_Monitor_Dev");
    app.setPath("userData", devPath);
    app.setName("Moms Trader Monitor Dev");
    log.log(`[main.js] Running in dev mode with userData path: ${devPath}`);
}
const { connectBridge, sendActiveSymbol } = require("../bridge");
const { autoUpdater } = require("electron-updater");
const tickerStore = require("./store");
const { safeSend } = require("./utils/safeSend");
const { broadcast } = require("./utils/broadcast");
const windowManager = require("./windowManager");

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

const { DateTime } = require("luxon");

////////////////////////////////////////////////////////////////////////////////////
// SERVICES

const { connectMTP, fetchSymbolsFromServer, flushMessageQueue, startMockAlerts } = require("./collectors/mtp");
const { startMockNews } = require("./collectors/news");
const { chronos } = require("./collectors/chronos");

////////////////////////////////////////////////////////////////////////////////////
// DATA

const { loadSettings, saveSettings, logVolumeSnapshot } = require("./settings");

appSettings = loadSettings();

const buffManager = require("./data/buffsManager");

////////////////////////////////////////////////////////////////////////////////////// WINDOWS

const { createWindow, destroyWindow, restoreWindows, registerTradingViewWindow, destroyTradingViewWindows, updateTradingViewWindows, getWindow } = require("./windowManager");

const { getWindowState, saveWindowState } = require("./utils/windowState");

const { createSplashWindow } = require("./windows/splash");
const { createDockerWindow } = require("./windows/docker");
const { createSettingsWindow } = require("./windows/settings");

const { createEventsWindow } = require("./windows/events");
const { createFrontlineWindow } = require("./windows/frontline");
const { createHeroesWindow } = require("./windows/heroes");

const { createActiveWindow } = require("./windows/active");

const { createScrollXpWindow } = require("./windows/scrollXp");
const { createScrollStatsWindow } = require("./windows/scrollStats");

const { createInfobarWindow } = require("./windows/infobar");

const { createProgressWindow } = require("./windows/progress");
const { createWizardWindow } = require("./windows/wizard");

const { createNewsWindow } = require("./windows/news");

let windows = {};

////////////////////////////////////////////////////////////////////////////////////// START APP

const isScheduledRestart = process.argv.includes("--scheduled-restart");
const { spawn } = require("child_process");

let mtpProcess;
function launchMtpCollector() {
    const binaryPath = path.join(__dirname, "collectors", "mtp_collector.exe");

    mtpProcess = spawn(binaryPath, [], {
        detached: false, // make it controllable
        stdio: isDevelopment ? "inherit" : "ignore",
    });

    if (isDevelopment) log.log("🚀 MTP collector launched");
}

let authInfo = null;

async function fetchSymbolsOnce() {
    try {
        const count = await fetchSymbolsFromServer();
        log.log(`✅ Fetched ${count} symbols.`);
        return count;
    } catch (err) {
        log.error("❌ Failed to fetch symbols:", err);
        throw err;
    }
}

app.on("ready", async () => {
    log.log("App ready, bootstrapping...");

    // ✅ Create splash window only
    windows.splash = createSplashWindow(isDevelopment);

    // ✅ Do NOT fetch symbols here — handled in ipcMain.once("splash-ready")

    // ✅ Set scannerVolume to 0 before creating windows
    try {
        log.log("Loading settings...");
        let settings = loadSettings();

        if (!settings.scanner) settings.scanner = {};
        settings.scanner.scannerVolume = 0; // ✅ Ensure volume starts muted
        saveSettings(settings); // ✅ Persist the settings before windows load

        log.log("Scanner volume initialized to 0 (muted)");
    } catch (error) {
        log.error("Failed to initialize scanner volume:", error);
    }

    // ✅ Check for scheduled restart and close splash immediately
    // if (process.argv.includes("--scheduled-restart") && windows.splash) {
    //     log.log("Scheduled restart detected, closing splash screen...");
    //     windows.splash.close();
    // }

    windows.splash.once("closed", async () => {
        log.log("Splash screen closed. Waiting for auth...");

        // Wait for authInfo to arrive before continuing
        let waited = 0;
        while (!authInfo || !authInfo.token || !authInfo.userId) {
            await new Promise((r) => setTimeout(r, 200));
            waited += 200;
            if (waited === 5000) {
                log.warn("[main] ⏳ Still waiting for auth info after 5s...");
            }
            if (waited > 20000) {
                log.error("[main] ❌ No auth received after 20s. Exiting.");
                isQuitting = true;
                app.quit();
                return;
            }
        }

        windows.docker = createWindow("docker", () => createDockerWindow(isDevelopment));

        restoreWindows();

        chronos(authInfo);
        // connectMTP();
        // require("./collectors/pipeMTP");
        // launchMtpCollector();
        flushMessageQueue();

        if (!isDevelopment) connectBridge();

        if (windows.docker) {
            windows.docker.show();
        }

        const settings = loadSettings(); // load once, reuse

        Object.values(windows).forEach((win) => {
            function encrypt(text) {
                const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
                let encrypted = cipher.update(text, "utf8", "hex");
                encrypted += cipher.final("hex");
                return encrypted;
            }

            function decrypt(encryptedText) {
                const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
                let decrypted = decipher.update(encryptedText, "hex", "utf8");
                decrypted += decipher.final("utf8");
                return decrypted;
            }

            safeSend(win, "settings-updated", settings);
        });

        if (isDevelopment) {
            // startMockAlerts();
            // startMockNews();
            const store = require("./store");
            store.addEvent({
                hero: "TEST",
                price: 4.2,
                one_min_volume: 100,
                hp: 1.25, // dp:0
                dp: 0,
                xp: Math.round(4.2 * 1.25 * 5000), // worker would send this
                // lane/hue/strength optional here
            });
        }
    });

    scheduleDailyRestart(3, 0); // defaults to 00:00 AM
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

app.on("window-all-closed", () => {
    if (!isQuitting && process.platform !== "darwin") {
        log.warn("[main] ⚠️ Prevented quit — waiting for login or relaunch...");
        return; // ⛔ prevent auto quit
    }
    app.quit(); // ✅ only quit when explicitly triggered
});

app.on("before-quit", () => {
    if (mtpProcess && !mtpProcess.killed) {
        mtpProcess.kill();
        console.log("🛑 MTP collector terminated on app quit");
    }
});

process.on("exit", () => {
    log.log("Saving settings before exit...");
    // saveSettings(appSettings);
});

function scheduleDailyRestart(targetHour = 0, targetMinute = 0) {
    // Current time in Eastern Time
    const etNow = DateTime.now().setZone("America/New_York");

    // Set next restart time in ET
    let next = etNow.set({ hour: targetHour, minute: targetMinute, second: 0, millisecond: 0 });

    // If the target time has already passed today, schedule for tomorrow
    if (next <= etNow) {
        next = next.plus({ days: 1 });
    }

    // Calculate time until restart in milliseconds
    const timeUntilRestart = next.diff(etNow).as("milliseconds");

    // Convert next restart time to local time for logging
    const localNext = next.toLocal();

    log.log(`🕒 Scheduled app restart at ET ${targetHour}:${targetMinute.toString().padStart(2, "0")} → local ${localNext.toFormat("HH:mm:ss")} (${Math.round(timeUntilRestart / 1000)}s from now)`);

    setTimeout(() => {
        log.log("🔄 Restarting app due to daily ET schedule");
        // Relaunch with --scheduled-restart flag
        app.relaunch({ args: process.argv.slice(1).concat(["--scheduled-restart"]) });
        app.exit(0);
    }, timeUntilRestart);
}

////////////////////////////////////////////////////////////////////////////////////// UPDATES

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
        isUpdating = true;

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

////////////////////////////////////////////////////////////////////////////////////// IPC COMM

let isQuitting = false;
const errorLogPath = path.join(app.getPath("userData"), "renderer-errors.log");

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
    windowManager.setQuitting(true);
});

ipcMain.on("renderer-error", (_event, message) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    fs.appendFile(errorLogPath, logEntry, (err) => {
        if (err) console.error("Failed to write error log:", err);
    });
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

// Auth
ipcMain.on("set-auth-info", (event, info) => {
    log.log("[auth] Raw info from splash:", info); // 🕵️ add this
    authInfo = info;
    log.log(`[auth] ✅ Received auth info: ${info?.userId}`);
});

ipcMain.handle("login", async (_event, { email, password }) => {
    const log = require("../hlps/logger")(__filename);

    try {
        const response = await fetch("https://scribe.arcanemonitor.com/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Invalid credentials");

        return { success: true, user: data };
    } catch (err) {
        log.error("❌ Login failed:", err.message);
        return { success: false, error: err.message };
    }
});

// Splash
ipcMain.on("close-splash", () => {
    if (windows.splash) {
        log.log("Closing Splash Screen");
        windows.splash.close();
        delete windows.splash;
    }
});

ipcMain.once("splash-ready", async () => {
    log.log("✅ Splash renderer is ready, starting symbol fetch...");

    let symbolCount = 0;
    try {
        symbolCount = await fetchSymbolsOnce();
    } catch (error) {
        log.error("❌ Failed to fetch symbols after 5 attempts:", error);
        if (windows.splash?.webContents) {
            windows.splash.webContents.send("symbols-fetched", 0);
        }
        setTimeout(() => app.quit(), 3000);
        return;
    }

    if (windows.splash?.webContents) {
        windows.splash.webContents.send("symbols-fetched", symbolCount);
    }
});

ipcMain.handle("credentials:get", () => {
    try {
        if (fs.existsSync(PASSWORD_FILE)) {
            const data = JSON.parse(fs.readFileSync(PASSWORD_FILE, "utf8"));
            return {
                email: data.email,
                password: decrypt(data.password),
            };
        }
    } catch (err) {
        console.error("❌ Failed to read or decrypt password.json:", err);
    }
    return null;
});

ipcMain.handle("credentials:save", (_event, { email, password }) => {
    try {
        const encrypted = encrypt(password);
        const data = { email, password: encrypted };
        fs.writeFileSync(PASSWORD_FILE, JSON.stringify(data), "utf8");
    } catch (err) {
        console.error("❌ Failed to write encrypted password.json:", err);
    }
});

// Shared data
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

// Settings
ipcMain.on("toggle-settings", () => {
    const settings = windowManager.windows.settings;

    if (settings && !settings.isDestroyed()) {
        log.log("[toggle-settings] Destroying settings window");
        destroyWindow("settings"); // Destroy the window
    } else {
        log.log("[toggle-settings] Creating settings window");
        windows.settings = createWindow("settings", () => createSettingsWindow(isDevelopment));
        windows.settings.show();
    }
});

ipcMain.handle("get-settings", () => {
    // log.log("Returning settings"); 
    return appSettings;
});

ipcMain.on("update-settings", (event, newSettings) => {
    const now = Date.now();

    log.log("Updating Settings...");

    // ✅ Ensure `appSettings` exists
    if (!appSettings || typeof appSettings !== "object") {
        appSettings = { ...DEFAULT_SETTINGS };
    }

    log.log(appSettings);

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

tickerStore.on("xp-reset", () => {
    log.log("📢 Broadcasting xp-reset to all windows");
    broadcast("xp-reset");
});

// Store
ipcMain.handle("get-all-symbols", () => {
    return tickerStore.getAllSymbols();
});

ipcMain.handle("get-symbol", (event, symbol) => {
    return tickerStore.getSymbol(symbol);
});

ipcMain.handle("get-tickers", (event, listType = "session") => {
    return tickerStore.getAllSymbols();
});

ipcMain.handle("get-news", (event, ticker) => {
    return tickerStore.getTickerNews(ticker);
});

ipcMain.handle("get-all-news", () => {
    return tickerStore.getAllNews();
});

tickerStore.on("newsUpdated", (update) => {
    const { ticker, newsItems } = update;

    if (!Array.isArray(newsItems) || newsItems.length === 0) {
        log.warn(`❌ No news to broadcast for ticker: ${ticker}`);
        return; // Prevents unnecessary events
    }

    // log.log(`Broadcasting ${newsItems.length} new articles`);

    broadcast("news-updated", { newsItems });
});

tickerStore.on("lists-update", () => {
    // log.log("Broadcasting store update");
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

tickerStore.on("hero-updated", (payload = []) => {
    const heroes = Array.isArray(payload) ? payload : [payload];
    const ids = heroes.map((h) => h.hero).join(", ");
    // log.log(`📢 Broadcasting hero update for: ${ids}`);

    broadcast("hero-updated", { heroes }); // 👈 clean consistent naming
});

tickerStore.on("store-nuke", () => {
    log.log("💣 Nuke triggered by store");
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("store:nuke");
    });

    // Give a brief moment for any cleanup/UI alerts, then restart
    setTimeout(() => {
        app.relaunch();
        app.exit(0);
    }, 100); // Was 300 — now 1000ms to let main init settle
});

ipcMain.on("admin-nuke", () => {
    log.log("💣 Nuke state requested by renderer");

    tickerStore.nuke(); // << Trigger internal state reset
});

ipcMain.handle("store:tracked:get", () => tickerStore.getTrackedTickers());
ipcMain.handle("store:tracked:set", (_evt, list, maxLen = 25) => tickerStore.setTrackedTickers(list, maxLen));

// forward store events to renderers
tickerStore.on("tracked-update", (list) => {
    broadcast("store:tracked:update", list);
});

// Events
ipcMain.on("activate-events", () => {
    try {
        const win = createWindow("scanner", () => createEventsWindow(isDevelopment));
        if (win) win.show();
        const settings = loadSettings();
        settings.scanner.scannerVolume = 1;
        saveSettings(settings);
    } catch (err) {
        log.error("Failed to activate events window:", err.message);
    }
});

ipcMain.on("deactivate-events", () => {
    destroyWindow("scanner");
    const settings = loadSettings();
    settings.scanner.scannerVolume = 0;
    saveSettings(settings);
});

// ipcMain.on("toggle-scanner", () => {
//     const scanner = windowManager.windows.scanner;

//     if (scanner && !scanner.isDestroyed()) {
//         log.log("[toggle-scanner] Destroying scanner window");
//         destroyWindow("scanner"); // Destroy the window
//     } else {
//         log.log("[toggle-scanner] Creating scanner window");
//         windows.scanner = createWindow("scanner", () => createEventsWindow(isDevelopment));
//         windows.scanner.show();
//     }
// });

// Frontline
ipcMain.on("activate-frontline", () => {
    try {
        const win = createWindow("frontline", () => createFrontlineWindow(isDevelopment));
        if (win) win.show();
    } catch (err) {
        log.error("Failed to frontline window:", err.message);
    }
    // // Step 1: Create or show the frontline window
    // const frontlineWindow = createWindow("frontline", () => createFrontlineWindow(isDevelopment));
    // if (frontlineWindow) frontlineWindow.show();

    // // Step 2: Destroy any existing active window
    // destroyWindow("active");

    // // Step 3: Recreate active window (ensure clean state)
    // const newActiveWindow = createWindow("active", () => createActiveWindow(isDevelopment));
    // if (newActiveWindow) newActiveWindow.show();
});

ipcMain.on("deactivate-frontline", () => {
    destroyWindow("frontline");
});

ipcMain.on("update-xp", (event, { symbol, xp, level }) => {
    tickerStore.updateXp(symbol, xp, level);
});

// Heroes
ipcMain.on("activate-heroes", () => {
    try {
        const win = createWindow("heroes", () => createHeroesWindow(isDevelopment));
        if (win) win.show();
    } catch (err) {
        log.error("Failed to heroes window:", err.message);
    }
});

ipcMain.on("deactivate-heroes", () => {
    destroyWindow("heroes");
});

ipcMain.on("recreate-heroes", async () => {
    log.log("recreate heroes window.");

    if (windows.heroes) {
        windows.heroes.close(); // Close the existing window
    }

    // ✅ Recreate the window with updated settings
    windows.heroes = await createHeroesWindow(isDevelopment); // Recreate the window
    windows.heroes.show(); // Show the newly created window
});

// active
ipcMain.on("activate-active", () => {
    try {
        const win = createWindow("active", () => createActiveWindow(isDevelopment));
        if (win) win.show();
    } catch (err) {
        log.error("Failed to activate events window:", err.message);
    }
});

ipcMain.on("deactivate-active", () => {
    destroyWindow("active");
});

let activeWindowReady = false;
let pendingActiveSymbol = null;

ipcMain.on("set-active-ticker", (event, ticker) => {
    ticker = typeof ticker === "string" ? ticker.trim().toUpperCase() : String(ticker).toUpperCase();

    // Update global state
    global.sharedState = global.sharedState || {};
    global.sharedState.activeTicker = ticker;

    // Case 1: Active window exists & is ready → Send immediately
    if (windows.active && !windows.active.isDestroyed() && activeWindowReady) {
        safeSend(windows.active, "update-active-ticker", ticker);
        log.log(`✅ Active ticker updated (live): ${ticker}`);
    }
    // Case 2: Window is being restored → Buffer until ready
    else if (windows.active && !activeWindowReady) {
        pendingActiveSymbol = ticker;
        log.log(`⏳ Buffering ticker (window loading): ${ticker}`);
    }
    // Case 3: No active window → Store in global state
    else {
        pendingActiveSymbol = ticker;
        log.log(`📦 Storing ticker (no window): ${ticker}`);
    }

    // Send to MTT (or other systems)
    sendActiveSymbol(ticker);
});

ipcMain.on("active-window-ready", () => {
    activeWindowReady = true;
    if (pendingActiveSymbol) {
        safeSend(getWindow("active"), "update-active-ticker", pendingActiveSymbol);
        pendingActiveSymbol = null;
    }
});

// Scroll Xp
ipcMain.on("activate-scrollXp", () => {
    try {
        const win = createWindow("scrollXp", () => createScrollXpWindow(isDevelopment));
        if (win) win.show();
    } catch (err) {
        log.error("Failed to activate events window:", err.message);
    }
});

ipcMain.on("deactivate-scrollXp", () => {
    destroyWindow("scrollXp");
});

// Scroll Stats
ipcMain.on("activate-scrollStats", () => {
    try {
        const win = createWindow("scrollStats", () => createScrollStatsWindow(isDevelopment));
        if (win) win.show();
    } catch (err) {
        log.error("Failed to activate scrollStats window:", err.message);
    }
});

ipcMain.on("deactivate-scrollStats", () => {
    destroyWindow("scrollStats");
});

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
        log.error("publish-tracked-tickers failed:", err);
    }
});

module.exports = {
    getWindowState,
    saveWindowState,
};

// infobar
ipcMain.on("activate-infobar", () => {
    try {
        const win = createWindow("infobar", () => createInfobarWindow(isDevelopment));
        if (win) win.show();
    } catch (err) {
        log.error("Failed to activate infobar window:", err.message);
    }
});

ipcMain.on("deactivate-infobar", () => {
    destroyWindow("infobar");
});

ipcMain.on("refresh-infobar", () => {
    if (windows.infobar && windows.infobar.webContents) {
        windows.infobar.webContents.send("trigger-window-refresh");
    }
});

// Traderview
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
        log.log("[Traderview] EnableHeroes toggled but no top tickers available yet.");
        return;
    }

    ipcMain.emit("set-top-tickers", event, global.currentTopTickers);
});

function applyTopTickers(newTickers) {
    const settings = loadSettings();
    const enableHeroes = settings.traderview?.enableHeroes ?? false;
    const autoClose = settings.traderview?.autoClose ?? true;

    global.currentTopTickers = [...newTickers];

    if (!enableHeroes) return;

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
            registerTradingViewWindow(symbol, isDevelopment);
        }
    });

    global.traderviewWindowsVisible = true;
}

// Progress
ipcMain.on("activate-progress", () => {
    try {
        const win = createWindow("progress", () => createProgressWindow(isDevelopment));
        if (win) win.show();
    } catch (err) {
        log.error("Failed to activate events window:", err.message);
    }
});

ipcMain.on("deactivate-progress", () => {
    destroyWindow("progress");
});

ipcMain.on("log-volume", (event, { timestamp, volume }) => {
    logVolumeSnapshot(timestamp, volume);
});

// Wizard
ipcMain.on("activate-wizard", () => {
    try {
        const win = createWindow("wizard", () => createWizardWindow(isDevelopment));
        if (win) win.show();
    } catch (err) {
        log.error("Failed to activate events window:", err.message);
    }
});

ipcMain.on("deactivate-wizard", () => {
    destroyWindow("wizard");
});

// News
ipcMain.on("activate-news", () => {
    try {
        const win = createWindow("news", () => createNewsWindow(isDevelopment));
        if (win) win.show();
    } catch (err) {
        log.error("Failed to activate news window:", err.message);
    }
});

ipcMain.on("deactivate-news", () => {
    destroyWindow("news");
});
