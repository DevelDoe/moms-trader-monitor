// ./src/hlps/broadcast.js
const { safeSend } = require("./safeSend");
const { BrowserWindow } = require("electron");

function broadcast(channel, data) {
    const allWindows = BrowserWindow.getAllWindows();
    console.log(`[Broadcast] Broadcasting "${channel}" to ${allWindows.length} windows`, {
        dataType: typeof data,
        isArray: Array.isArray(data),
        dataKeys: Array.isArray(data) ? Object.keys(data[0] || {}) : Object.keys(data || {}),
        sampleData: Array.isArray(data) ? data[0] : data
    });
    
    allWindows.forEach((win, index) => {
        const name = win.windowName || "unnamed";
        const id = win.id || "unknown";

        if (!win || win.isDestroyed()) {
            console.warn(`[Broadcast] Skipping destroyed window ${index}: ${name} (ID: ${id})`);
            return;
        }

        console.log(`[Broadcast] Sending to window ${index}: ${name} (ID: ${id})`);
        safeSend(win, channel, data);
    });
    
    console.log(`[Broadcast] Completed broadcasting "${channel}" to ${allWindows.length} windows`);
}

module.exports = { broadcast };
