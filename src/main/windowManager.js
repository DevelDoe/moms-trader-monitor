// ./src/main/windowManager.js
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);

const windows = {};

function createOrRestoreWindow(name, createFn) {
    let win = getWindow(name);
    if (!win || win.isDestroyed()) {
        win = createFn();
        windows[name] = win;

        // ✅ Add cleanup on close
        win.on("closed", () => {
            if (windows[name]) {
                delete windows[name];
                log.log(`[WindowManager] Removed reference to closed window: ${name}`);
            }
        });
    }
    return win;
}

function destroyWindow(name) {
  if (windows[name]) {
    windows[name].destroy();
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
};
