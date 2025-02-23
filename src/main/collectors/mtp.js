const { BrowserWindow } = require("electron");
const WebSocket = require("ws");
const createLogger = require("../../hlps/logger");
const log = createLogger(__filename);

const connectMTP = () => {
    // Create a WebSocket connection to the server
    const ws = new WebSocket("ws://127.0.0.1:9090");

    // Handle WebSocket connection open
    ws.on("open", () => {
        log.log("Connected to WebSocket server.");
    });

    // Handle incoming messages
    ws.on("message", (data) => {
        log.log(`Received message: ${data}`);
    });

    // Handle connection close
    ws.on("close", () => {
        log.log("WebSocket connection closed.");
    });

    // Handle any errors
    ws.on("error", (err) => {
        log.error(`WebSocket error: ${err.message}`);
    });
};

// Function to fetch symbol data from the API using vanilla JavaScript's fetch
const getSymbolOverview = async (symbol) => {
    try {
        const response = await fetch(`http://127.0.0.1:8080/overview/${symbol}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });

        // Log response status
        console.log(`Response Status: ${response.status}`);

        if (!response.ok) {
            log.error(`Error fetching data for symbol ${symbol}: ${response.statusText}`);
            return null;
        }

        // const rawText = await response.text();
        // console.log(`Raw response text: ${rawText}`);

        // Now try parsing it
        const data = JSON.parse(rawText);
        log.log(`Fetched data for symbol ${symbol}:`, data);
        return data;
    } catch (error) {
        log.error(`Error fetching data for symbol ${symbol}: ${error.message}`);
    }
};

// Example usage: Fetching symbol overview for 'ROVR'
getSymbolOverview("ROVR")
    .then((data) => {
        if (data) {
            log.log("Symbol Overview:", data);
        } else {
            log.warn("No data found for the symbol.");
        }
    })
    .catch((err) => {
        log.error("Error:", err);
    });

connectMTP();

module.exports = { connectMTP, getSymbolOverview };
