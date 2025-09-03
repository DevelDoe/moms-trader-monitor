
const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");
const { setupWindowBoundsSaving } = require("./windowBoundsHelper");

function createTraderWidgetViewWindow(isDevelopment) {
    const state = getWindowState("traderviewWidgetWindow");

    const window = new BrowserWindow({
        width: state.width || 850,
        height: state.height || 660,
        x: state.x,
        y: state.y,
        frame: false,
        alwaysOnTop: false,
        resizable: true,
        transparent: false,
        hasShadow: false,
        roundedCorners: false,
        backgroundColor: "#00000000",
        useContentSize: true,
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/traderview/traderview-widget.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    // Setup optimized bounds saving
    setupWindowBoundsSaving(window, "traderviewWindow");
    

    return window;
}

module.exports = { createTraderWidgetViewWindow };