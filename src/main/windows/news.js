// ./src/main/windows/news.js

const { BrowserWindow } = require("electron");
const path = require("path");

function createTopWindow(isDevelopment) {
    const window = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        alwaysOnTop: false,
        transparent: true,
        resizable: true,
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

module.exports = { createTopWindow };
