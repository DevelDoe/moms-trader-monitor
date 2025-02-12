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
    onFilterUpdate: (callback) => ipcRenderer.on("filter-updated", callback),
});

contextBridge.exposeInMainWorld("newsAPI", {
    get: () => ipcRenderer.invoke("get-all-news"),
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


