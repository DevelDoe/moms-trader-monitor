// ./src/main/windows/news.js

const { BrowserWindow } = require("electron");
const path = require("path");

function createNewsWindow(isDevelopment) {
    const window = new BrowserWindow({
        width: 60,
        height: 100,
        frame: false,
        alwaysOnTop: true,
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

    window.loadFile(path.join(__dirname, "../../renderer/news/news.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    return window; // ✅ Return the window instance
}

module.exports = { createNewsWindow };
