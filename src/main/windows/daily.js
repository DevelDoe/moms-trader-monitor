// ./src/main/windows/Daily.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");

function createDailyWindow(isDevelopment) {
    const state = getWindowState("DailyWindow");

    const window = new BrowserWindow({
        width: state.width || 850,
        height: state.height || 660,
        x: state.x,
        y: state.y,
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
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/Daily/Daily.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    window.on("move", () => {
        const bounds = window.getBounds();
        setWindowBounds("DailyWindow", bounds);
    });
    
    window.on("resize", () => {
        const bounds = window.getBounds();
        setWindowBounds("DailyWindow", bounds);
    });

    return window; // ✅ Return the window instance
}

module.exports = { createDailyWindow };
