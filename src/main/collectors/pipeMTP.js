// pipeMTP.js
const net = require("net");
const log = require("../../hlps/logger")(__filename);
const { windows } = require("../windowManager");
const tickerStore = require("../store");

const PIPE_NAME = "\\\\.\\pipe\\mtp_pipe";

let lastSymbolUpdate = "";
let lastUpdateTime = 0;
const SYMBOL_UPDATE_EXPIRY_MS = 60 * 1000;
const messageQueue = [];

function safeParse(data) {
    try {
        const clean = data.toString().replace(/[^\x20-\x7F]/g, "");
        return JSON.parse(clean);
    } catch (err) {
        log.error("[pipeMTP] Failed to parse:", data.toString());
        return null;
    }
}

function handleMessage(msg) {
    if (msg.type === "ping") {
        log.log("[pipeMTP] Received ping (ignored)");
        return;
    }

    if (msg.type === "alert" && msg.data) {
        tickerStore.addEvent(msg.data);

        // 🔍 Log the raw alert before transform
        // log.log("[pipeMTP] Incoming alert payload:", JSON.stringify(msg.data));

        const event = transformEvent(msg.data);
        if (!event || typeof event.price !== "number" || typeof event.hero !== "string") {
            log.warn("[pipeMTP] Dropped malformed event:", event);
            return;
        }

        const windowsList = ["scanner", "heroes", "frontline", "progress"];
        windowsList.forEach((winKey) => {
            const win = windows[winKey];
            if (win?.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send("ws-events", [event]);
                if (winKey === "scanner") {
                    win.webContents.send("ws-alert", msg.data);
                }
            } else if (winKey === "scanner") {
                messageQueue.push(msg.data);
            }
        });
    }

    if (msg.type === "symbol_update" && msg.data?.symbols) {
        const newUpdate = JSON.stringify(msg.data.symbols);
        const now = Date.now();

        if (newUpdate === lastSymbolUpdate && now - lastUpdateTime < SYMBOL_UPDATE_EXPIRY_MS) {
            log.log("[pipeMTP] Skipping duplicate symbol update");
            return;
        }

        lastSymbolUpdate = newUpdate;
        lastUpdateTime = now;

        log.log("[pipeMTP] Triggering fetch from server (debounced)");
        debouncedFetchSymbols(); // reuses your existing debounce logic
    }
}

function connectToPipe(retries = 10, delay = 1000) {
    console.log(`[pipeMTP.js] 🔌 Trying to connect to pipe: ${PIPE_NAME}`);

    let attempt = 0;

    function tryConnect() {
        const pipe = net.createConnection(PIPE_NAME);

        pipe.on("connect", () => {
            console.log("[pipeMTP.js] ✅ Connected to native MTP collector");
            setupPipeListeners(pipe);
        });

        pipe.on("error", (err) => {
            if (err.code === "ENOENT" && attempt < retries) {
                attempt++;
                console.warn(`[pipeMTP.js] 🕐 Pipe not ready. Retrying in ${delay}ms...`);
                setTimeout(tryConnect, delay);
            } else {
                console.error("[pipeMTP.js] ❌ Pipe error:", err.message);
            }
        });
    }

    tryConnect();
}

function setupPipeListeners(pipe) {
    pipe.on("data", (chunk) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        lines.forEach((line) => {
            try {
                const msg = safeParse(line);
                handleMessage(msg);
            } catch (err) {
                console.warn("[pipeMTP.js] ❌ Failed to parse pipe message:", err.message, line);
            }
        });
    });

    pipe.on("end", () => {
        console.warn("[pipeMTP.js] ⚠️ Pipe closed. Restart the collector to reconnect.");
    });
}

function transformEvent(alert) {
    if (!alert || typeof alert.symbol !== "string" || typeof alert.price !== "number" || typeof alert.direction !== "string" || isNaN(alert.price) || !isFinite(alert.price)) {
        log.warn("[pipeMTP] Skipping malformed alert:", alert);
        return null;
    }

    const isUp = alert.direction.toUpperCase() === "UP";
    const change = Math.abs(alert.change_percent || 0);

    // log.log(`[transformEvent] ${alert.symbol} → str: ${alert.last_trade}, str1: ${alert.volume_1min}, str5: ${alert.volume_5min}`);

    return {
        hero: alert.symbol,
        hp: isUp ? change : 0,
        dp: isUp ? 0 : change,
        strength: alert.volume,
        price: alert.price,
        str: alert.last_trade,
        str1: alert.volume_1min,
        str5: alert.volume_5min,
    };
}

connectToPipe(); // 🔥
