// ./src/utils/safeSend.js

function safeSend(win, channel, payload) {
    try {
        if (!win || win.isDestroyed()) return;

        const wc = win.webContents;
        if (!wc || wc.isDestroyed() || wc.isCrashed?.()) return;

        console.log(`[safeSend] Sending "${channel}" to window "${win.windowName || 'unnamed'}"`, {
            payloadType: typeof payload,
            isArray: Array.isArray(payload),
            payloadKeys: Array.isArray(payload) ? Object.keys(payload[0] || {}) : Object.keys(payload || {}),
            sampleData: Array.isArray(payload) ? payload[0] : payload
        });

        wc.send(channel, payload);
    } catch (err) {
        console.warn(`[safeSend] Failed to send "${channel}":`, err.message);
    }
}

module.exports = { safeSend };
