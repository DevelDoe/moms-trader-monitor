// ./src/bridge/index.js
const createLogger = require("../hlps/logger");
const log = createLogger(__filename);
const net = require("net");

let socket = null;
let reconnectTimeout = null;
const RETRY_INTERVAL = 3000; // Retry every 3 seconds

function connectBridge() {
    socket = net.createConnection({ port: 7878 }, () => {
        log.log("[bridge] ✅ Connected to MTT");
    });

    socket.on("error", (err) => {
        log.error("[bridge] ❌ Connection error:", err.message);
    });

    socket.on("close", () => {
        log.warn("[bridge] 🔌 Disconnected from MTT");

        // Retry connection after a short delay
        if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
                reconnectTimeout = null;
                // log.log("[bridge] 🔄 Attempting to reconnect to MTT...");
                connectBridge();
            }, RETRY_INTERVAL);
        }
    });
}

function sendActiveSymbol(symbol) {
    if (socket && socket.writable && !socket.destroyed) {
        const msg = `set-active-symbol:${symbol.trim().toUpperCase()}`;
        socket.write(msg);
        // log.log("[bridge] 📡 Sent:", msg);
    } else {
        // log.warn("[bridge] ⚠️ Socket not ready. Symbol not sent.");
    }
}

module.exports = {
    connectBridge,
    sendActiveSymbol,
};
