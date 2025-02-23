const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);

const connectMTP = () => {
    // Create a WebSocket connection to the server
    const ws = new WebSocket('ws://127.0.0.1:9090');

    // Handle WebSocket connection open
    ws.on('open', () => {
        log.log('Connected to WebSocket server.');
    });

    // Handle incoming messages
    ws.on('message', (data) => {
        log.log(`Received message: ${data}`);
    });

    // Handle connection close
    ws.on('close', () => {
        log.log('WebSocket connection closed.');
    });

    // Handle any errors
    ws.on('error', (err) => {
        log.error(`WebSocket error: ${err.message}`);
    });
};

connectMTP();

module.exports = { connectMTP };
