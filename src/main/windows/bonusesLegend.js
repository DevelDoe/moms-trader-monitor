// ./src/main/windows/bonusesLegend.js

const { BrowserWindow } = require("electron");
const path = require("path");

function createBonusesLegendWindow(isDevelopment) {
    const window = new BrowserWindow({
        width: 850,
        height: 660,
        hasShadow: false,
        frame: false,
        alwaysOnTop: false,
        transparent: false,
        resizable: true, 
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true, // Required for contextBridge
            enableRemoteModule: false, // Keep this disabled unless necessary
            nodeIntegration: false, // Should be false for security
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/legends/bonuses.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    return window; // ✅ Return the window instance
}

module.exports = { createBonusesLegendWindow };
