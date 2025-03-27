// ./src/main/windows/top.js

const { BrowserWindow } = require("electron");
const path = require("path");

function createScannerWindow(isDevelopment) {
    const window = new BrowserWindow({
        width: 273,
        height: 660,
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

    window.loadFile(path.join(__dirname, "../../renderer/scanner/scanner.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    // // Set opacity to 90%
    // window.setOpacity(0.9);

    return window; // ✅ Return the window instance
}

module.exports = { createScannerWindow };
