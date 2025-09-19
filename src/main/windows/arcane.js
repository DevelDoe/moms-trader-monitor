// ./src/main/windows/arcane.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../electronStores");
const { setupWindowBoundsSaving } = require("./windowBoundsHelper");

function createArcaneWindow(isDevelopment) {
    const state = getWindowState("arcaneWindow");

    const window = new BrowserWindow({
        width: state.width || 1440,
        height: 150,
        minHeight: 101,
        maxHeight: 101,
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
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
        },
    });

    // Set window name for broadcast utility
    window.windowName = "arcane";

    window.loadFile(path.join(__dirname, "../../renderer/arcane/arcane.html"));

    if (isDevelopment) {
        window.webContents.once("did-finish-load", () => {
            window.webContents.openDevTools({ mode: "detach" });
        });
    }
    
    // Setup optimized bounds saving
    setupWindowBoundsSaving(window, "arcaneWindow");

    return window;
}

module.exports = { createArcaneWindow };

