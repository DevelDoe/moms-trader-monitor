// ./src/utils/windowState.js

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const isDevelopment = process.env.NODE_ENV === "development";
const SETTINGS_FILE = isDevelopment
  ? path.join(__dirname, "../../data/settings.dev.json")
  : path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
        console.log(`Settings file does not exist at ${SETTINGS_FILE}. Returning empty settings.`);
        return {};
    }
    try {
        const content = fs.readFileSync(SETTINGS_FILE, "utf8");
        const settings = JSON.parse(content);
        console.log(`Loaded settings from ${SETTINGS_FILE}:`, settings);
        return settings;
    } catch (err) {
        console.error(`Failed to load settings from ${SETTINGS_FILE}`, err);
        return {};
    }
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        console.log(`Settings saved successfully to ${SETTINGS_FILE}.`);
    } catch (err) {
        console.error(`Failed to save settings to ${SETTINGS_FILE}`, err);
    }
}

function getWindowState(name) {
    const settings = loadSettings();
    const state = settings.windows?.[name] || {};
    console.log(`Retrieved window state for "${name}":`, state);
    return state;
}

function saveWindowState(name, bounds, isOpen) {
    const settings = loadSettings();
    if (!settings.windows) {
        settings.windows = {};
    }
    console.log(`Saving window state for "${name}" with bounds:`, bounds, `and isOpen: ${isOpen}`);
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
    console.log(`setWindowBounds called for key "${stateKey}" with bounds:`, bounds);
    saveWindowState(stateKey, {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        // isOpen is not modified here.
    });
}

module.exports = {
    getWindowState,
    saveWindowState,
    setWindowBounds
};
