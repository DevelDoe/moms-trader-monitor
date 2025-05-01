const fs = require("fs");
const path = require("path");
const os = require("os");

const isDevelopment = process.env.NODE_ENV === "development";
const isDebug = process.env.DEBUG === "true";
const isDataLogging = process.env.DATA === "false"; // ✅ Enable detailed logging when DATA=true

// ✅ Log file path
const logFilePath = path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "Moms-Trader-Monitor", "logs", "app.log");

// ✅ Ensure log directory exists
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// ✅ List of scripts to allow logging from
const ALLOWED_LOGGING_FROM = new Set(["mtp.js"]); // Add scripts here

/**
 * Writes log messages to a file in production mode.
 * @param {string} level - Log level (INFO, WARN, ERROR, DATA)
 * @param {string} fileName - Source file name
 * @param {any[]} args - Log message arguments
 */
function writeToFile(level, fileName, args) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] [${fileName}] ${args.join(" ")}\n`;

    fs.appendFileSync(logFilePath, logMessage);
}

// --- Bounce logging globals ---
const bounceLoggingEnabled = process.env.BOUNCE === "true";
// Bounce interval in milliseconds (default to 1000 ms, but override via env if desired)
const BOUNCE_INTERVAL = Number(process.env.BOUNCE_INTERVAL) || 600000;
// Global cache to store the last timestamp a particular log message was output
const lastLogTimestamps = new Map();

/**
 * Custom logger that logs to console in dev, and to a file in production.
 * Allows logs from scripts listed in `ALLOWED_LOGGING_FROM`, suppresses logs from others.
 * Also provides a bounce() method to throttle repetitive log messages.
 * @param {string} modulePath - The __filename from the calling module.
 * @returns {object} log, warn, error, data, bounce functions
 */
function createLogger(modulePath) {
    const fileName = path.basename(modulePath);

    // Create the basic logger object.
    const logger = {
        log: (...args) => {
            if (ALLOWED_LOGGING_FROM.size > 0 && !ALLOWED_LOGGING_FROM.has(fileName)) return;
            if (isDevelopment || isDebug) {
                console.log(`[${fileName}]`, ...args);
            } else {
                writeToFile("INFO", fileName, args);
            }
        },
        warn: (...args) => {
            if (ALLOWED_LOGGING_FROM.size > 0 && !ALLOWED_LOGGING_FROM.has(fileName)) return;
            if (isDevelopment || isDebug) {
                console.warn(`[${fileName}]`, ...args);
            } else {
                writeToFile("WARN", fileName, args);
            }
        },
        error: (...args) => {
            if (ALLOWED_LOGGING_FROM.size > 0 && !ALLOWED_LOGGING_FROM.has(fileName)) return;
            if (isDevelopment || isDebug) {
                console.error(`[${fileName}]`, ...args);
            } else {
                writeToFile("ERROR", fileName, args);
            }
        },
        data: (...args) => {
            if (!isDataLogging) return;
            if (ALLOWED_LOGGING_FROM.size > 0 && !ALLOWED_LOGGING_FROM.has(fileName)) return;
            if (isDevelopment || isDebug) {
                console.log(`[${fileName}] [DATA]`, ...args);
            } else {
                writeToFile("DATA", fileName, args);
            }
        },
    };

    /**
     * Bounce logging: prevents duplicate messages from being logged in quick succession.
     * The key is built from the fileName, log level, and the message content.
     * If the same message is attempted within BOUNCE_INTERVAL ms, it is skipped.
     *
     * @param {string} level - One of "INFO", "WARN", "ERROR", "DATA"
     * @param {...any} args - The log message arguments
     */
    logger.bounce = (level, ...args) => {
        if (!bounceLoggingEnabled) {
            if (level === "INFO") return logger.log(...args);
            if (level === "WARN") return logger.warn(...args);
            if (level === "ERROR") return logger.error(...args);
            if (level === "DATA") return logger.data(...args);
            return;
        }

        const now = Date.now();
        let key;

        if (level === "DATA" && args.length >= 2) {
            // For "DATA" logs, use only the second argument (message) as the key
            key = `${fileName}:${level}:${args[1]}`;
        } else {
            // For other log levels, use the full message
            key = `${fileName}:${level}:${args.join(" ")}`;
        }

        // If the message has been logged before and is within the bounce interval, suppress it
        if (lastLogTimestamps.has(key) && now - lastLogTimestamps.get(key) < BOUNCE_INTERVAL) {
            return; // Ignore duplicate logs
        }

        // Store the timestamp for future duplicate suppression
        lastLogTimestamps.set(key, now);

        // Log the message normally
        if (level === "INFO") {
            logger.log(...args);
        } else if (level === "WARN") {
            logger.warn(...args);
        } else if (level === "ERROR") {
            logger.error(...args);
        } else if (level === "DATA") {
            logger.data(...args);
        }
    };

    return logger;
}

module.exports = createLogger;
