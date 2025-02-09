// ./src/hlps/logger.js

const verbose = process.argv.includes("-v"); // Check for '-v' flag for verbose logging

/**
 * Helper function to log verbose messages
 * @param {string} message
 */
function verboseLog(message) {
    if (verbose) {
        console.log(`[VERBOSE]: ${message}`);
    }
}

/**
 * General logger function
 * @param {string} message
 */
function log(message) {
    console.log(`[INFO]: ${message}`);
}

/**
 * Error logger function
 * @param {Error} error
 */
function logError(error) {
    console.error(`[ERROR]: ${error.message || error}`);
}

/**
 * Success logger function
 * @param {string} message
 */
function logSuccess(message) {
    console.log(`[SUCCESS]: ${message}`);
}

/**
 * Splash logger function
 * @param {string} message
 */
function splash(message) {
    console.log(`[INFO]: ${message}`);
}

module.exports = { verboseLog, log, logError, logSuccess, splash };
