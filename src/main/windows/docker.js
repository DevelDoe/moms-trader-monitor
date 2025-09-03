const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds } = require("../utils/windowState");
const { debounce } = require("../utils/debounce");

function createDockerWindow(isDevelopment) {
    const state = getWindowState("dockerWindow");

    const window = new BrowserWindow({
        width: state.width || 400,
        height: state.height || 85,
        x: state.x,
        y: state.y,
        frame: false,
        movable: true,
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

    // Save window position/size on move/resize
    const saveBounds = () => {
        if (!window.isDestroyed()) {
            setWindowBounds("dockerWindow", window.getBounds());
        }
    };

    const debouncedSave = debounce(saveBounds, 300);
    window.on("move", debouncedSave);
    window.on("resize", debouncedSave);

    // Optional devtools
    // if (isDevelopment) {
    //     window.webContents.openDevTools({ mode: "detach" });
    // }

    return window;
}

module.exports = { createDockerWindow };
