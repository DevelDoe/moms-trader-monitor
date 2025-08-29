const { setupGeneralHandlers } = require("./general");
const { setupAuthHandlers } = require("./auth");
const { setupSplashHandlers } = require("./splash");
const { setupStoreHandlers } = require("./store");
const { setupWindowHandlers } = require("./windows");
const { setupAudioTestHandlers } = require("./audioTest");
const { setupMiscHandlers } = require("./misc");

function setupAllIpcHandlers(windows, isDevelopment, tickerStore, buffManager) {
    // Setup all IPC handlers
    setupGeneralHandlers();
    setupAuthHandlers();
    setupSplashHandlers(windows);
    setupStoreHandlers(tickerStore);
    setupWindowHandlers(windows, isDevelopment);
    setupAudioTestHandlers();
    setupMiscHandlers(buffManager, tickerStore);
}

module.exports = { setupAllIpcHandlers };
