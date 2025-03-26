// ./src/main/windows/infobar.js

const { BrowserWindow } = require("electron");
const path = require("path");

function createInfobarWindow(isDevelopment) {
    const window = new BrowserWindow({
        width: 720,
        height: 30,
        hasShadow: false,
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
            contextIsolation: true, // Required for contextBridge
            enableRemoteModule: false, // Keep this disabled unless necessary
            nodeIntegration: false, // Should be false for security
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/infobar/infobar.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    return window; // ✅ Return the window instance
}

module.exports = { createInfobarWindow };
