// ./src/main/windows/focus.js

const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../electronStores");

function createScrollHodWindow(isDevelopment) {
    const state = getWindowState("scrollHodWindow");

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
            backgroundThrottling: false,
            autoplayPolicy: "no-user-gesture-required", // best-effort; supported in newer Electron
        },
    });

    // Set window name for broadcast utility
    window.windowName = "scrollHod";

    window.loadFile(path.join(__dirname, "../../renderer/scrolls/hod.html"));

// window.webContents.once("did-finish-load", () => {
//     if (!window.__hodReloadedOnce) {
//         window.__hodReloadedOnce = true; // guard against loops
//         setTimeout(() => {
//             // small delay so first paint commits
//             window.webContents.reloadIgnoringCache(); // or: window.reload()
//         }, 200);
//     }
// });

    if (isDevelopment) {
        window.webContents.once("did-finish-load", () => {
            window.webContents.openDevTools({ mode: "detach" });
        });
    }

    window.on("move", () => {
        const bounds = window.getBounds();
        setWindowBounds("scrollHodWindow", bounds);
    });

    window.on("resize", () => {
        const bounds = window.getBounds();
        setWindowBounds("scrollHodWindow", bounds);
    });

    return window;
}

module.exports = { createScrollHodWindow };
