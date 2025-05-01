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

// lists: {
//     live: {
//         Price: false,
//         alertChangePercent: false,
//         cumulativeUpChange: true,
//         cumulativeDownChange: false,
//         Score: true,
//         Bonuses: true,
//         length: 3,
//         fiveMinVolume: false,
//     },
//     focus: {
//         Price: false,
//         alertChangePercent: false,
//         cumulativeUpChange: true,
//         cumulativeDownChange: false,
//         Score: true,
//         Bonuses: true,
//         length: 3,
//         fiveMinVolume: false,
//     },
// },

const DEFAULT_SETTINGS = {
    top: {
        minPrice: 1.1,
        maxPrice: 0,
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
                fiveMinVolume: false,
            },
            focus: {
                Price: false,
                alertChangePercent: false,
                cumulativeUpChange: true,
                cumulativeDownChange: false,
                Score: true,
                Bonuses: true,
                length: 3,
                fiveMinVolume: false,
            },
        },
        frontlineListLength: 12,
        heroesListLength: 3,
        liveListLength: 9,
        focusListLength: 3,
        dailyListLength: 15,
    },
    news: {
        showTrackedTickers: false,
        filteredTickers: [],
        blockList: ["nasdaq tumbles over", "dow dips over", "Stocks moving in", "Shares are trading higher", "Shares resume Trading", "Shares halted on", "Shares resume trade"],
        bullishList: ["private placement", "stock buyback program", "Receives U.S. Patent", "Granted U.S. Patent", "Reports confirmatory preclinical efficacy"],
        bearishList: [],
        allowMultiSymbols: false,
    },
    scanner: {
        minPrice: 1,
        maxPrice: 0,
        direction: null,
        minChangePercent: 0,
        minVolume: 0,
        maxAlerts: 20,
        scannerVolume: 0,
    },
    windows: {
        scannerWindow: {
            width: 172,
            height: 759,
            x: 1190,
            y: -768,
            isOpen: true,
        },
        settingsWindow: {
            width: 976,
            height: 718,
            x: -130,
            y: -857,
            isOpen: false,
        },
        liveWindow: {
            width: 358,
            height: 481,
            x: 884,
            y: 784,
            isOpen: false,
        },
        focusWindow: {
            width: 435,
            height: 450,
            x: 1655,
            y: -458,
            isOpen: true,
        },
        dailyWindow: {
            width: 256,
            height: 542,
            x: 2053,
            y: 243,
            isOpen: false,
        },
        infobarWindow: {
            width: 403,
            height: 39,
            x: 2153,
            y: -708,
            isOpen: true,
        },
        wizardWindow: {
            width: 2400,
            height: 504,
            x: 594,
            y: -448,
            isOpen: false,
        },
        dockerWindow: {
            isOpen: true,
        },
        progressWindow: {
            width: 1365,
            height: 39,
            x: 1190,
            y: -39,
            isOpen: true,
        },
        frontlineWindow: {
            width: 293,
            height: 429,
            x: 1362,
            y: -437,
            isOpen: true,
        },
        activeWindow: {
            width: 791,
            height: 331,
            x: 1362,
            y: -768,
            isOpen: true,
        },
        traderviewWindow_MULN: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_STBX: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_IRBT: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_RILY: {
            isOpen: false,
        },
        traderviewWindow_BCTX: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_NTWK: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_WIMI: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_AMPG: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_ZEO: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_TGL: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_ELWS: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_HNNA: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_ZURA: {
            isOpen: false,
        },
        traderviewWindow_ABTS: {
            isOpen: false,
        },
        traderviewWindow_PN: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_MURA: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_CLIK: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_ZCAR: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_OST: {
            isOpen: false,
        },
        traderviewWindow_MIRA: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_RIME: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_MBOT: {
            width: 1486,
            height: 1068,
            x: 2355,
            y: 1117,
            isOpen: false,
        },
        traderviewWindow_NUKK: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_FFAI: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_ICCT: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_WNW: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_XHLD: {
            isOpen: false,
        },
        traderviewWindow_KITT: {
            isOpen: false,
        },
        traderviewWindow_MBRX: {
            isOpen: false,
        },
        traderviewWindow_MGNX: {
            isOpen: false,
        },
        traderviewWindow_CTHR: {
            isOpen: false,
        },
        traderviewWindow_VEEE: {
            isOpen: false,
        },
        traderviewWindow_SMX: {
            isOpen: false,
        },
        traderviewWindow_ICAD: {
            width: 850,
            height: 660,
            x: 2354,
            y: 880,
            isOpen: false,
        },
        traderviewWindow_SXTC: {
            width: 850,
            height: 660,
            x: 474,
            y: 616,
            isOpen: false,
        },
        traderviewWindow_BCG: {
            isOpen: false,
        },
        traderviewWindow_ALLR: {
            isOpen: false,
        },
        traderviewWindow_MTVA: {
            isOpen: true,
        },
        traderviewWindow_REKR: {
            width: 850,
            height: 660,
            x: 1495,
            y: 730,
            isOpen: false,
        },
        traderviewWindow_CDT: {
            isOpen: false,
        },
        traderviewWindow_PYXS: {
            isOpen: false,
        },
        traderviewWindow_ARBB: {
            isOpen: false,
        },
        traderviewWindow_ADD: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_SHFS: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_MSGM: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_GURE: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_MLGO: {
            width: 763,
            height: 506,
            x: 1494,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_APVO: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_EVGN: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_AREB: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_UPXI: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_SBFM: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_DWTX: {
            isOpen: false,
        },
        traderviewWindow_GELS: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_HOFV: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_SUNE: {
            width: 850,
            height: 660,
            x: 154,
            y: 1187,
            isOpen: false,
        },
        traderviewWindow_HOUR: {
            width: 1475,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_SXTP: {
            isOpen: false,
        },
        traderviewWindow_TIVC: {
            isOpen: false,
        },
        scrollXpWindow: {
            width: 198,
            height: 450,
            x: 2090,
            y: -458,
            isOpen: true,
        },
        traderviewWindow_SNOA: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_NDRA: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_AGRI: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_ENSC: {
            isOpen: false,
        },
        scrollStatsWindow: {
            width: 268,
            height: 450,
            x: 2288,
            y: -458,
            isOpen: true,
        },
        traderviewWindow_LGCB: {
            isOpen: false,
        },
        traderviewWindow_MBIO: {
            isOpen: false,
        },
        traderviewWindow_ZENA: {
            isOpen: false,
        },
        traderviewWindow_OLB: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_VYNE: {
            isOpen: false,
        },
        traderviewWindow_INTJ: {
            width: 1475,
            height: 1067,
            x: 199,
            y: 989,
            isOpen: false,
        },
        traderviewWindow_TNON: {
            isOpen: false,
        },
        traderviewWindow_OMEX: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_UPC: {
            width: 1486,
            height: 1066,
            x: 2361,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_PTLE: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_ARTV: {
            isOpen: false,
        },
        traderviewWindow_OMH: {
            width: 763,
            height: 506,
            x: 745,
            y: 0,
            isOpen: false,
        },
        traderviewWindow_ABAT: {
            width: 850,
            height: 660,
            x: 2430,
            y: 865,
            isOpen: false,
        },
        traderviewWindow_ABVE: {
            width: 1934,
            height: 1067,
            x: -7,
            y: 1060,
            isOpen: false,
        },
        traderviewWindow_WLDS: {
            width: 1486,
            height: 1068,
            x: 2361,
            y: 1059,
            isOpen: false,
        },
        traderviewWindow_ADVM: {
            width: 850,
            height: 660,
            x: 1914,
            y: 950,
            isOpen: false,
        },
        traderviewWindow_RAY: {
            isOpen: false,
        },
        traderviewWindow_IVF: {
            isOpen: false,
        },
        traderviewWindow_JFBR: {
            isOpen: false,
        },
        traderviewWindow_STSS: {
            isOpen: false,
        },
        herosWindow: {
            isOpen: true,
        },
    },
    traderview: {
        visibility: true,
        enableHeroes: false,
        autoClose: true,
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
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(settingsToSave = DEFAULT_SETTINGS) {
    log.log("Saving settings...");
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
        console.warn("⚠️ Failed to write volume log:", err.message);
    }
}

module.exports = {
    loadSettings,
    saveSettings,
    DEFAULT_SETTINGS,
    logVolumeSnapshot,
};
