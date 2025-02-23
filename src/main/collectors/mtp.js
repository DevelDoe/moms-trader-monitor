const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);

const connectMTP = () => {
    // Create a WebSocket connection to the server
    const ws = new WebSocket("ws://localhost:9090"); // Replace with your actual WebSocket URL

    // Handle WebSocket connection open
    ws.on("open", () => {
        log.log("Connected to WebSocket server.");
    });

    
};

function getMtpOverview(ticker) {
    const store = require("../store");

    store.addMtpOverviwe(newsArray);
}

module.exports = { connectMTP };
