const { contextBridge, ipcRenderer } = require("electron");
const isDev = process.env.NODE_ENV === "development";

contextBridge.exposeInMainWorld("autoLogin", {
    getCredentials: () => ipcRenderer.invoke("credentials:get"),
    saveCredentials: (data) => ipcRenderer.invoke("credentials:save", data),
});

contextBridge.exposeInMainWorld("log", {
    debug: isDev ? (...args) => console.debug("[DEBUG]", ...args) : () => {},
    info: isDev ? (...args) => console.info("[INFO]", ...args) : () => {},
    warn: isDev ? (...args) => console.warn("[WARN]", ...args) : () => {},
    error: (...args) => {
        console.error("[ERROR]", ...args);
        ipcRenderer.send("renderer-error", args.map(String).join(" "));
    },
});

contextBridge.exposeInMainWorld("electronAPI", {
    onAppReady: (cb) => ipcRenderer.once("app-ready", cb),
    closeSplash: () => ipcRenderer.send("close-splash"),
    onSymbolsFetched: (callback) => ipcRenderer.on("symbols-fetched", callback),
    getBuffs: () => ipcRenderer.invoke("buffs:get"),
    onBuffsUpdate: (callback) => ipcRenderer.on("buffs:update", (_, buffs) => callback(buffs)),
    exitApp: () => ipcRenderer.send("exit-app"),
    // Nuke triggers
    onNukeState: (cb) => {
        ipcRenderer.on("store-nuke", cb); // 🧨 from Store (auto or manual)
        ipcRenderer.on("admin:nuke", cb); // 🧨 from Admin button
    },

    nukeState: () => ipcRenderer.send("admin-nuke"),
    onXpReset: (cb) => ipcRenderer.on("xp-reset", cb),
    getAuthInfo: () => ({
        token: localStorage.getItem("token"),
        role: localStorage.getItem("role"),
        permissions: JSON.parse(localStorage.getItem("permissions") || "[]"),
        userId: localStorage.getItem("userId"),
    }),
    sendAuthInfo: (info) => ipcRenderer.send("set-auth-info", info),
    login: (email, password) => ipcRenderer.invoke("login", { email, password }),
});

contextBridge.exposeInMainWorld("splashAPI", {
    notifyReady: () => ipcRenderer.send("splash-ready"),
});

contextBridge.exposeInMainWorld("hlpsFunctions", {
    calculateImpact: (vol, price, buffs) => calculateVolumeImpact(vol, price, buffs),
});

contextBridge.exposeInMainWorld("appFlags", {
    isDev: process.env.NODE_ENV === "development",
    eventsDebug: process.env.EVENTS_DEBUG === "true",
});

contextBridge.exposeInMainWorld("settingsAPI", {
    toggle: () => ipcRenderer.send("toggle-settings"),
    get: () => ipcRenderer.invoke("get-settings"),
    update: (settings) => ipcRenderer.send("update-settings", settings),
    onUpdate: (callback) => ipcRenderer.on("settings-updated", (_, updatedSettings) => callback(updatedSettings)),
    fetchNews: () => ipcRenderer.invoke("fetch-news"),
});

// Modern
contextBridge.exposeInMainWorld("storeAPI", {
    getSymbols: () => ipcRenderer.invoke("get-all-symbols"),
    getSymbol: (symbol) => ipcRenderer.invoke("get-symbol", symbol),
    getAllNews: () => ipcRenderer.invoke("get-all-news"),
    getTickerNews: (ticker) => ipcRenderer.invoke("get-news", ticker),
    onUpdate: (callback) => ipcRenderer.on("lists-updated", callback),
    onNewsUpdate: (callback) => ipcRenderer.on("news-updated", (event, data) => callback(data)),
    onHeroUpdate: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("hero-updated", handler);
        return () => ipcRenderer.off("hero-updated", handler);
    },
    getTracked: () => ipcRenderer.invoke("store:tracked:get"),
    setTracked: (list, maxLen) => ipcRenderer.invoke("store:tracked:set", list, maxLen),
    onTrackedUpdate: (fn) => ipcRenderer.on("tracked-update", (_e, list) => fn(list)),
    getTrophyData: () => ipcRenderer.invoke("get-trophy-data"),
    updateTrophyData: (trophyData) => ipcRenderer.invoke("update-trophy-data", trophyData),
    onTrophyUpdate: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on("trophy-updated", handler);
        return () => ipcRenderer.off("trophy-updated", handler);
    },
});

