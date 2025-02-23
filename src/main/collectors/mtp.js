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
// connectMTP();

// Function to fetch symbol data from the API using vanilla JavaScript's fetch
const getSymbolOverview = async (symbol) => {
    try {
        log.log(`Sending GET request for symbol overview of ${symbol}`);
        const response = await fetch(`http://127.0.0.1:8080/overview/${symbol}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });
        log.log(`Response Status: ${response.status}`);

        if (!response.ok) {
            log.error(`Error fetching data for symbol ${symbol}: ${response.statusText}`);
            return null;
        }

        const rawText = await response.text();
        log.log(`Raw response received with length ${rawText.length} characters`);

        // Try parsing the JSON response
        const data = JSON.parse(rawText);
        if (Array.isArray(data)) {
            log.log(`Received an array with ${data.length} objects`);
        } else if (typeof data === "object" && data !== null) {
            const keys = Object.keys(data);
            log.log(`Received an object with ${keys.length} properties`);
        } else {
            log.log("Received data is not an object or array");
        }

        log.log(`Fetched data for symbol ${symbol}:`, data);
        return data;
    } catch (error) {
        log.error(`Error fetching data for symbol ${symbol}: ${error.message}`);
        return null;
    }
};

// Example usage: Fetching symbol overview for 'ROVR'
getSymbolOverview("GERN")
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

// Since socket logic is not required for now, we remove it.

module.exports = { getSymbolOverview };
