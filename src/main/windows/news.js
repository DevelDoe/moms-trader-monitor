// ./src/main/windows/news.js

const { BrowserWindow } = require("electron");
const path = require("path");

function createNewsWindow(isDevelopment) {
    const window = new BrowserWindow({
        width: 60,
        height: 110,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: true,
        hasShadow: false, // Disables window shadow
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true, // Required for contextBridge
            enableRemoteModule: false, // Keep this disabled unless necessary
            nodeIntegration: false, // Should be false for security
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/news/news.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    return window; // ✅ Return the window instance
}

module.exports = { createNewsWindow };
