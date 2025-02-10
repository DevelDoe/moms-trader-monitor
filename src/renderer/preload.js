const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    closeSplash: () => ipcRenderer.send("close-splash"),
    exitApp: () => ipcRenderer.send("exit-app"),
});

contextBridge.exposeInMainWorld("topAPI", {
    toggle: () => ipcRenderer.send("toggle-top"),
    refreshWindow: () => ipcRenderer.send("refresh-top"),
    getTickers: () => ipcRenderer.invoke("get-tickers"), 
    onTickerUpdate: (callback) => ipcRenderer.on("tickers-updated", callback),
});

contextBridge.exposeInMainWorld("settingsAPI", {
    toggle: () => ipcRenderer.send("toggle-settings"),
    getSettings: () => ipcRenderer.invoke("get-settings"),
    updateSettings: (settings) => ipcRenderer.send("update-settings", settings),
    onSettingsUpdated: (callback) => ipcRenderer.on("settings-updated", (_, updatedSettings) => callback(updatedSettings)),
});