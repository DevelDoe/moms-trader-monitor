const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    closeSplash: () => ipcRenderer.send("close-splash"),
    exitApp: () => ipcRenderer.send("exit-app"),
});

contextBridge.exposeInMainWorld("topAPI", {
    toggle: () => ipcRenderer.send("toggle-top"),
    refresh: () => ipcRenderer.send("refresh-top"),
    getTickers: (listType) => ipcRenderer.invoke("get-tickers", listType),
    onTickerUpdate: (callback) => ipcRenderer.on("tickers-updated", callback),
    clearSession: () => ipcRenderer.send("clear-session"),
    onSessionCleared: (callback) => ipcRenderer.on("session-cleared", callback),
    applyFilters: (min, max) => ipcRenderer.send("apply-filters", { min, max }),
    onNewsUpdate: (callback) => ipcRenderer.on("news-updated", (event, data) => callback(data)),
});

contextBridge.exposeInMainWorld("activeAPI", {
    toggle: () => ipcRenderer.send("toggle-active"),
    setActiveTicker: (ticker) => ipcRenderer.send("set-active-ticker", ticker),
    onActiveTickerUpdate: (callback) => {
        ipcRenderer.on("update-active-ticker", (event, ticker) => {
            callback(ticker);
        });
    },
});

contextBridge.exposeInMainWorld("newsAPI", {
    get: () => ipcRenderer.invoke("get-all-news"),
    toggle: () => ipcRenderer.send("toggle-news"),
    onUpdate: (callback) => ipcRenderer.on("news-updated", callback),
    setBounds: (bounds) => ipcRenderer.send("set-window-bounds", bounds),
});

contextBridge.exposeInMainWorld("scannerAPI", {
    toggle: () => ipcRenderer.send("toggle-scanner"),
    onAlert: (callback) => ipcRenderer.on('ws-alert', (_, data) => callback(data)),
});


contextBridge.exposeInMainWorld("settingsAPI", {
    toggle: () => ipcRenderer.send("toggle-settings"),
    get: () => ipcRenderer.invoke("get-settings"),
    update: (settings) => ipcRenderer.send("update-settings", settings),
    getAttributes: (listType) => ipcRenderer.invoke("get-attributes", listType),
    onAttributesUpdate: (callback) =>
        ipcRenderer.on("tickers-updated", () => {
            console.log("🔄 Attributes updated, refreshing settings...");
            callback();
        }),
    onUpdate: (callback) => ipcRenderer.on("settings-updated", (_, updatedSettings) => callback(updatedSettings)),
});
