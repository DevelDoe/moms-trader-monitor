// ./src/main/windows/infobar.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");
const { setupWindowBoundsSaving } = require("./windowBoundsHelper");

function createInfobarWindow(isDevelopment) {
    const state = getWindowState("infobarWindow");

    const window = new BrowserWindow({
        width: state.width || 465,
        height: state.height || 63,
        x: state.x,
        y: state.y,
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
    });

    window.loadFile(path.join(__dirname, "../../renderer/infobar/infobar.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    // Setup optimized bounds saving
    setupWindowBoundsSaving(window, "infobarWindow");

    return window; // ✅ Return the window instance
}

module.exports = { createInfobarWindow };
