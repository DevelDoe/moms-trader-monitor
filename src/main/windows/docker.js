// ./src/main/windows/docker.js

const { BrowserWindow } = require("electron");
const path = require("path");


function createDockerWindow(isDevelopment) {
    const window = new BrowserWindow({
        width: 500,
        height: 80,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: true,
        hasShadow: false, // Disables window shadow
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/docker/docker.html"));

    // if (isDevelopment) {
    //     window.webContents.openDevTools({ mode: "detach" });
    // }
    return window; // ✅ Return the window instance
}

module.exports = { createDockerWindow };

