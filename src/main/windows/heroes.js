// ./src/main/windows/heroes.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../electronStores");
const { setupWindowBoundsSaving } = require("./windowBoundsHelper");

function createHeroesWindow(isDevelopment) {
    const state = getWindowState("heroesWindow");

    const window = new BrowserWindow({
        width: state.width || 850,
        height: state.height || 660,
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

    // Set window name for broadcast utility
    window.windowName = "heroes";

    window.loadFile(path.join(__dirname, "../../renderer/heroes/heroes.html"));

    if (isDevelopment) {
        window.webContents.once("did-finish-load", () => {
            window.webContents.openDevTools({ mode: "detach" });
        });
    }

    // Setup optimized bounds saving
    setupWindowBoundsSaving(window, "heroesWindow");

    return window;
}

module.exports = { createHeroesWindow };
