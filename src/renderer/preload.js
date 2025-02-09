const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    closeSplash: () => ipcRenderer.send("close-splash"),
    toggleTop: () => ipcRenderer.send("toggle-top"),    
    exitApp: () => ipcRenderer.send("exit-app"),
});

contextBridge.exposeInMainWorld("electronTop", {
    onWebSocketMessage: (callback) => ipcRenderer.on("new-ticker-entries", (_, data) => callback(data)), // ✅ Listen for WebSocket messages
});