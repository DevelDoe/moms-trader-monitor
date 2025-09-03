const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");
const { setupWindowBoundsSaving } = require("./windowBoundsHelper");

function createDockerWindow(isDevelopment) {
    const state = getWindowState("dockerWindow");

    const window = new BrowserWindow({
        width: state.width || 400,
        height: state.height || 85,
        x: state.x,
        y: state.y,
        frame: false,
        movable: true,
        alwaysOnTop: true,
        resizable: true,
        transparent: true,
        hasShadow: false,
        roundedCorners: false,
        backgroundColor: "#00000000",
        useContentSize: true,
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/docker/docker.html"));

    // Setup optimized bounds saving
    setupWindowBoundsSaving(window, "dockerWindow");

    // Optional devtools
    // if (isDevelopment) {
    //     window.webContents.openDevTools({ mode: "detach" });
    // }

    return window;
}

module.exports = { createDockerWindow };
