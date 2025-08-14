// ./src/utils/windowState.js

const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");
const log = require("../../hlps/logger")(__filename);
const { safeSend } = require("./safeSend");

const isDevelopment = process.env.NODE_ENV === "development";
const SETTINGS_FILE = isDevelopment ? path.join(__dirname, "../../data/settings.dev.json") : path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
        log.log(`Settings file does not exist at ${SETTINGS_FILE}. Returning empty settings.`);
        return {};
    }
    try {
        const content = fs.readFileSync(SETTINGS_FILE, "utf8");
        const settings = JSON.parse(content);
        // log.log(`Loaded settings from ${SETTINGS_FILE}:`, settings);
        return settings;
    } catch (err) {
        log.error(`Failed to load settings from ${SETTINGS_FILE}`, err);
        return {};
    }
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        // log.log(`Settings saved successfully to ${SETTINGS_FILE}.`);
        BrowserWindow.getAllWindows().forEach((win) => {
            safeSend(win, "settings-updated", settings);
        });
    } catch (err) {
        log.error(`Failed to save settings to ${SETTINGS_FILE}`, err);
    }
}

function getWindowState(name) {
    const settings = loadSettings();
    const state = settings.windows?.[name] || {};
    // log.log(`Retrieved window state for "${name}":`, state);
    return state;
}

function saveWindowState(name, bounds, isOpen) {
    const settings = loadSettings();
    if (!settings.windows) {
        settings.windows = {};
    }
    // log.log(`Saving window state for "${name}" with bounds:`, bounds, `and isOpen: ${isOpen}`);
    settings.windows[name] = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isOpen,
    };
    saveSettings(settings);
}

function setWindowBounds(stateKey, bounds) {
    log.log(`setWindowBounds called for key "${stateKey}" with bounds:`, bounds);

    const settings = loadSettings();
    const currentWindowState = settings.windows?.[stateKey] || {};
    const isOpen = currentWindowState.isOpen ?? false;

    saveWindowState(
        stateKey,
        {
            ...bounds,
        },
        isOpen
    );
}

function setWindowState(stateKey, isOpen) {
    // log.log(`setWindowState called for key "${stateKey}" with isOpen: ${isOpen}`);
    const settings = loadSettings();
    const currentBounds = settings.windows?.[stateKey] || {};
    saveWindowState(stateKey, { ...currentBounds }, isOpen);
}

function nukeTradingViewWindowStates() {
    const settings = loadSettings();
    if (!settings.windows) return;

    const keysToDelete = Object.keys(settings.windows).filter((key) => key.startsWith("traderviewWindow_"));

    for (const key of keysToDelete) {
        delete settings.windows[key];
        log.log(`🧨 Nuked window state for "${key}"`);
    }

    saveSettings(settings);
}

module.exports = {
    getWindowState,
    saveWindowState,
    setWindowBounds,
    setWindowState,
    nukeTradingViewWindowStates,
};