contextBridge.exposeInMainWorld("eventsAPI", {
    activate: () => ipcRenderer.send("activate-events"),
    deactivate: () => ipcRenderer.send("deactivate-events"),
    onAlert: (callback) => ipcRenderer.on("ws-alert", (_, data) => callback(data)),
});

contextBridge.exposeInMainWorld("frontlineAPI", {
    activate: () => ipcRenderer.send("activate-frontline"),
    deactivate: () => ipcRenderer.send("deactivate-frontline"),
    getSymbols: () => ipcRenderer.invoke("get-all-symbols"),
    updateXp: (symbol, xp, level) => ipcRenderer.send("update-xp", { symbol, xp, level }),
});

contextBridge.exposeInMainWorld("heroesAPI", {
    activate: () => ipcRenderer.send("activate-heroes"),
    deactivate: () => ipcRenderer.send("deactivate-heroes"),
    onTickerUpdate: (callback) => ipcRenderer.on("lists-updated", callback),
    applyFilters: (min, max) => ipcRenderer.send("apply-filters", { min, max }),
    onNewsUpdate: (callback) => ipcRenderer.on("news-updated", (event, data) => callback(data)),
    getSymbols: () => ipcRenderer.invoke("get-all-symbols"),
    calculateVolumeImpact: (volume, price) => ipcRenderer.invoke("calculate-volume-impact", { volume, price }),
    getCurrentHeroes: () => ipcRenderer.invoke("get-tickers", "focus"),
});

contextBridge.exposeInMainWorld("activeAPI", {
    activate: () => ipcRenderer.send("activate-active"),
    deactivate: () => ipcRenderer.send("deactivate-active"),
    getSymbols: () => ipcRenderer.invoke("get-all-symbols"),
    getSymbol: (symbol) => ipcRenderer.invoke("get-symbol", symbol), // ✅ New function
    setActiveTicker: (ticker) => ipcRenderer.send("set-active-ticker", ticker),
    onActiveTickerUpdate: (callback) => {
        ipcRenderer.on("update-active-ticker", (event, ticker) => {
            callback(ticker);
        });
    },
    notifyActiveWindowReady: () => ipcRenderer.send("active-window-ready"), // ✅ This line
});

contextBridge.exposeInMainWorld("scrollXpAPI", {
    activate: () => ipcRenderer.send("activate-scrollXp"),
    deactivate: () => ipcRenderer.send("deactivate-scrollXp"),
    publishTrackedTickers: (tracked) => ipcRenderer.send("publish-tracked-tickers", tracked),
});

contextBridge.exposeInMainWorld("scrollStatsAPI", {
    activate: () => ipcRenderer.send("activate-scrollStats"),
    deactivate: () => ipcRenderer.send("deactivate-scrollStats"),
});

contextBridge.exposeInMainWorld("scrollHodAPI", {
    activate: () => ipcRenderer.send("activate-scrollHod"),
    deactivate: () => ipcRenderer.send("deactivate-scrollHod"),
});

contextBridge.exposeInMainWorld("infobarAPI", {
    activate: () => ipcRenderer.send("activate-infobar"),
    deactivate: () => ipcRenderer.send("deactivate-infobar"),
    refresh: () => ipcRenderer.send("refresh-infobar"),
    onForceRefresh: (callback) => ipcRenderer.on("trigger-window-refresh", () => callback()),
});

