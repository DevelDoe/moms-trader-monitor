// ./src/main/windows/sessionHistory.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");
const { setupWindowBoundsSaving } = require("./windowBoundsHelper");

function createSessionHistoryWindow(isDevelopment) {
    const state = getWindowState("sessionHistoryWindow");

    const window = new BrowserWindow({
        width: state.width || 1200,
        height: state.height || 800,
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

    window.loadFile(path.join(__dirname, "../../renderer/sessionHistory/sessionHistory.html"));

    if (isDevelopment) {
        window.webContents.once("did-finish-load", () => {
            window.webContents.openDevTools({ mode: "detach" });
        });
    }

    // Setup optimized bounds saving
    setupWindowBoundsSaving(window, "sessionHistoryWindow");

    return window;
}

module.exports = { createSessionHistoryWindow };
