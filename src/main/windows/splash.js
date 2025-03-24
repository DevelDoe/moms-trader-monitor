// ./src/main/windows/splash.js

const { BrowserWindow } = require("electron");
const path = require("path");


function createSplashWindow(isDevelopment) {
    const window = new BrowserWindow({
        width: 1080,
        height: 470,
        frame: false, 
        alwaysOnTop: true, 
        transparent: false, 
        resizable: true,
        show: false,
        hasShadow: false, // Disables window shadow
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/splash/splash.html"));

    window.show(); // ✅ Ensure splash screen is visible

    // if (isDevelopment) {
    //     window.webContents.openDevTools({ mode: "detach" });
    // }

    return window; // ✅ Return the window instance
}

module.exports = { createSplashWindow };
