// src/main/settings.js

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const log = require("../hlps/logger")(__filename);

const CURRENT_VERSION = app.getVersion();
const VERSION_LOCK_FILE = path.join(app.getPath("userData"), "version.lock");

let cacheCleared = false;

// Use system settings file for production, separate file for development
const isDevelopment = process.env.NODE_ENV === "development";
log.log("Development:", isDevelopment);

function deleteFolderRecursive(folderPath) {
    if (!fs.existsSync(folderPath)) return;
    fs.readdirSync(folderPath).forEach((file) => {
        const curPath = path.join(folderPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
            deleteFolderRecursive(curPath);
        } else {
            fs.unlinkSync(curPath);
        }
    });
    try {
        fs.rmdirSync(folderPath);
    } catch (err) {
        log.warn("⚠️ Failed to remove cache folder root:", err.message);
    }
}

const SETTINGS_FILE = isDevelopment ? path.join(__dirname, "../data/settings.dev.json") : path.join(app.getPath("userData"), "settings.json");
log.log("Current working directory:", process.cwd());
log.log("__dirname:", __dirname);
log.log("Full settings path:", SETTINGS_FILE);
log.log("File exists:", fs.existsSync(SETTINGS_FILE));
const FIRST_RUN_FILE = path.join(app.getPath("userData"), "first-run.lock");

const DEFAULT_SETTINGS = {
    top: {
        minPrice: 1,
        maxPrice: 0,
        minFloat: 0,
        maxFloat: 0,
        minScore: 0,
        maxScore: 0,
        minVolume: 0,
        maxVolume: 0,
        frontlineListLength: 14,
        heroesListLength: 3,
    },
    news: {
        showTrackedTickers: false,
        filteredTickers: [],
        blockList: [
            "nasdaq surges",
            "Shares halted",
            "shares resume",
            "stocks moving in",
            "earnings scheduled",
            "Says experts",
            "us stocks",
            "futures waver",
            "shares are trading",
            "trading halt",
            "crude oil moves lower",
            "Market-moving news",
        ],
        bullishList: ["FDA Approves", "Clinical Trials", "Noteworthy Insider Activity", "equity purchase facility"],
        bearishList: ["Sell Alert", "Stock Downgrade", "Downgrades to Sell"],
        allowMultiSymbols: false,
    },
    scanner: {
        minPrice: 1,
        maxPrice: 0,
        direction: null,
        minChangePercent: 0,
        minVolume: 0,
        maxAlerts: 20,
        scannerVolume: 1,
    },
    traderview: {
        visibility: false,
        enableHeroes: false,
        autoClose: true,
    },
};

function isFirstInstall() {
    return !fs.existsSync(SETTINGS_FILE) && !fs.existsSync(FIRST_RUN_FILE);
}

function loadSettings() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            log.warn("Settings file not found. Using default settings.");
            return { ...DEFAULT_SETTINGS };
        }

        const data = fs.readFileSync(SETTINGS_FILE, "utf-8").trim();
        if (!data) {
            log.warn("Settings file is empty! Using default settings.");
            return { ...DEFAULT_SETTINGS };
        }

        const parsedSettings = JSON.parse(data);
        const mergedSettings = mergeSettingsWithDefaults(parsedSettings, DEFAULT_SETTINGS);

        // Remove window settings since they're now managed by electron store
        if (mergedSettings.windows) {
            delete mergedSettings.windows;
        }

        saveSettings(mergedSettings); // Save back merged settings if needed

        // ✅ Move cache nuke logic here
        try {
            const cachePath = path.join(app.getPath("userData"), "Cache", "Cache_Data");
            const existingVersion = fs.existsSync(VERSION_LOCK_FILE) ? fs.readFileSync(VERSION_LOCK_FILE, "utf-8").trim() : null;

            if (!cacheCleared && existingVersion !== CURRENT_VERSION) {
                log.warn(`🧼 Cache nuke triggered (version changed: ${existingVersion} → ${CURRENT_VERSION})`);
                deleteFolderRecursive(cachePath);
                fs.writeFileSync(VERSION_LOCK_FILE, CURRENT_VERSION, "utf-8");
                cacheCleared = true;
            }
        } catch (err) {
            log.log("⚠️ Failed to check or nuke cache:", err.message);
        }

        return mergedSettings;
    } catch (err) {
        log.error("Error loading settings, resetting to defaults.", err);
        return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
}

function saveSettings(settingsToSave = DEFAULT_SETTINGS) {
    // log.log("Saving settings...");
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsToSave, null, 2));
}

const LOG_FILE = path.join(__dirname, "../data/volume.json");

function logVolumeSnapshot(timestamp, volumeTotal) {
    const entry = { timestamp, volume: volumeTotal };

    let history = [];
    try {
        const raw = fs.readFileSync(LOG_FILE, "utf-8");
        history = JSON.parse(raw);
    } catch {
        history = [];
    }

    history.push(entry);

    try {
        fs.writeFileSync(LOG_FILE, JSON.stringify(history, null, 2), "utf-8");
    } catch (err) {
        log.log("⚠️ Failed to write volume log:", err.message);
    }
}

function deepMerge(target, source) {
    if (typeof target !== "object" || target === null) return source;
    if (typeof source !== "object" || source === null) return target;

    const result = Array.isArray(source) ? [] : { ...target };

    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }

    return result;
}

function mergeSettingsWithDefaults(userSettings, defaultSettings) {
    return deepMerge(defaultSettings, userSettings);
}

module.exports = {
    loadSettings,
    saveSettings,
    DEFAULT_SETTINGS,
    logVolumeSnapshot,
};