contextBridge.exposeInMainWorld("traderviewAPI", {
    setVisibility: (enabled) => ipcRenderer.send("set-traderview-visibility", enabled),
    setTopTickers: (tickers) => ipcRenderer.send("set-top-tickers", tickers),
    openTickersNow: (tickers) => ipcRenderer.send("open-traderview-tickers", tickers),
});

contextBridge.exposeInMainWorld("progressAPI", {
    activate: () => ipcRenderer.send("activate-progress"),
    deactivate: () => ipcRenderer.send("deactivate-progress"),
    log: (timestamp, volume) => ipcRenderer.send("log-volume", { timestamp, volume }),
});

contextBridge.exposeInMainWorld("wizardAPI", {
    activate: () => ipcRenderer.send("activate-wizard"),
    deactivate: () => ipcRenderer.send("deactivate-wizard"),
});

contextBridge.exposeInMainWorld("newsAPI", {
    get: () => ipcRenderer.invoke("get-all-news"),
    activate: () => ipcRenderer.send("activate-news"),
    deactivate: () => ipcRenderer.send("deactivate-news"),
    onUpdate: (callback) => ipcRenderer.on("news-updated", callback),
});

contextBridge.exposeInMainWorld("sessionHistoryAPI", {
    activate: () => ipcRenderer.send("activate-sessionHistory"),
    deactivate: () => ipcRenderer.send("deactivate-sessionHistory"),
});

// Audio Test API
contextBridge.exposeInMainWorld("audioTestAPI", {
    testComboAlert: () => ipcRenderer.invoke("test-combo-alert"),
    testNewsAlert: () => ipcRenderer.invoke("test-news-alert"),
    testChimeAlert: () => ipcRenderer.invoke("test-chime-alert"),
    testTickAlert: () => ipcRenderer.invoke("test-tick-alert"),
    testScannerAlert: () => ipcRenderer.invoke("test-scanner-alert"),
});

// IPC Listener API for renderer windows
contextBridge.exposeInMainWorld("ipcListenerAPI", {
    onTestComboAlert: (callback) => {
        const handler = () => callback();
        ipcRenderer.on("test-combo-alert", handler);
        return () => ipcRenderer.removeListener("test-combo-alert", handler);
    },
    onTestNewsAlert: (callback) => {
        const handler = () => callback();
        ipcRenderer.on("test-news-alert", handler);
        return () => ipcRenderer.removeListener("test-news-alert", handler);
    },
    onTestChimeAlert: (callback) => {
        const handler = () => callback();
        ipcRenderer.on("test-chime-alert", handler);
        return () => ipcRenderer.removeListener("test-chime-alert", handler);
    },
    onTestTickAlert: (callback) => {
        const handler = () => callback();
        ipcRenderer.on("test-tick-alert", handler);
        return () => ipcRenderer.removeListener("test-tick-alert", handler);
    },
    onTestScannerAlert: (callback) => {
        const handler = () => callback();
        ipcRenderer.on("test-scanner-alert", handler);
        return () => ipcRenderer.removeListener("test-scanner-alert", handler);
    },
});

// XP Data API
contextBridge.exposeInMainWorld("xpAPI", {
    getActiveStocks: () => ipcRenderer.invoke("get-xp-active-stocks"),
    getSessionHistory: () => ipcRenderer.invoke("get-xp-session-history"),
    getSessionUpdate: () => ipcRenderer.invoke("get-xp-session-update"),
    onActiveStocksUpdate: (callback) => ipcRenderer.on("xp-active-stocks", (_, data) => callback(data)),
    onSessionHistoryUpdate: (callback) => ipcRenderer.on("xp-session-history", (_, data) => callback(data)),
    onSessionUpdate: (callback) => ipcRenderer.on("xp-session-update", (_, data) => callback(data)),
});

// electron-stores

contextBridge.exposeInMainWorld("oracleStore", {
    getLastAckCursor: () => ipcRenderer.invoke("get-last-ack-cursor"),
    setLastAckCursor: (c) => ipcRenderer.invoke("set-last-ack-cursor", c),
});

