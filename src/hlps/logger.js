const fs = require("fs");
const path = require("path");
const os = require("os");

const isDevelopment = process.env.NODE_ENV === "development";
const isDebug = process.env.DEBUG === "true";

// ✅ Log file path
const logFilePath = path.join(
    process.env.APPDATA || path.join(os.homedir(), ".config"),
    "Moms-Trader-Monitor",
    "logs",
    "app.log"
);

// ✅ Ensure log directory exists
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// ✅ List of scripts to suppress logging from
const SUPPRESS_LOGGING_FROM = new Set(["tickers.js", "main.js", "store.js", "news.js"]); // Modify as needed

/**
 * Writes log messages to a file in production mode.
 * @param {string} level - Log level (INFO, WARN, ERROR)
 * @param {string} fileName - Source file name
 * @param {any[]} args - Log message arguments
 */
function writeToFile(level, fileName, args) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] [${fileName}] ${args.join(" ")}\n`;

    fs.appendFileSync(logFilePath, logMessage);
}

/**
 * Custom logger that logs to console in dev, and to a file in production.
 * Suppresses logs from scripts listed in `SUPPRESS_LOGGING_FROM`.
 * @param {string} modulePath - The __filename from the calling module.
 * @returns {object} log, warn, error functions
 */
function createLogger(modulePath) {
    const fileName = path.basename(modulePath);

    return {
        log: (...args) => {
            if (SUPPRESS_LOGGING_FROM.has(fileName)) return; // ✅ Suppress logging
            if (isDevelopment || isDebug) {
                console.log(`[${fileName}]`, ...args);
            } else {
                writeToFile("INFO", fileName, args);
            }
        },
        warn: (...args) => {
            if (SUPPRESS_LOGGING_FROM.has(fileName)) return; // ✅ Suppress logging
            if (isDevelopment || isDebug) {
                console.warn(`[${fileName}]`, ...args);
            } else {
                writeToFile("WARN", fileName, args);
            }
        },
        error: (...args) => {
            if (SUPPRESS_LOGGING_FROM.has(fileName)) return; // ✅ Suppress logging
            if (isDevelopment || isDebug) {
                console.error(`[${fileName}]`, ...args);
            } else {
                writeToFile("ERROR", fileName, args);
            }
        }
    };
}

module.exports = createLogger;
