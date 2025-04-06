const { BrowserWindow } = require("electron");
const path = require("path");

let miniWidgetWindow = null;

function createMiniWidgetWindow(symbol = "NASDAQ:AAPL") {
    if (miniWidgetWindow) {
        miniWidgetWindow.close();
    }

    miniWidgetWindow = new BrowserWindow({
        width: 400,
        height: 300,
        frame: false,
        alwaysOnTop: false,
        resizable: true,
        transparent: false,
        hasShadow: false,
        backgroundColor: "#00000000",
        webPreferences: {
            contextIsolation: true,
        },
    });

    const filePath = path.join(__dirname, "../../renderer/traderview/traderview-widget.html");
    miniWidgetWindow.loadFile(filePath, {
        query: { symbol }
    });

    miniWidgetWindow.on("closed", () => {
        miniWidgetWindow = null;
    });

    return miniWidgetWindow;
}

module.exports = { createMiniWidgetWindow };
