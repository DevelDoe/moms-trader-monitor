// src/main/settings.js

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const log = require("../hlps/logger")(__filename);

// Use system settings file for production, separate file for development
const isDevelopment = process.env.NODE_ENV === "development";
log.log('Development:', isDevelopment);
const SETTINGS_FILE = isDevelopment ? path.join(__dirname, "../data/settings.dev.json") : path.join(app.getPath("userData"), "settings.json");
log.log('Current working directory:', process.cwd());
log.log('__dirname:', __dirname);
log.log('Full settings path:', SETTINGS_FILE);
log.log('File exists:', fs.existsSync(SETTINGS_FILE));
const FIRST_RUN_FILE = path.join(app.getPath("userData"), "first-run.lock"); 

const DEFAULT_SETTINGS = {
    top: {
        minPrice: 0,
        maxPrice: 100,
        minFloat: 0,
        maxFloat: 0,
        minScore: 0,
        maxScore: 0,
        minVolume: 0,
        maxVolume: 0,
        lists: {
            live: {
                Price: false,
                alertChangePercent: false,
                cumulativeUpChange: true,
                cumulativeDownChange: false,
                Score: true,
                Bonuses: true,
                length: 3,
            },
            focus: {
                Price: false,
                alertChangePercent: false,
                cumulativeUpChange: true,
                cumulativeDownChange: false,
                Score: true,
                Bonuses: true,
                length: 3,
            },
        },
    },
    news: {
        showTrackedTickers: false,
        filteredTickers: [],
        blockList: [],
        bullishList: [
            "FDA Approves", "Clinical Trials", "Noteworthy Insider Activity", // Add more items...
        ],
        bearishList: [
            "Sell Alert", "Stock Downgrade", "Downgrades to Sell", // Add more items...
        ],
        allowMultiSymbols: false,
    },
};

function isFirstInstall() {
    return !fs.existsSync(SETTINGS_FILE) && !fs.existsSync(FIRST_RUN_FILE);
}

function mergeSettingsWithDefaults(userSettings, defaultSettings) {
    return {
        ...defaultSettings,
        ...userSettings,
        top: {
            ...defaultSettings.top,
            ...userSettings.top,
            lists: {
                live: {
                    ...defaultSettings.top.lists.live,
                    ...userSettings.top?.lists?.live,
                    length: userSettings.top?.lists?.live?.length ?? defaultSettings.top.lists.live.length,
                },
                focus: {
                    ...defaultSettings.top.lists.focus,
                    ...userSettings.top?.lists?.focus,
                    length: userSettings.top?.lists?.focus?.length ?? defaultSettings.top.lists.focus.length,
                },
            },
            minFloat: userSettings.top?.minFloat ?? defaultSettings.top.minFloat,
            maxFloat: userSettings.top?.maxFloat ?? defaultSettings.top.maxFloat,
            minScore: userSettings.top?.minScore ?? defaultSettings.top.minScore,
            maxScore: userSettings.top?.maxScore ?? defaultSettings.top.maxScore,
            minVolume: userSettings.top?.minVolume ?? defaultSettings.top.minVolume,
            maxVolume: userSettings.top?.maxVolume ?? defaultSettings.top.maxVolume,
        },
        news: {
            ...defaultSettings.news,
            ...userSettings.news,
            blockList: userSettings.news?.blockList || [],
            bullishList: userSettings.news?.bullishList || [],
            bearishList: userSettings.news?.bearishList || [],
            allowMultiSymbols: userSettings.news?.allowMultiSymbols ?? false,
        },
    };
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

        saveSettings(mergedSettings); // Save back merged settings if needed
        return mergedSettings;
    } catch (err) {
        log.error("Error loading settings, resetting to defaults.", err);
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(settingsToSave = DEFAULT_SETTINGS) {
    log.log("Saving settings...");
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsToSave, null, 2));
}

module.exports = {
    loadSettings,
    saveSettings,
    DEFAULT_SETTINGS,
};
