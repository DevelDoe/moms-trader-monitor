// ./src/main/windows/splash.js
const { BrowserWindow, screen } = require("electron");
const path = require("path");

// Image intrinsic size
const IMG_W = 2016;
const IMG_H = 1152;

// Baseline "full size" reference (4K)
const BASE_W = 3840;
const BASE_H = 2160;

function computeSplashRect(display) {
    // Use work area (excludes taskbar/dock)
    const { x, y, width: sw, height: sh } = display.workArea;

    // Scale relative to 4K
    const scale = Math.min(sw / BASE_W, sh / BASE_H);

    // Size the window to scaled image size (with a sensible minimum)
    const w = Math.max(Math.round(IMG_W * scale), 960);
    const h = Math.max(Math.round(IMG_H * scale), 540);

    // Center on that display
    const cx = Math.round(x + (sw - w) / 2);
    const cy = Math.round(y + (sh - h) / 2);

    return { x: cx, y: cy, width: w, height: h };
}

function createSplashWindow(isDevelopment) {
    // Pick the display under the cursor (or use getPrimaryDisplay())
    const display = screen.getPrimaryDisplay(screen.getCursorScreenPoint());
    const bounds = computeSplashRect(display);

    const win = new BrowserWindow({
        ...bounds,
        frame: false,
        alwaysOnTop: true,
        resizable: false, // keep it fixed; flip to true if you'd like
        show: false, // show after ready-to-show to avoid flash
        backgroundColor: "#000000", // solid bg behind your image
        useContentSize: true,
        webPreferences: {
            preload: path.join(__dirname, "../../renderer/preload.js"),
            contextIsolation: true,
            nodeIntegration: true,
        },
    });

    // Keep the splash aspect if user resizes (only if resizable: true)
    // win.setAspectRatio(IMG_W / IMG_H);

    win.loadFile(path.join(__dirname, "../../renderer/splash/splash.html"));
    win.once("ready-to-show", () => win.show());

    if (isDevelopment) {
        win.webContents.openDevTools({ mode: "detach" });
    }

    return win;
}

module.exports = { createSplashWindow };
