// ./src/main/windows/infobar.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");

function createInfobarWindow(isDevelopment) {
    const state = getWindowState("infobarWindow");

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

    window.loadFile(path.join(__dirname, "../../renderer/infobar/infobar.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    window.on("move", () => {
        const bounds = window.getBounds();
        setWindowBounds("infobarWindow", bounds);
    });
    
    window.on("resize", () => {
        const bounds = window.getBounds();
        setWindowBounds("infobarWindow", bounds);
    });
    

    return window; // ✅ Return the window instance
}

module.exports = { createInfobarWindow };