// XP Settings API
contextBridge.exposeInMainWorld("xpSettingsAPI", {
    get: () => ipcRenderer.invoke("xp-settings:get"),
    set: (settings) => ipcRenderer.invoke("xp-settings:set", settings),
    onUpdate: (callback) => {
        const handler = (_e, data) => callback(data);
        ipcRenderer.on("xp-settings:change", handler);
        ipcRenderer.send("xp-settings:subscribe");
        return () => ipcRenderer.removeListener("xp-settings:change", handler);
    },
});

// HOD Settings API
contextBridge.exposeInMainWorld("hodSettingsAPI", {
    get: () => ipcRenderer.invoke("hod-settings:get"),
    set: (settings) => ipcRenderer.invoke("hod-settings:set", settings),
    onUpdate: (callback) => {
        const handler = (_e, data) => callback(data);
        ipcRenderer.on("hod-settings:change", handler);
        ipcRenderer.send("hod-settings:subscribe");
        return () => ipcRenderer.removeListener("hod-settings:change", handler);
    },
});

// Stats Settings API
contextBridge.exposeInMainWorld("statsSettingsAPI", {
    get: () => ipcRenderer.invoke("stats-settings:get"),
    set: (settings) => ipcRenderer.invoke("stats-settings:set", settings),
    onUpdate: (callback) => {
        const handler = (_e, data) => callback(data);
        ipcRenderer.on("stats-settings:change", handler);
        ipcRenderer.send("stats-settings:subscribe");
        return () => ipcRenderer.removeListener("stats-settings:change", handler);
    },
});

// Window Settings API
contextBridge.exposeInMainWorld("windowSettingsAPI", {
    getAll: () => ipcRenderer.invoke("window-settings:get"),
    getWindow: (windowKey) => ipcRenderer.invoke("window-settings:get-window", windowKey),
    setWindow: (windowKey, state) => ipcRenderer.invoke("window-settings:set-window", { windowKey, state }),
    setBounds: (windowKey, bounds) => ipcRenderer.invoke("window-settings:set-bounds", { windowKey, bounds }),
    setOpenState: (windowKey, isOpen) => ipcRenderer.invoke("window-settings:set-open-state", { windowKey, isOpen }),
    resetWindow: (windowKey) => ipcRenderer.invoke("window-settings:reset-window", windowKey),
    resetAll: () => ipcRenderer.invoke("window-settings:reset-all"),
    onUpdate: (callback) => {
        const handler = (_e, data) => callback(data);
        ipcRenderer.on("window-settings:change", handler);
        ipcRenderer.send("window-settings:subscribe");
        return () => ipcRenderer.removeListener("window-settings:change", handler);
    },
});

// Emergency reset function - accessible from any window
contextBridge.exposeInMainWorld("emergencyResetWindows", () => {
    return ipcRenderer.invoke("emergency-reset-windows");
});

// Centralized logging API for all renderer views
// This provides a unified logging interface that respects production vs development environments
// - Errors are always logged (production and development)
// - Warnings, info, and debug are only logged in development or when debug flags are enabled
contextBridge.exposeInMainWorld("rendererLogger", {
    error: (message, error, context = {}) => {
        // Always log errors in production and development
        console.error(`[Renderer Error] ${message}`, error, context);
        // In the future, we could send this to a central logging service
        // ipcRenderer.send("renderer-error", { message, error: error?.message, stack: error?.stack, context });
    },
    warn: (message, data = {}) => {
        // Only log warnings in development or when debug flags are enabled
        if (process.env.NODE_ENV === "development" || process.env.EVENTS_DEBUG === "true") {
            console.warn(`[Renderer Warning] ${message}`, data);
        }
    },
    info: (message, data = {}) => {
        // Only log info in development or when debug flags are enabled
        if (process.env.NODE_ENV === "development" || process.env.EVENTS_DEBUG === "true") {
            console.info(`[Renderer Info] ${message}`, data);
        }
    },
    debug: (message, data = {}) => {
        // Only log debug in development or when debug flags are enabled
        if (process.env.NODE_ENV === "development" || process.env.EVENTS_DEBUG === "true") {
            console.debug(`[Renderer Debug] ${message}`, data);
        }
    }
});

