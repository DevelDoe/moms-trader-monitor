// ./src/utils/windowState.js

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const isDevelopment = process.env.NODE_ENV === "development";
const SETTINGS_FILE = isDevelopment
  ? path.join(__dirname, "../../data/settings.dev.json")
  : path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}

function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getWindowState(name) {
    const settings = loadSettings();
    return settings.windows?.[name] || {};
}

function saveWindowState(name, bounds, isOpen) {
    const settings = loadSettings();
    if (!settings.windows) settings.windows = {};
    settings.windows[name] = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isOpen,
    };
    saveSettings(settings);
}

/**
 * Saves just the window bounds (width, height, x, y) to the settings file.
 * Called during window move or resize events.
 *
 * @param {string} stateKey - The key used in the settings file, like "dailyWindow"
 * @param {object} bounds - Object containing { width, height, x, y }
 */
function setWindowBounds(stateKey, bounds) {
    saveWindowState(stateKey, {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        // Don't touch isOpen here
    });
}


module.exports = {
    getWindowState,
    saveWindowState,
    setWindowBounds
};