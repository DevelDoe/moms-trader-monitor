// ./src/hlps/broadcast.js
const { safeSend } = require("./safeSend");
const { BrowserWindow } = require("electron");

function broadcast(channel, data) {
  BrowserWindow.getAllWindows().forEach((win) => {
    const name = win.windowName || "unnamed";

    if (!win || win.isDestroyed()) {
      console.warn(`[Broadcast] Skipping destroyed window: ${name}`);
      return;
    }

    safeSend(win, channel, data);
  });
}

module.exports = { broadcast };
