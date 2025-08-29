const { ipcMain } = require("electron");
const { createWindow, destroyWindow } = require("../windowManager");
const { loadSettings, saveSettings } = require("../settings");

function setupWindowHandlers(windows, isDevelopment) {
    // Import window creators
    const { createEventsWindow } = require("../windows/events");
    const { createFrontlineWindow } = require("../windows/frontline");
    const { createHeroesWindow } = require("../windows/heroes");
    const { createActiveWindow } = require("../windows/active");
    const { createScrollXpWindow } = require("../windows/scrollXp");
    const { createScrollStatsWindow } = require("../windows/scrollStats");
    const { createScrollHodWindow } = require("../windows/scrollHOD");
    const { createInfobarWindow } = require("../windows/infobar");
    const { createProgressWindow } = require("../windows/progress");
    const { createWizardWindow } = require("../windows/wizard");
    const { createNewsWindow } = require("../windows/news");

    // Events window
    ipcMain.on("activate-events", () => {
        try {
            const win = createWindow("scanner", () => createEventsWindow(isDevelopment));
            if (win) win.show();
            const settings = loadSettings();
            settings.scanner.scannerVolume = 1;
            saveSettings(settings);
        } catch (err) {
            console.error("Failed to activate events window:", err.message);
        }
    });

    ipcMain.on("deactivate-events", () => {
        destroyWindow("scanner");
        const settings = loadSettings();
        settings.scanner.scannerVolume = 0;
        saveSettings(settings);
    });

    // Frontline window
    ipcMain.on("activate-frontline", () => {
        try {
            const win = createWindow("frontline", () => createFrontlineWindow(isDevelopment));
            if (win) win.show();
        } catch (err) {
            console.error("Failed to frontline window:", err.message);
        }
    });

    ipcMain.on("deactivate-frontline", () => {
        destroyWindow("frontline");
    });

    ipcMain.on("update-xp", (event, { symbol, xp, level }) => {
        // This would need access to tickerStore, so we'll handle it in the main file
        // or pass it as a parameter
    });

    // Heroes window
    ipcMain.on("activate-heroes", () => {
        try {
            const win = createWindow("heroes", () => createHeroesWindow(isDevelopment));
            if (win) win.show();
        } catch (err) {
            console.error("Failed to heroes window:", err.message);
        }
    });

    ipcMain.on("deactivate-heroes", () => {
        destroyWindow("heroes");
    });

    ipcMain.on("recreate-heroes", async () => {
        console.log("recreate heroes window.");

        if (windows.heroes) {
            windows.heroes.close(); // Close the existing window
        }

        // ✅ Recreate the window with updated settings
        windows.heroes = await createHeroesWindow(isDevelopment); // Recreate the window
        windows.heroes.show(); // Show the newly created window
    });

    // Active window
    ipcMain.on("activate-active", () => {
        try {
            const win = createWindow("active", () => createActiveWindow(isDevelopment));
            if (win) win.show();
        } catch (err) {
            console.error("Failed to activate events window:", err.message);
        }
    });

    ipcMain.on("deactivate-active", () => {
        destroyWindow("active");
    });

    // Scroll windows
    ipcMain.on("activate-scrollXp", () => {
        try {
            const win = createWindow("scrollXp", () => createScrollXpWindow(isDevelopment));
            if (win) win.show();
        } catch (err) {
            console.error("Failed to activate events window:", err.message);
        }
    });

    ipcMain.on("deactivate-scrollXp", () => {
        destroyWindow("scrollXp");
    });

    ipcMain.on("activate-scrollStats", () => {
        try {
            const win = createWindow("scrollStats", () => createScrollStatsWindow(isDevelopment));
            if (win) win.show();
        } catch (err) {
            console.error("Failed to activate scrollStats window:", err.message);
        }
    });

    ipcMain.on("deactivate-scrollStats", () => {
        destroyWindow("scrollStats");
    });

    ipcMain.on("activate-scrollHod", () => {
        try {
            const win = createWindow("scrollHod", () => createScrollHodWindow(isDevelopment));
            if (win) win.show();
        } catch (err) {
            console.error("Failed to activate scrollHod window:", err.message);
        }
    });

    ipcMain.on("deactivate-scrollHod", () => {
        destroyWindow("scrollHod");
    });

    // Infobar window
    ipcMain.on("activate-infobar", () => {
        try {
            const win = createWindow("infobar", () => createInfobarWindow(isDevelopment));
            if (win) win.show();
        } catch (err) {
            console.error("Failed to activate infobar window:", err.message);
        }
    });

    ipcMain.on("deactivate-infobar", () => {
        destroyWindow("infobar");
    });

    ipcMain.on("refresh-infobar", () => {
        if (windows.infobar && windows.infobar.webContents) {
            windows.infobar.webContents.send("trigger-window-refresh");
        }
    });

    // Progress window
    ipcMain.on("activate-progress", () => {
        try {
            const win = createWindow("progress", () => createProgressWindow(isDevelopment));
            if (win) win.show();
        } catch (err) {
            console.error("Failed to activate events window:", err.message);
        }
    });

    ipcMain.on("deactivate-progress", () => {
        destroyWindow("progress");
    });

    // Wizard window
    ipcMain.on("activate-wizard", () => {
        try {
            const win = createWindow("wizard", () => createWizardWindow(isDevelopment));
            if (win) win.show();
        } catch (err) {
            console.error("Failed to activate events window:", err.message);
        }
    });

    ipcMain.on("deactivate-wizard", () => {
        destroyWindow("wizard");
    });

    // News window
    ipcMain.on("activate-news", () => {
        try {
            const win = createWindow("news", () => createNewsWindow(isDevelopment));
            if (win) win.show();
        } catch (err) {
            console.error("Failed to activate news window:", err.message);
        }
    });

    ipcMain.on("deactivate-news", () => {
        destroyWindow("news");
    });
}

module.exports = { setupWindowHandlers };
