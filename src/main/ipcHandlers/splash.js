const { ipcMain } = require("electron");
const log = require("../../hlps/logger")(__filename);

function setupSplashHandlers(windows) {
    // Splash screen control
    ipcMain.on("close-splash", () => {
        if (windows.splash) {
            log.log("Closing Splash Screen");
            windows.splash.close();
            delete windows.splash;
        }
    });

    ipcMain.once("splash-ready", async () => {
        log.log("✅ Splash renderer is ready, starting symbol fetch...");

        let symbolCount = 0;
        try {
            // Import the function dynamically to avoid circular dependencies
            const { hydrateAndApplySymbols } = require("../collectors/arcane_api");
            symbolCount = await hydrateAndApplySymbols();
            log.log(`✅ Fetched ${symbolCount} symbols.`);
        } catch (error) {
            log.error("❌ Failed to fetch symbols after 5 attempts:", error);
            if (windows.splash?.webContents) {
                windows.splash.webContents.send("symbols-fetched", 0);
            }
            setTimeout(() => require("electron").app.quit(), 3000);
            return;
        }

        if (windows.splash?.webContents) {
            windows.splash.webContents.send("symbols-fetched", symbolCount);
        }
    });
}

module.exports = { setupSplashHandlers };
