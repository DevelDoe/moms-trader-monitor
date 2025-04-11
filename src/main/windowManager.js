const { BrowserWindow } = require("electron");
const { getWindowState, saveWindowState } = require("./utils/windowState");
const log = require("../hlps/logger")(__filename);

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
        traderviewWidget: "traderviewWidgetWindow",
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
}

// Function to create windows dynamically based on the window name
function createWindowByName(name) {
    switch (name) {
        case "live":
            return createLiveWindow(isDevelopment);
        case "focus":
            return createFocusWindow(isDevelopment, buffs);
        case "settings":
            return createSettingsWindow(isDevelopment);
        // Add more cases for other windows
        default:
            throw new Error(`No creator function for window: ${name}`);
    }
}

module.exports = {
    createWindow,
    destroyWindow,
    getWindow,
    setQuitting,
    restoreWindows, // Export the restoreWindows function
};
