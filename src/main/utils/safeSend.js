// ./src/utils/safeSend.js

function safeSend(win, channel, payload) {
    try {
        if (!win || win.isDestroyed()) return;

        const wc = win.webContents;
        if (!wc || wc.isDestroyed() || wc.isCrashed?.()) return;

        wc.send(channel, payload);
    } catch (err) {
        console.warn(`[safeSend] Failed to send "${channel}":`, err.message);
    }
}

module.exports = { safeSend };
