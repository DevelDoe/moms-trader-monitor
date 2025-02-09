const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    closeSplash: () => ipcRenderer.send("close-splash"),
    toggleTop: () => ipcRenderer.send("toggle-top"),    
    exitApp: () => ipcRenderer.send("exit-app"),
    getTickers: () => ipcRenderer.invoke("get-tickers"), // ✅ Fetch stored tickers
    onTickerUpdate: (callback) => ipcRenderer.on("tickers-updated", callback), // ✅ Notify views when new data is available
});