const path = require("path");

const isDevelopment = process.env.NODE_ENV === "development";
const isDebug = process.env.DEBUG === "true";

/**
 * Custom logger that prefixes messages with the originating filename.
 * @param {string} modulePath - The __filename from the calling module.
 * @returns {object} log, warn, error functions
 */
function createLogger(modulePath) {
    const fileName = path.basename(modulePath);

    return {
        log: (...args) => {
            if (isDevelopment || isDebug) {
                console.log(`[${fileName}]`, ...args);
            }
        },
        warn: (...args) => {
            if (isDevelopment || isDebug) {
                console.warn(`[${fileName}]`, ...args);
            }
        },
        error: (...args) => {
            if (isDevelopment || isDebug) {
                console.error(`[${fileName}]`, ...args);
            }
        }
    };
}

module.exports = createLogger;
