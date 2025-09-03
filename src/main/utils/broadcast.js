// ./src/hlps/broadcast.js
const { safeSend } = require("./safeSend");
const { BrowserWindow } = require("electron");

function broadcast(channel, data) {
    const allWindows = BrowserWindow.getAllWindows();
    
    allWindows.forEach((win) => {
        if (!win || win.isDestroyed()) {
            return;
        }
        safeSend(win, channel, data);
    });
}

module.exports = { broadcast };
