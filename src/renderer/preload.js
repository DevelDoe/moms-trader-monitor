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
    onHeroUpdate: (callback) =>
        ipcRenderer.on("hero-updated", (event, data) => {
            callback(data.heroes || []);
        }),
    getTracked: () => ipcRenderer.invoke("store:tracked:get"),
    setTracked: (list, maxLen) => ipcRenderer.invoke("store:tracked:set", list, maxLen),
    onTrackedUpdate: (fn) => ipcRenderer.on("tracked-update", (_e, list) => fn(list)),
});

contextBridge.exposeInMainWorld("eventsAPI", {
    activate: () => ipcRenderer.send("activate-events"),
    deactivate: () => ipcRenderer.send("deactivate-events"),
    onAlert: (callback) => ipcRenderer.on("ws-alert", (_, data) => callback(data)),
    // onAlertEvents: (callback) => ipcRenderer.on("ws-events", (event, data) => callback(data)),
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
    // onFocusEvents: (callback) => ipcRenderer.on("ws-events", (event, data) => callback(data)),
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
