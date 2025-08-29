const { ipcMain, BrowserWindow } = require("electron");
const { broadcast } = require("../utils/broadcast");

function setupStoreHandlers(tickerStore) {
    // Store data access
    ipcMain.handle("get-all-symbols", () => {
        return tickerStore.getAllSymbols();
    });

    ipcMain.handle("get-symbol", (event, symbol) => {
        return tickerStore.getSymbol(symbol);
    });

    ipcMain.handle("get-tickers", (event, listType = "session") => {
        return tickerStore.getAllSymbols();
    });

    ipcMain.handle("get-news", (event, ticker) => {
        return tickerStore.getTickerNews(ticker);
    });

    ipcMain.handle("get-all-news", () => {
        return tickerStore.getAllNews();
    });

    // News updates
    tickerStore.on("newsUpdated", (update) => {
        const { ticker, newsItems } = update;

        if (!Array.isArray(newsItems) || newsItems.length === 0) {
            console.warn(`❌ No news to broadcast for ticker: ${ticker}`);
            return; // Prevents unnecessary events
        }

        broadcast("news-updated", { newsItems });
    });

    tickerStore.on("lists-update", () => {
        broadcast("lists-updated");
    });

    // Live data management
    ipcMain.on("clear-live", () => {
        console.log("🔄 Received 'clear-live' event in main.js. ✅ CALLING STORE...");

        tickerStore.clearLiveData();

        setTimeout(() => {
            console.log("📢 Broadcasting clear live event to all windows... ✅");
            broadcast("live-cleared");
        }, 500); // ✅ Give store time to clear live
    });

    ipcMain.handle("fetch-news", async () => {
        tickerStore.fetchNews();
    });

    // Hero updates
    tickerStore.on("hero-updated", (payload = []) => {
        broadcast("hero-updated", payload);
    });

    // Store nuke functionality
    tickerStore.on("store-nuke", () => {
        console.log("💣 Nuke triggered by store");
        BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send("store:nuke");
        });

        // Give a brief moment for any cleanup/UI alerts, then restart
        setTimeout(() => {
            require("electron").app.relaunch();
            require("electron").app.exit(0);
        }, 100);
    });

    ipcMain.on("admin-nuke", () => {
        console.log("💣 Nuke state requested by renderer");
        tickerStore.nuke(); // << Trigger internal state reset
    });

    // Tracked tickers management
    ipcMain.handle("store:tracked:get", () => tickerStore.getTrackedTickers());
    ipcMain.handle("store:tracked:set", (_evt, list, maxLen = 25) => tickerStore.setTrackedTickers(list, maxLen));

    // Forward store events to renderers
    tickerStore.on("tracked-update", (list) => {
        broadcast("tracked-update", list);
    });

    // XP reset
    tickerStore.on("xp-reset", () => {
        console.log("📢 Broadcasting xp-reset to all windows");
        broadcast("xp-reset");
    });
}

module.exports = { setupStoreHandlers };
