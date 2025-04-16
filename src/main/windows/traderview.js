const { BrowserWindow } = require("electron");
const path = require("path");
const { getWindowState, setWindowBounds, saveWindowState } = require("../utils/windowState");

function updateWindowVisibilityState(key, isOpen) {
    const state = getWindowState(key);
    if (!state) return;

    state.isOpen = isOpen;
    saveWindowState(key, state);
}

function createTradingViewWindow(symbol = "AAPL", index = 0, isDevelopment) {
    const key = `traderviewWindow_${index}`;
    const state = getWindowState(key);

    const win = new BrowserWindow({
        width: state.width || 850,
        height: state.height || 660,
        x: state.x,
        y: state.y,
        frame: true,
        resizable: true,
        backgroundColor: "#00000000",
        webPreferences: {
            preload: path.join(__dirname, "../renderer/preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.loadURL(`https://www.tradingview.com/chart/?symbol=${symbol}`);

    win.on("move", () => setWindowBounds(key, win.getBounds()));
    win.on("resize", () => setWindowBounds(key, win.getBounds()));
    win.on("show", () => updateWindowVisibilityState(key, true));
    win.on("hide", () => updateWindowVisibilityState(key, false));
    win.on("close", () => updateWindowVisibilityState(key, false));

    updateWindowVisibilityState(key, true); // Set visible on creation

    // if (isDevelopment) win.webContents.openDevTools({ mode: "detach" });

    return win;
}

module.exports = {
    createTradingViewWindow,
};
