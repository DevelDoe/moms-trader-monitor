// ./src/main/windows/docker.js

const { BrowserWindow } = require("electron");
const path = require("path");

function createDockerWindow(isDevelopment) {
    const window = new BrowserWindow({
        width: 400,
        height: 85,
        frame: false,
        alwaysOnTop: true,
        resizable: true,
        transparent: true,
        hasShadow: false,
        roundedCorners: false,
        backgroundColor: "#00000000",
        useContentSize: true,
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
