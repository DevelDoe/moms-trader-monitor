// ./src/main/windows/settigns.js

const { BrowserWindow } = require("electron");
const path = require("path");

function createSettingsWindow(isDevelopment) {
    window = new BrowserWindow({
        width: 640,
        height: 500,
        frame: false,
        alwaysOnTop: false,
        transparent: false,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/settings/settings.html"));

    if (isDevelopment)  window.webContents.openDevTools({ mode: "detach" });

    return window; // ✅ Return the window instance
}

module.exports = { createSettingsWindow };
