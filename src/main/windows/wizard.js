// ./src/main/windows/wizard.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");

function createWizardWindow(isDevelopment) {
    const state = getWindowState("wizardWindow");

    const window = new BrowserWindow({
        width: state.width || 1440,
        height: state.height || 300,
        x: state.x,
        y: state.y,
        frame: false,
        alwaysOnTop: true,
        resizable: true,
        transparent: false,
        hasShadow: false,
        roundedCorners: false,
        backgroundColor: "#00000000",
        transparent: true,
        useContentSize: true,
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
        },
    });

    window.loadFile(path.join(__dirname, "../../renderer/wizard/wizard.html"));

    if (isDevelopment) {
        window.webContents.once("did-finish-load", () => {
            window.webContents.openDevTools({ mode: "detach" });
        });
    }
    
    window.on("move", () => {
        const bounds = window.getBounds();
        setWindowBounds("wizardWindow", bounds);
    });

    window.on("resize", () => {
        const bounds = window.getBounds();
        setWindowBounds("wizardWindow", bounds);
    });

    return window;
}

module.exports = { createWizardWindow };

