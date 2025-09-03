// ./src/main/windows/frontline.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../electronStores");

function createFrontlineWindow(isDevelopment) {
    const state = getWindowState("frontlineWindow");

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

    // Set window name for broadcast utility
    window.windowName = "frontline";

    window.loadFile(path.join(__dirname, "../../renderer/frontline/frontline.html"));

    if (isDevelopment) {
        window.webContents.once("did-finish-load", () => {
            window.webContents.openDevTools({ mode: "detach" });
        });
    }

    // Hybrid approach: debounced saves + backup on blur
    let boundsChanged = false;
    let saveTimeout = null;

    const scheduleSave = () => {
        boundsChanged = true;
        
        // Clear existing timeout
        if (saveTimeout) clearTimeout(saveTimeout);
        
        // Schedule save after 500ms of no changes
        saveTimeout = setTimeout(() => {
            if (boundsChanged) {
                const bounds = window.getBounds();
                setWindowBounds("frontlineWindow", bounds);
                boundsChanged = false;
            }
        }, 500);
    };

    window.on("move", scheduleSave);
    window.on("resize", scheduleSave);

    // Also save on blur as backup
    window.on("blur", () => {
        if (boundsChanged) {
            const bounds = window.getBounds();
            setWindowBounds("frontlineWindow", bounds);
            boundsChanged = false;
        }
    });

    return window;
}

module.exports = { createFrontlineWindow };
