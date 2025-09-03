// ./src/main/windows/top.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");

function createEventsWindow(isDevelopment) {
    const state = getWindowState("eventsWindow"); // ✅ Fixed: use eventsWindow state

    const window = new BrowserWindow({
        width: state.width || 850,
        height: state.height || 660,
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

    window.loadFile(path.join(__dirname, "../../renderer/events/events.html"));

    if (isDevelopment) window.webContents.openDevTools({ mode: "detach" });

    window.on("move", () => {
        const bounds = window.getBounds();
        setWindowBounds("eventsWindow", bounds); // ✅ Fixed: use eventsWindow state
    });
    
    window.on("resize", () => {
        const bounds = window.getBounds();
        setWindowBounds("eventsWindow", bounds); // ✅ Fixed: use eventsWindow state
    });

    

    return window; // ✅ Return the window instance
}

module.exports = { createEventsWindow };