// Centralized logging helpers for all renderer views
// These functions respect the existing window.log API and provide safe fallbacks
contextBridge.exposeInMainWorld("loggingHelpers", {
    // Conditional debug logging (only in development or when debug flags enabled)
    log: (message, data = null) => {
        if (isDev || process.env.EVENTS_DEBUG === "true") {
            if (data) {
                console.log(message, data);
            } else {
                console.log(message);
            }
        }
    },
    
    // Safe error logging with fallback
    logError: (message, error, context = {}) => {
        if (window.rendererLogger?.error) {
            window.rendererLogger.error(message, error, context);
        } else {
            // Fallback to console.error if rendererLogger is not available
            console.error(`[Renderer Error] ${message}`, error, context);
        }
    },
    
    // Safe warning logging with fallback
    logWarning: (message, data = {}) => {
        if (window.rendererLogger?.warn) {
            window.rendererLogger.warn(message, data);
        } else if (isDev || process.env.EVENTS_DEBUG === "true") {
            // Fallback to console.warn if rendererLogger is not available
            console.warn(`[Renderer Warning] ${message}`, data);
        }
    }
});

// preload.js
contextBridge.exposeInMainWorld("top3API", {
    set: (list) => {
        // console.debug("[top3] preload -> set", list);
        return ipcRenderer.invoke("top3:set", list); // ✅ invoke to hit ipcMain.handle
    },
    get: () => {
        // console.debug("[top3] preload -> get()");
        return ipcRenderer.invoke("top3:get");
    },
    subscribe: (cb) => {
        // console.debug("[top3] preload -> subscribe()");
        const handler = (_e, data) => {
            console.debug("[top3] preload <- change", data);
            cb?.(data);
        };
        ipcRenderer.on("top3:change", handler);
        ipcRenderer.send("top3:subscribe");
        return () => ipcRenderer.removeListener("top3:change", handler);
    },
});

// HELPER FUNCTIONS
function calculateVolumeImpact(volume = 0, price = 1, buffs = {}) {
    const categories = Object.entries(buffs)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => a.priceThreshold - b.priceThreshold);

    for (const category of categories) {
        if (price <= category.priceThreshold) {
            const sortedStages = [...category.volumeStages].sort((a, b) => a.volumeThreshold - b.volumeThreshold);

            const stageToUse =
                sortedStages.find((stage, index) => {
                    const current = stage.volumeThreshold;
                    const prev = index === 0 ? 0 : sortedStages[index - 1].volumeThreshold;
                    if (index === sortedStages.length - 1) {
                        return volume >= prev;
                    }
                    return volume > prev && volume <= current;
                }) || sortedStages[sortedStages.length - 1];

            return {
                ...stageToUse,
                capAssigned: category.category,
                volumeStage: stageToUse.key,
                message: `${category.category} ${stageToUse.key} (${humanReadableNumbers(volume)})`,
                style: {
                    cssClass: `volume-${stageToUse.key.toLowerCase()}`,
                    color: getColorForStage(stageToUse.key),
                    animation: stageToUse.key === "parabolicVol" ? "pulse 1.5s infinite" : "none",
                },
            };
        }
    }

    return {
        multiplier: 1,
        capAssigned: "None",
        volumeStage: "None",
        message: "No matching category found",
        style: {
            cssClass: "volume-none",
            icon: "",
            description: "No volume",
            color: "#cccccc",
            animation: "none",
        },
        score: 0,
    };
}

function getColorForStage(stageKey) {
    const colors = {
        lowVol: "#ccc",
        mediumVol: "#00aeff",
        highVol: "#263cff",
        parabolicVol: "#e25822",
    };
    return colors[stageKey] || "#cccccc";
}

function humanReadableNumbers(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
    return num.toString();
}
