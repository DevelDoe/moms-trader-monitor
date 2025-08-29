const { ipcMain, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { safeSend } = require("../utils/safeSend");
const { getWindow, destroyWindow } = require("../windowManager");
const { loadSettings, saveSettings } = require("../settings");

let isQuitting = false;
const errorLogPath = path.join(app.getPath("userData"), "renderer-errors.log");

function setupGeneralHandlers() {
    // General app control
    ipcMain.on("exit-app", () => {
        console.log("Exiting the app...");
        isQuitting = true;
        app.quit();
    });

    ipcMain.on("restart-app", () => {
        console.log("Restarting the app...");
        isQuitting = true;
        app.relaunch();
        app.exit(0);
    });

    app.on("before-quit", () => {
        isQuitting = true;
    });

    // Error logging
    ipcMain.on("renderer-error", (_event, message) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\n`;
        fs.appendFile(errorLogPath, logEntry, (err) => {
            if (err) console.error("Failed to write error log:", err);
        });
    });

    // Window management
    ipcMain.on("resize-window-to-content", (event, { width, height }) => {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        if (senderWindow) {
            senderWindow.setBounds({
                x: senderWindow.getBounds().x,
                y: senderWindow.getBounds().y,
                width: Math.max(width, 1),
                height: Math.max(height, 1),
            });
        }
    });

    // Settings management
    ipcMain.on("toggle-settings", () => {
        const settings = getWindow("settings");
        if (settings && !settings.isDestroyed()) {
            console.log("[toggle-settings] Destroying settings window");
            destroyWindow("settings");
        } else {
            console.log("[toggle-settings] Creating settings window");
            // This will be handled by the window manager
        }
    });

    ipcMain.handle("get-settings", () => {
        return loadSettings();
    });

    ipcMain.on("update-settings", (event, newSettings) => {
        console.log("Updating Settings...");
        
        const currentSettings = loadSettings();
        
        // Merge all new settings dynamically
        Object.keys(newSettings).forEach((key) => {
            if (typeof newSettings[key] === "object") {
                currentSettings[key] = {
                    ...currentSettings[key], // Preserve existing settings
                    ...newSettings[key], // Merge new properties
                };
            } else {
                console.warn(`Ignoring invalid setting update for key: ${key} (Expected an object)`);
            }
        });

        saveSettings(currentSettings);

        // Broadcast updated settings to all windows
        console.log("Broadcasting 'settings-updated' event...");
        BrowserWindow.getAllWindows().forEach((win) => {
            safeSend(win, "settings-updated", currentSettings);
        });
    });
}

module.exports = { setupGeneralHandlers };
