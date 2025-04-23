const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    closeSplash: () => ipcRenderer.send("close-splash"),
    onSymbolsFetched: (callback) => ipcRenderer.on("symbols-fetched", callback),
    getBuffs: () => ipcRenderer.invoke("buffs:get"),
    onBuffsUpdate: (callback) => ipcRenderer.on("buffs:update", (_, buffs) => callback(buffs)),
    onXpUpdate: (cb) => ipcRenderer.on("xp-updated", (event, data) => cb(data)),
    exitApp: () => ipcRenderer.send("exit-app"),
    // Nuke triggers
    onNukeState: (cb) => {
        ipcRenderer.on("store-nuke", cb); // 🧨 from Store (auto or manual)
        ipcRenderer.on("admin:nuke", cb); // 🧨 from Admin button
    },

    nukeState: () => ipcRenderer.send("admin-nuke"),
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

contextBridge.exposeInMainWorld("dailyAPI", {
    toggle: () => ipcRenderer.send("toggle-daily"),
    refresh: () => ipcRenderer.send("refresh-daily"),
    getTickers: (listType) => ipcRenderer.invoke("get-tickers", listType),
    onTickerUpdate: (callback) => ipcRenderer.on("lists-updated", callback),
    applyFilters: (min, max) => ipcRenderer.send("apply-filters", { min, max }),
    onNewsUpdate: (callback) => ipcRenderer.on("news-updated", (event, data) => callback(data)),
});

contextBridge.exposeInMainWorld("focusAPI", {
    toggle: () => ipcRenderer.send("toggle-focus"),
    refresh: () => ipcRenderer.send("refresh-focus"),
    getTickers: (listType) => ipcRenderer.invoke("get-tickers", listType),
    onTickerUpdate: (callback) => ipcRenderer.on("lists-updated", callback),
    applyFilters: (min, max) => ipcRenderer.send("apply-filters", { min, max }),
    onNewsUpdate: (callback) => ipcRenderer.on("news-updated", (event, data) => callback(data)),
    onFocusEvents: (callback) => ipcRenderer.on("ws-events", (event, data) => callback(data)),
    getSymbols: () => ipcRenderer.invoke("get-all-symbols"),
    calculateVolumeImpact: (volume, price) => ipcRenderer.invoke("calculate-volume-impact", { volume, price }),
});

// contextBridge.exposeInMainWorld("sessionAPI", {
//     toggle: () => ipcRenderer.send("toggle-live"),
//     reCreate: () => ipcRenderer.send("recreate-live"),
//     getTickers: (listType) => ipcRenderer.invoke("get-tickers", listType),
//     onTickerUpdate: (callback) => ipcRenderer.on("lists-updated", callback),
//     clearSession: () => ipcRenderer.send("clear-live"),
//     onSessionCleared: (callback) => ipcRenderer.on("live-cleared", callback),
//     applyFilters: (min, max) => ipcRenderer.send("apply-filters", { min, max }),
//     onNewsUpdate: (callback) => ipcRenderer.on("news-updated", (event, data) => callback(data)),
// });

contextBridge.exposeInMainWorld("newsAPI", {
    get: () => ipcRenderer.invoke("get-all-news"),
    toggle: () => ipcRenderer.send("toggle-news"),
    onUpdate: (callback) => ipcRenderer.on("news-updated", callback),
    setBounds: (bounds) => ipcRenderer.send("set-window-bounds", bounds),
});

// Modern

contextBridge.exposeInMainWorld("storeAPI", {
    getSymbols: () => ipcRenderer.invoke("get-all-symbols"),
    getSymbol: (symbol) => ipcRenderer.invoke("get-symbol", symbol),
    getTickers: (listType = "session") => ipcRenderer.invoke("get-tickers", listType),
    getAllNews: () => ipcRenderer.invoke("get-all-news"),
    getTickerNews: (ticker) => ipcRenderer.invoke("get-news", ticker),

    onUpdate: (callback) => ipcRenderer.on("lists-updated", callback),
    onNewsUpdate: (callback) => ipcRenderer.on("news-updated", (event, data) => callback(data)),
    onBuffsUpdate: (callback) =>
        ipcRenderer.on("buffs-updated", (event, data) => {
            callback(data.symbols || []);
        }),
});

contextBridge.exposeInMainWorld("eventsAPI", {
    activate: () => ipcRenderer.send("activate-events"),
    deactivate: () => ipcRenderer.send("deactivate-events"),
    onAlert: (callback) => ipcRenderer.on("ws-alert", (_, data) => callback(data)),
    onAlertEvents: (callback) => ipcRenderer.on("ws-events", (event, data) => callback(data)),
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
