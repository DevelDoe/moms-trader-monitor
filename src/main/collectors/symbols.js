// File: src/main/symbols.js
const createLogger = require("../hlps/logger");
const { createCdshClient } = require("./oracle");
const { loadCursor, saveCursor, buildEtagHeaders } = require("./arcane_api");
const symbolStore = require("../store");
const { windows } = require("../windowManager");

const log = createLogger(__filename);

function startCdsh() {
    const cdsh = createCdshClient({
        wsUrl: "ws://172.234.118.50/ws", // swap to wss://...:8443/ws if TLS
        apiBase: "http://172.232.139.89",
        getCursor: loadCursor,
        setCursor: saveCursor,
        mergeSymbols: (items) => {
            symbolStore.mergeSymbols(items);

            // Fan-out: keep it gentle (only push what each window needs)
            if (windows.scanner?.webContents && !windows.scanner.webContents.isDestroyed()) {
                windows.scanner.webContents.send("symbols-merge", items);
            }
            if (windows.frontline?.webContents && !windows.frontline.isDestroyed()) {
                windows.frontline.webContents.send("symbols-merge", items);
            }
        },
        applyFull: (items, version) => {
            symbolStore.applyFull(items, version);

            if (windows.scanner?.webContents && !windows.scanner.webContents.isDestroyed()) {
                windows.scanner.webContents.send("symbols-full", { items, version });
            }
            if (windows.frontline?.webContents && !windows.frontline.isDestroyed()) {
                windows.frontline.webContents.send("symbols-full", { version, count: items?.length || 0 });
            }
        },
        buildEtagHeaders,
        onResync: () => {
            log.warn("[cdsh] Forcing resync → notifying windows");
            if (windows.scanner?.webContents && !windows.scanner.webContents.isDestroyed()) {
                windows.scanner.webContents.send("symbols-resync");
            }
        },
        log,
        batchDebounceMs: 150,
    });

    // Optional: forward store events to windows (nice for lightweight signals)
    symbolStore.on("symbols:changed", (syms) => {
        if (windows.progress?.webContents && !windows.progress.isDestroyed()) {
            windows.progress.webContents.send("symbols-changed", syms);
        }
    });

    cdsh.open();
    return cdsh;
}

module.exports = { startCdsh };
