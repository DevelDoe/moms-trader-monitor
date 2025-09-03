// ./src/main/windows/progress.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../electronStores");

function createProgressWindow(isDevelopment) {
    const state = getWindowState("progressWindow");

    const window = new BrowserWindow({
        width: state.width || 1440,
        height: state.height || 30,
        x: state.x,
        y: state.y,
        alwaysOnTop: false,
        resizable: true,
        roundedCorners: false,
        backgroundColor: "#00000000",
        useContentSize: true,
        frame: false, // no OS frame
        transparent: true, // fully transparent background
        hasShadow: false, // Electron hint to remove shadow
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
        },
    });

    // Set window name for broadcast utility
    window.windowName = "progress";

    window.loadFile(path.join(__dirname, "../../renderer/progress/progress.html"));

    if (isDevelopment) {
        window.webContents.once("did-finish-load", () => {
            window.webContents.openDevTools({ mode: "detach" });
        });
    }
    
    window.on("move", () => {
        const bounds = window.getBounds();
        setWindowBounds("progressWindow", bounds);
    });

    window.on("resize", () => {
        const bounds = window.getBounds();
        setWindowBounds("progressWindow", bounds);
    });

    return window;
}

module.exports = { createProgressWindow };

