// ./src/main/windowManager.js
const createLogger = require("../hlps/logger");
const { getWindowState, saveWindowState } = require("./utils/windowState");
const log = createLogger(__filename);

const windows = {};

let quitting = false;

function setQuitting(val) {
    quitting = val;
}

function createOrRestoreWindow(name, createFn) {
    let win = getWindow(name);
    if (!win || win.isDestroyed()) {
        win = createFn();
        windows[name] = win;

        win.on("closed", () => {
            if (!quitting && windows[name] && !win.isDestroyed()) {
                try {
                    const bounds = win.getBounds();
                    saveWindowState(`${name}Window`, bounds, false);
                } catch (err) {
                    log.warn(`[WindowManager] Failed to save bounds for ${name}:`, err);
                }
            }
        
            delete windows[name];
            log.log(`[WindowManager] Removed reference to closed window: ${name}`);
        });
    }
    return win;
}

function destroyWindow(name, isQuitting = false) {
    const win = windows[name];
    if (win) {
        if (!isQuitting && win.getBounds) {
            const bounds = win.getBounds();
            saveWindowState(`${name}Window`, bounds, false);
        }

        win.destroy();
        delete windows[name];
        log.log(`[WindowManager] Manually destroyed and removed window: ${name}`);
    }
}

function getWindow(name) {
    return windows[name] || null;
}

module.exports = {
    createOrRestoreWindow,
    destroyWindow,
    getWindow,
    setQuitting,
};
