const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../electronStores");
const { setupWindowBoundsSaving } = require("./windowBoundsHelper");
const log = require("../../hlps/logger")(__filename);

function createActiveWindow(isDevelopment) {
    const state = getWindowState("activeWindow");
    log.log("📋 Creating activeWindow with state:", state);

    const window = new BrowserWindow({
        width: state.width || 850,
        height: state.height || 660,
        x: state.x || 100,
        y: state.y || 100,
        alwaysOnTop: false,
        resizable: true,
        roundedCorners: false,
        backgroundColor: "#00000000",
        useContentSize: true,
        frame: false, // no OS frame
        transparent: true, // fully transparent background
        hasShadow: false, // Electron hint to remove shadow
        skipTaskbar: true,
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
        },
        show: false, // Don't show until fully initialized
    });

    // Load the window content
    window.loadFile(path.join(__dirname, "../../renderer/active/active.html"));

    // Track initialization state
    let isWindowReady = false;
    let pendingTicker = global.sharedState?.activeTicker || null;

    window.webContents.once("did-finish-load", () => {
        log.log("✅ activeWindow finished loading");

        // Notify main process that window is ready
        ipcMain.emit("active-window-ready");

        // Send any pending ticker immediately
        if (pendingTicker) {
            window.webContents.send("update-active-ticker", pendingTicker);
            log.log(`📨 Sent buffered activeTicker: ${pendingTicker}`);
            pendingTicker = null;
        }

        isWindowReady = true;
        window.show(); // Now show the window
        
        // Only reposition if this is a new window creation (no stored position)
        // Don't force reposition on every load - let user's current position persist
        if (!state.x || !state.y) {
            // This is a new window, use default positioning
            const currentBounds = window.getBounds();
            log.log(`📍 New activeWindow created at:`, { x: currentBounds.x, y: currentBounds.y });
            setWindowBounds("activeWindow", currentBounds);
        } else {
            // Window has stored position, but don't force reposition - let it stay where user placed it
            log.log(`📍 activeWindow loaded with stored position:`, { x: state.x, y: state.y }, `but keeping current position`);
        }
    });

    // Handle ticker updates from main process
    ipcMain.on("set-active-ticker", (event, ticker) => {
        if (!isWindowReady) {
            pendingTicker = ticker;
            return;
        }

        if (!window.isDestroyed()) {
            window.webContents.send("update-active-ticker", ticker);
        }
    });

    if (isDevelopment) {
        window.webContents.openDevTools({ mode: "detach" });
    }

    // Setup optimized bounds saving
    setupWindowBoundsSaving(window, "activeWindow");

    window.on("close", () => {
        // Clean up listeners
        ipcMain.removeAllListeners("set-active-ticker");
    });

    return window;
}

module.exports = { createActiveWindow };
