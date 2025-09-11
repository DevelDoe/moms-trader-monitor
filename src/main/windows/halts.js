// ./src/main/windows/halts.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");
const { setupWindowBoundsSaving } = require("./windowBoundsHelper");

function createHaltsWindow(isDevelopment) {
    const KEY = "haltsWindow";
    const state = getWindowState(KEY) || {};

    const window = new BrowserWindow({
        // ✅ restore both size and position
        width:  state.width  || 850,
        height: state.height || 660,
        x:      state.x,                // <- add
        y:      state.y,                // <- add
        frame: false,
        alwaysOnTop: false,
        resizable: true,
        roundedCorners: false,
        backgroundColor: "#00000000",
        useContentSize: true,
        frame: false, // no OS frame
        transparent: true, // fully transparent background
        hasShadow: false, // Electron hint to remove shadow
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/halts/halts.html"));

    if (isDevelopment) {
        window.webContents.once("did-finish-load", () => {
            window.webContents.openDevTools({ mode: "detach" });
        });
    }

    // ✅ save to the same key
    const save = () => setWindowBounds(KEY, window.getBounds());
    // Setup optimized bounds saving
    setupWindowBoundsSaving(window, "haltsWindow");

    return window;
}

module.exports = { createHaltsWindow };
