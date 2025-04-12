const { BrowserWindow } = require("electron");
const { getWindowState, saveWindowState } = require("./utils/windowState");
const { loadSettings } = require("./settings");
const log = require("../hlps/logger")(__filename);
const { safeSend} = require("./utils/safeSend");



const { createSettingsWindow } = require("./windows/settings");
const { createLiveWindow } = require("./windows/live");
const { createFocusWindow } = require("./windows/focus");
const { createDailyWindow } = require("./windows/daily");
const { createActiveWindow } = require("./windows/active");
const { createScannerWindow } = require("./windows/scanner");
const { createInfobarWindow } = require("./windows/infobar");

const isDevelopment = process.env.NODE_ENV === "development";

const windows = {};

let quitting = false;

function setQuitting(val) {
    quitting = val;
}

function createWindow(name, createFn) {
    let win = windows[name];
    if (!win || win.isDestroyed()) {
        // If window doesn't exist or is destroyed, create a new one
        win = createFn();
        windows[name] = win;

        win.on("closed", () => {
            cleanupWindow(name, win);
        });
    }
    
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
        log.log(`[WindowManager] Manually destroyed window: ${name}`);
    }
}

function getWindow(name) {
    return windows[name] || null;
}

// This function will be responsible for restoring windows on app startup
function restoreWindows() {
    const settings = loadSettings(); 
    
    const windowKeyMap = {
        settings: "settingsWindow",
        live: "liveWindow",
        focus: "focusWindow",
        daily: "dailyWindow",
        active: "activeWindow",
        scanner: "scannerWindow",
        infobar: "infobarWindow",
        docker: "dockerWindow",
        traderview: "traderviewWindow",
    };

    // Loop through all window states and restore if isOpen is true
    Object.entries(windowKeyMap).forEach(([name, stateKey]) => {
        const windowState = getWindowState(stateKey);
        if (windowState?.isOpen) {
            console.log(`Restoring window: ${name}`);
            windows[name] = createWindow(name, () => createWindowByName(name)); // Create the window
            windows[name].show(); // Make it visible if it was open
        }
    });

    // Show the docker window explicitly
    if (windows.docker) {
        windows.docker.show();
    }

    // Load the settings once, and send them to all windows

    Object.values(windows).forEach((win) => {
        safeSend(win, "settings-updated", settings);
    });
}

// Function to create windows dynamically based on the window name
function createWindowByName(name) {
    switch (name) {
        case "settings":
            return createSettingsWindow(isDevelopment);
        case "live":
            return createLiveWindow(isDevelopment, buffs);
        case "focus":
            return createFocusWindow(isDevelopment, buffs);
        case "daily":
            return createDailyWindow(isDevelopment);
        case "active":
            return createActiveWindow(isDevelopment);
        case "scanner":
            return createScannerWindow(isDevelopment);
        case "infobar":
            return createInfobarWindow(isDevelopment);
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
