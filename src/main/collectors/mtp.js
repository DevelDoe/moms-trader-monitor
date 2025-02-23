const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const { fetch } = require("undici");
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

// Function to fetch symbol data from the API using undici's fetch
const getSymbolOverview = async (symbol) => {
    try {
        const response = await fetch(`http://localhost:8080/overview/${symbol}`);
        
        if (!response.ok) {
            log.error(`Error fetching data for symbol ${symbol}: ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        log.log(`Fetched data for symbol ${symbol}:`, data);
        return data;
    } catch (error) {
        log.error(`Error fetching data for symbol ${symbol}: ${error.message}`);
    }
};

connectMTP();

module.exports = { connectMTP, getSymbolOverview };
