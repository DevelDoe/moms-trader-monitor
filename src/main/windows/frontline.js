// ./src/main/windows/frontline.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");

function createFrontlineWindow(isDevelopment, buffs) {
    const state = getWindowState("frontlineWindow");

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
            additionalArguments: [
                `--buffs=${encodeURIComponent(JSON.stringify(buffs))}`
            ]
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/frontline/frontline.html"));

    if (isDevelopment) {
        window.webContents.once("did-finish-load", () => {
            window.webContents.openDevTools({ mode: "detach" });
        });
    }
    
    window.on("move", () => {
        const bounds = window.getBounds();
        setWindowBounds("frontlineWindow", bounds);
    });

    window.on("resize", () => {
        const bounds = window.getBounds();
        setWindowBounds("frontlineWindow", bounds);
    });

    return window;
}

module.exports = { createFrontlineWindow };