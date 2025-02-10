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
});

contextBridge.exposeInMainWorld("settingsAPI", {
    toggle: () => ipcRenderer.send("toggle-settings"),
    get: () => ipcRenderer.invoke("get-settings"),
    update: (settings) => ipcRenderer.send("update-settings", settings),
    onUpdate: (callback) => ipcRenderer.on("settings-updated", (_, updatedSettings) => callback(updatedSettings)),
});