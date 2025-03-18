// ./src/main/windows/daily.js

const { BrowserWindow } = require("electron");
const path = require("path");

function createSessionWindow(isDevelopment) {
    const window = new BrowserWindow({
        width: 300,
        height: 140,
        frame: false,
        alwaysOnTop: false,
        transparent: false,
        resizable: true,
        hasShadow: false, // Disables window shadow
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true, // Required for contextBridge
            enableRemoteModule: false, // Keep this disabled unless necessary
            nodeIntegration: false, // Should be false for security
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/session/session.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    return window; // ✅ Return the window instance
}

module.exports = { createSessionWindow };
