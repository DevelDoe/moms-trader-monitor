// ./src/bridge/index.js

const net = require("net");

let socket = null;

function connectBridge() {
    socket = net.createConnection({ port: 7878 }, () => {
        console.log("[bridge] ✅ Connected to MTT");
    });

    socket.on("error", (err) => {
        console.error("[bridge] ❌ Connection error:", err.message);
    });

    socket.on("close", () => {
        console.warn("[bridge] 🔌 Disconnected from MTT");
        // Optional: Add reconnection logic later
    });
}

function sendActiveSymbol(symbol) {
    if (socket && socket.writable) {
        const msg = `set-active-symbol:${symbol.trim().toUpperCase()}`;
        socket.write(msg);
        console.log("[bridge] 📡 Sent:", msg);
    } else {
        console.warn("[bridge] ⚠️ Socket not ready. Symbol not sent.");
    }
}

module.exports = {
    connectBridge,
    sendActiveSymbol,
};
