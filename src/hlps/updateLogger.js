const fs = require("fs");
const path = require("path");
const os = require("os");

// ✅ Get log file path (inside user data directory)
const logFilePath = path.join(
    process.env.APPDATA || path.join(os.homedir(), ".config"),
    "MomsTraderMonitor",
    "update.log"
);

// ✅ Ensure log directory exists
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// ✅ Function to write logs
function updateLog(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;

    // Write log to file
    fs.appendFileSync(logFilePath, logMessage);

    // Optional: Also log to console during development
    if (process.env.NODE_ENV === "development") {
        isError ? console.error(logMessage) : console.log(logMessage);
    }
}

module.exports = updateLog;
