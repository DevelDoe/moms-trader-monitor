// ──────────────────────────────────────────────────────────────────────────────
// HOD Toplist — Complete list from backend, simple, reliable (subscribe-first)
// ──────────────────────────────────────────────────────────────────────────────

/* 0) Helpers */
const up = (s) =>
    String(s || "")
        .replace(/^\$+/, "")
        .trim()
        .toUpperCase();
const clamp = (n, mi, ma) => Math.max(mi, Math.min(ma, n));
const formatPrice = (n) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : "—");
function silverTone(pctBelowHigh) {
    const pct = Number.isFinite(pctBelowHigh) ? pctBelowHigh : 1;
    const closeness = clamp(1 - pct, 0, 1);

    const sat = Math.round(45 + 40 * closeness); // 45–85%
    const light = Math.round(55 + 25 * closeness); // 55–80% → lighter base
    const alpha = 0.35 + 0.35 * closeness; // 0.35–0.7 opacity

    return `hsla(210, ${sat}%, ${light}%, ${alpha.toFixed(2)})`;
}
const symbolColors = {};
function getSymbolColor(sym) {
    if (!symbolColors[sym]) {
        const hash = [...sym].reduce((a, c) => a + c.charCodeAt(0), 0);
        symbolColors[sym] = `hsla(${(hash * 37) % 360},80%,50%,0.5)`;
    }
    return symbolColors[sym];
}

/* 1) Config (hardcoded; volumes from settingsAPI.hod) */
const GOLD_HEX = "#ffd24a";
const AT_HIGH_EPS = 0.01;

// was 0.25
const HOD_BASE_AT3 = 0.3; // wider proximity window everywhere (drives both blink + audio)
const HOD_EXP = 0.5;
const HOD_MIN = 0.05;
const HOD_MAX = 3.0;
let HOD_ZONE_SCALE = 1.0;

const MOVE_FLASH_MS = 1000;

window.MIN_AUDIO_INTERVAL_MS ??= 80;
window.lastAudioTime ??= 0;

// HOD_EVICT_MS handled by backend
const HOD_SYMBOL_LENGTH_DEFAULT = 50; // default rows to show

// --- Stability knobs ---
const RENDER_THROTTLE_MS = 100; // min ms between paints (was 200)

/* 2) HOD math */
function hodThresholdUSDFromPrice(price) {
    if (!isFinite(price) || price <= 0) return HOD_BASE_AT3;
    const k = HOD_BASE_AT3 / Math.pow(3, HOD_EXP);
    let th = HOD_ZONE_SCALE * k * Math.pow(price, HOD_EXP);
    if (price < 2) th *= 0.8;
    if (price > 12) th *= 0.9;
    if (price > 20) th *= 0.8;
    return clamp(th, HOD_MIN, HOD_MAX);
}

/* 3) Audio (volumes from settings) */
let audioReady = false;
let magicBase, ticksBase;

// Tick loudness shaping
const TICK_VOL_FLOOR = 0.15; // 0..1 fraction of user volume at the window edge
const TICK_VOL_EASE = 0.6; // <1 = earlier loudness (perceptual boost)

const HOD_CHIME_VOL_DEFAULT = 0.5;
const TICK_VOL_DEFAULT = 0.06;

// --- Chime limiter ---
const HOD_CHIME_COOLDOWN_MS = 2000; // per-symbol: same symbol max 1 per 2s
const BURST_WINDOW_MS = 600; // global window to measure bursts
const BURST_MAX_IN_WINDOW = 3; // allow up to 3 chimes per 600ms (any symbols)

// per-symbol last chime
const lastHodChimeAt = new Map();

// global sliding window timestamps (most recent first)
const burstTimes = []; // array of ms timestamps

function canEmitBurst(now) {
    // drop entries older than BURST_WINDOW_MS
    while (burstTimes.length && now - burstTimes[burstTimes.length - 1] > BURST_WINDOW_MS) {
        burstTimes.pop();
    }
    if (burstTimes.length >= BURST_MAX_IN_WINDOW) return false;
    burstTimes.unshift(now);
    return true;
}

function shouldPlayHodChime(sym) {
    const now = Date.now();

    // global burst limiter (across all symbols)
    if (!canEmitBurst(now)) return false;

    // per-symbol cooldown
    const last = lastHodChimeAt.get(sym) || 0;
    if (now - last < HOD_CHIME_COOLDOWN_MS) return false;

    lastHodChimeAt.set(sym, now);
    return true;
}

// ---- Tick limiter (bursty but bounded) ----
const TICK_COOLDOWN_MS = 120; // per-symbol min gap
const TICK_BURST_WINDOW_MS = 500; // global burst window
const TICK_BURST_MAX = 6; // max ticks allowed in window

const lastTickAt = new Map(); // per-symbol last tick time
const tickBurstTimes = []; // global sliding window (most-recent-first)

function canEmitTickBurst(now) {
    while (tickBurstTimes.length && now - tickBurstTimes[tickBurstTimes.length - 1] > TICK_BURST_WINDOW_MS) {
        tickBurstTimes.pop();
    }
    if (tickBurstTimes.length >= TICK_BURST_MAX) return false;
    tickBurstTimes.unshift(now);
    return true;
}

function shouldPlayTick(sym) {
    const now = Date.now();
    if (!canEmitTickBurst(now)) return false; // global burst control
    const last = lastTickAt.get(sym) || 0; // per-symbol cooldown
    if (now - last < TICK_COOLDOWN_MS) return false;
    lastTickAt.set(sym, now);
    return true;
}

function setupAudio() {
    if (magicBase && ticksBase) return;
    magicBase = new Audio("./magic.mp3");
    ticksBase = new Audio("./ticks.mp3");
    [magicBase, ticksBase].forEach((a) => {
        a.preload = "auto";
        a.addEventListener("error", () => {});
        a.addEventListener("canplaythrough", () => {});
    });
    audioReady = true;

    // Optimized warm-up without setTimeout
    try {
        const warm = ticksBase.cloneNode();
        warm.muted = true;
        warm.currentTime = 0;
        warm.play()
            .then(() => {
                warm.pause();
                warm.remove();
            })
            .catch(() => {
                audioReady = false;
                const unlock = () => {
                    audioReady = true;
                    ["pointerdown", "keydown"].forEach((ev) => window.removeEventListener(ev, unlock, true));
                };
                ["pointerdown", "keydown"].forEach((ev) => window.addEventListener(ev, unlock, { once: true, capture: true }));
            });
    } catch {}
}

function getChimeVol(settings) {
    const v = Number(settings?.chimeVolume);
    return Number.isFinite(v) ? v : HOD_CHIME_VOL_DEFAULT;
}
function getTickVol(settings) {
    const v = Number(settings?.tickVolume);
    return Number.isFinite(v) ? v : TICK_VOL_DEFAULT;
}
function play(base, vol) {
    if (!audioReady) return;
    const now = Date.now();
    if (now - (window.lastAudioTime || 0) < window.MIN_AUDIO_INTERVAL_MS) return;
    const a = base.cloneNode();
    if (!a.src) a.src = base.src;
    a.volume = clamp(vol, 0, 1);
    a.currentTime = 0;
    a.play().catch(() => {});
    window.lastAudioTime = now;
}
function simulateFirstGesture(delayMs = 400) {
    setupAudio();
    setTimeout(() => {
        try {
            window.focus();
            document.body?.focus?.();
        } catch {}
        const pd = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, isPrimary: true });
        window.dispatchEvent(pd);
        document.dispatchEvent(pd);
        document.body?.dispatchEvent(pd);
        const kd = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " });
        window.dispatchEvent(kd);
        document.dispatchEvent(kd);
        document.body?.dispatchEvent(kd);
    }, delayMs);
}

/* 4) View state (small, KISS) */
const state = {
    hodTopList: [], // Complete HOD list from backend
    previousHodList: [], // Previous HOD list for comparison
    settings: {}, // volumes only
    hodSettings: { listLength: HOD_SYMBOL_LENGTH_DEFAULT }, // HOD-specific settings
    renderKey: "",
    lastRenderAt: 0,
};

function getHodListLength() {
    return state.hodSettings?.listLength || HOD_SYMBOL_LENGTH_DEFAULT;
}

// Calculate rank changes between current and previous HOD list
function calculateRankChanges(currentList, previousList) {
    const changes = new Map();
    
    // Create maps for quick lookup
    const currentRanks = new Map();
    const previousRanks = new Map();
    
    currentList.forEach((item, index) => {
        const symbol = up(item.symbol || item.name || '');
        if (symbol) currentRanks.set(symbol, index);
    });
    
    previousList.forEach((item, index) => {
        const symbol = up(item.symbol || item.name || '');
        if (symbol) previousRanks.set(symbol, index);
    });
    
    // Calculate changes
    currentRanks.forEach((currentRank, symbol) => {
        const previousRank = previousRanks.get(symbol);
        if (previousRank !== undefined) {
            const change = previousRank - currentRank; // Positive = moved up, Negative = moved down
            changes.set(symbol, change);
        } else {
            changes.set(symbol, 'new'); // New symbol in list
        }
    });
    
    return changes;
}

function markDirty(forceRender = false) {
    const now = Date.now();
    const since = now - (state.lastRenderAt || 0);
    
    // Simple throttling - only render every 1000ms max to prevent chaos
    // But allow forced renders for price updates
    if (forceRender || since >= 1000) {
        state.lastRenderAt = now;
        render();
    }
}


/* 5) Render */
function render() {
    const container = document.getElementById("hod-scroll");
    if (!container) return;

    const renderTime = new Date().toLocaleTimeString();
    console.log(`🎯 HOD render called at ${renderTime} with ${state.hodTopList.length} symbols`);
    
    // Debug: Log first few items to see current prices
    if (state.hodTopList.length > 0) {
        console.log("🎯 HOD render - first 3 items:", state.hodTopList.slice(0, 3).map(item => ({
            symbol: item.symbol || item.name,
            price: item.price,
            session_high: item.session_high,
            pct_below_high: item.pct_below_high
        })));
        
        // Debug: Find DNTH in the list to see its position and data
        const dnthItem = state.hodTopList.find(item => up(item.symbol || item.name) === 'DNTH');
        if (dnthItem) {
            const dnthIndex = state.hodTopList.findIndex(item => up(item.symbol || item.name) === 'DNTH');
            console.log(`🎯 DNTH found at position ${dnthIndex + 1}:`, {
                symbol: dnthItem.symbol || dnthItem.name,
                price: dnthItem.price,
                session_high: dnthItem.session_high,
                pct_below_high: dnthItem.pct_below_high
            });
        } else {
            console.log("🎯 DNTH not found in HOD list");
        }
    }

    // Use the complete list from backend - already sorted and filtered
    const display = state.hodTopList.slice(0, getHodListLength());

    // Safety check - don't render if no valid data
    if (display.length === 0) {
        container.innerHTML = '<div class="xp-line">No active symbols</div>';
        return;
    }

    // need timestamp before checking windows
    const now = Date.now();
    const needMovePaint = display.some((t) => now - (t.lastMoveAt || 0) < MOVE_FLASH_MS);

    // Simple innerHTML update - much faster
    container.innerHTML = display
        .map((t, index) => {
            const symbol = t.symbol || t.name || "Unknown";
            const price = t.price || 0;
            const sessionHigh = t.session_high || t.sessionHigh || price;
            const pctBelowHigh = t.pct_below_high || t.pctBelowHigh || 0;
            
            const diffUSD = Math.max(0, sessionHigh - price);
            const thr = hodThresholdUSDFromPrice(price || sessionHigh || 0);
            const atHigh = diffUSD <= AT_HIGH_EPS;
            const within = diffUSD > AT_HIGH_EPS && diffUSD <= thr;
            const blinkClass = within ? "blinking" : "";
            const isMoving = now - (t.lastMoveAt || 0) < MOVE_FLASH_MS;
            const dirClass = isMoving ? (t.lastPriceDir > 0 ? "moving-up" : t.lastPriceDir < 0 ? "moving-down" : "") : "";
            
            // Get rank change indicator and animation class
            const rankChange = calculateRankChanges(state.hodTopList, state.previousHodList).get(up(symbol));
            let rankIndicator = '';
            let animationClass = '';
            let rankClass = '';
            
            if (rankChange === 'new') {
                rankIndicator = '<span class="rank-indicator new" title="New in list">🆕</span>';
                animationClass = 'new-position';
                rankClass = 'changed';
            } else if (rankChange > 0) {
                rankIndicator = `<span class="rank-indicator up" title="Moved up ${rankChange} positions">↑${rankChange}</span>`;
                animationClass = 'moving-up';
                rankClass = 'changed';
            } else if (rankChange < 0) {
                rankIndicator = `<span class="rank-indicator down" title="Moved down ${Math.abs(rankChange)} positions">↓${Math.abs(rankChange)}</span>`;
                animationClass = 'moving-down';
                rankClass = 'changed';
            } else if (rankChange === 0) {
                rankIndicator = '<span class="rank-indicator same" title="No change">•</span>';
            }

            return `
  <div class="xp-line ellipsis ${isMoving ? "moving" : ""} ${dirClass} ${animationClass}" data-ath="${atHigh ? 1 : 0}">
    <span class="rank ${rankClass}">${index + 1}</span>
    ${rankIndicator}
    <strong class="symbol" style="background:${getSymbolColor(symbol)};">${symbol}</strong>
    <span class="prices">
      <span class="price now ${blinkClass}" style="color:${silverTone(pctBelowHigh)};">
        ${formatPrice(price)}
      </span>
      <span class="dot"> </span>
      <span class="price high" style="color:${GOLD_HEX};">
        ${formatPrice(sessionHigh)}
      </span>
    </span>
  </div>`;
        })
        .join("");

    // one delegated click handler
    if (!container.__boundClick) {
        container.__boundClick = true;
        container.addEventListener("click", async (e) => {
            const el = e.target.closest(".symbol");
            if (!el) return;
            const symbol = el.textContent.trim().replace("$", "");
            try {
                await navigator.clipboard.writeText(symbol);
                window.activeAPI?.setActiveTicker?.(symbol);
            } catch {}
            e.stopPropagation();
        });
    }
}


/* 6) Housekeeping - handled by backend */

/* 7) Boot */
document.addEventListener("DOMContentLoaded", async () => {
    console.log("🎯 HOD window loaded, waiting for APIs...");
    
    // Wait for bridges
    while (!(window.settingsAPI && window.xpAPI && window.eventsAPI && window.electronAPI && window.hodSettingsAPI)) {
        await new Promise((r) => setTimeout(r, 200));
    }
    
    console.log("🎯 HOD window APIs ready, initializing...");

    // Load HOD settings from electron store
    try {
        const hodSettings = await window.hodSettingsAPI.get();
        state.hodSettings = hodSettings || { listLength: HOD_SYMBOL_LENGTH_DEFAULT };
    } catch (error) {
        state.hodSettings = { listLength: HOD_SYMBOL_LENGTH_DEFAULT };
    }
    
    // Subscribe to HOD settings updates
    window.hodSettingsAPI.onUpdate(async (updated) => {
        state.hodSettings = updated || { listLength: HOD_SYMBOL_LENGTH_DEFAULT };
        
        // Trigger re-render if symbol length changed
        if (updated?.listLength !== undefined) {
            markDirty();
        }
    });



    // Make content clickable in frameless windows
    try {
        document.body.style["-webkit-app-region"] = "no-drag";
    } catch {}

    // Audio boot + best-effort unlock
    setupAudio();
    if (!sessionStorage.getItem("hod:simulatedOnce")) {
        sessionStorage.setItem("hod:simulatedOnce", "1");
        simulateFirstGesture(200);
    }

    // Get initial HOD list from tickerStore
    try {
        const initialHodList = await window.scrollHodAPI.getHodTopList();
        if (initialHodList && Array.isArray(initialHodList) && initialHodList.length > 0) {
            state.hodTopList = initialHodList;
            // Force immediate render for initial data load (bypass throttling)
            state.lastRenderAt = 0; // Reset throttling
            markDirty();
        }
    } catch (error) {
        console.warn("⚠️ Failed to load initial HOD list from tickerStore:", error);
    }

    // Subscribe to HOD top list updates from backend
    const unsubscribeHodList = window.scrollHodAPI.onHodTopListUpdate((data) => {
        console.log("🎯 HOD window received real-time update:", data?.length || 0, "symbols");
        console.log("🎯 HOD window received data type:", typeof data);
        console.log("🎯 HOD window received data:", data);
        
        if (!data || !Array.isArray(data)) {
            console.warn("⚠️ HOD window received invalid data:", data);
            return; // Ignore invalid data
        }
        
        // Log first few items to see the data
        console.log("🎯 HOD update data sample:", data.slice(0, 3));
        
        // Store previous list for comparison
        state.previousHodList = [...state.hodTopList];
        state.hodTopList = data;
        console.log("🎯 HOD window updated state.hodTopList to:", state.hodTopList.length, "symbols");
        
        // Force immediate render for HOD list updates (bypass throttling)
        state.lastRenderAt = 0;
        markDirty();
    });

    // Subscribe to HOD price updates from backend
    const unsubscribeHodPriceUpdate = window.scrollHodAPI.onHodPriceUpdate((priceData) => {
        console.log("💰 HOD window received price update:", priceData);
        console.log("💰 Current HOD list length:", state.hodTopList.length);
        console.log("💰 Current HOD list symbols:", state.hodTopList.map(item => up(item.symbol || item.name)).slice(0, 5));
        
        if (!priceData || !priceData.symbol && !priceData.name) {
            console.warn("⚠️ HOD window received invalid price data:", priceData);
            return; // Ignore invalid data
        }
        
        const symbol = up(priceData.symbol || priceData.name);
        if (!symbol) {
            console.warn("⚠️ HOD window received price update with no valid symbol:", priceData);
            return;
        }
        
        console.log(`💰 Looking for symbol: ${symbol} in HOD list`);
        
        // Find the symbol in our current HOD list and update its price
        const hodItem = state.hodTopList.find(item => up(item.symbol || item.name) === symbol);
        if (hodItem) {
            console.log(`💰 Found ${symbol} in HOD list. Current price: $${hodItem.price}, New price: $${priceData.price}`);
            
            // Update price and related fields
            if (Number.isFinite(priceData.price)) {
                const oldPrice = hodItem.price;
                hodItem.price = priceData.price;
                hodItem.lastMoveAt = Date.now();
                
                // Update session high if provided and higher than current
                if (Number.isFinite(priceData.session_high) && priceData.session_high > (hodItem.session_high || 0)) {
                    hodItem.session_high = priceData.session_high;
                }
                
                // Update percentage below high if provided
                if (Number.isFinite(priceData.pct_below_high)) {
                    hodItem.pct_below_high = priceData.pct_below_high;
                } else if (Number.isFinite(hodItem.session_high) && hodItem.session_high > 0) {
                    // Calculate percentage below high if not provided
                    hodItem.pct_below_high = ((hodItem.session_high - hodItem.price) / hodItem.session_high) * 100;
                }
                
                // Update at_high flag if provided
                if (typeof priceData.at_high === 'boolean') {
                    hodItem.at_high = priceData.at_high;
                }
                
                // Update last_updated timestamp if provided
                if (Number.isFinite(priceData.last_updated)) {
                    hodItem.last_updated = priceData.last_updated;
                }
                
                console.log(`💰 Updated ${symbol} price from $${oldPrice} to $${priceData.price} (${hodItem.pct_below_high?.toFixed(2)}% below high)`);
                console.log(`💰 Triggering FORCED render for price update...`);
                
                // Force immediate render for price updates (bypass throttling)
                markDirty(true);
            } else {
                console.warn(`💰 Invalid price data for ${symbol}:`, priceData.price);
            }
        } else {
            console.log(`💰 Price update for ${symbol} - not in current HOD list`);
            console.log(`💰 Available symbols:`, state.hodTopList.map(item => up(item.symbol || item.name)).join(', '));
        }
    });

    // Cleanup function to unsubscribe when page unloads
    const cleanup = () => {
        if (typeof unsubscribeHodList === 'function') {
            unsubscribeHodList();
        }
        if (typeof unsubscribeHodPriceUpdate === 'function') {
            unsubscribeHodPriceUpdate();
        }
    };

    // Register cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('unload', cleanup);

    // Audio handling for HOD events + price updates
    window.eventsAPI.onAlert((p = {}) => {
        if (!p || !p.hero) return; // Ignore invalid alerts
        const sym = up(p.hero);
        
        // Check if this symbol is in our current HOD list
        const hodItem = state.hodTopList.find(item => up(item.symbol || item.name) === sym);
        if (!hodItem) return;

        // Update price in HOD list
        if (Number.isFinite(p.price)) {
            hodItem.price = p.price;
            hodItem.lastMoveAt = Date.now();
            hodItem.lastPriceDir = p.hp > 0 ? 1 : p.dp > 0 ? -1 : 0;
            
            // Calculate percentage below high
            if (Number.isFinite(hodItem.session_high) && hodItem.session_high > 0) {
                hodItem.pct_below_high = ((hodItem.session_high - hodItem.price) / hodItem.session_high) * 100;
            }
            
            // Force immediate render for price updates (bypass throttling)
            state.lastRenderAt = 0;
            markDirty();
        }

        // Simple audio handling based on alert data
        const isHOD = p.isHighOfDay === true;
        const isUptick = Number.isFinite(p.hp) && p.hp > 0;
        
        if (isHOD && shouldPlayHodChime(sym)) {
            play(magicBase, getChimeVol(state.settings));
        } else if (isUptick && shouldPlayTick(sym)) {
            // Use a default proximity for tick volume
            const user = clamp(getTickVol(state.settings), 0, 1);
            const vol = clamp(user * 0.5, 0, 1); // Default 50% volume for ticks
            play(ticksBase, vol);
        }
    });

    // Nuke resets HOD list
    window.electronAPI.onNukeState?.(() => {
        state.hodTopList = [];
        state.previousHodList = [];
        state.renderKey = "";
        const container = document.getElementById("hod-scroll");
        if (container) container.innerHTML = "";
        markDirty();
    });

    // First paint
    markDirty();
});

/* 8) Production helpers */
// Minimal test functions for production use
window.hodTickTest = (p = 0.0) => {
    const user = clamp(getTickVol(state.settings), 0, 1);
    const eased = Math.pow(clamp(p, 0, 1), TICK_VOL_EASE);
    const shaped = TICK_VOL_FLOOR + (1 - TICK_VOL_FLOOR) * eased;
    const vol = clamp(user * shaped, 0, 1);
    play(ticksBase, vol);
};

window.hodChimeTest = () => {
    const vol = getChimeVol(state.settings);
    play(magicBase, vol);
};

// IPC listeners for audio test commands
if (window.ipcListenerAPI) {
    window.ipcListenerAPI.onTestChimeAlert(() => {
        window.hodChimeTest();
    });

    window.ipcListenerAPI.onTestTickAlert(() => {
        window.hodTickTest(0.5);
    });
}

// Test function for price updates - call from browser console
window.testHodPriceUpdate = (symbol, newPrice) => {
    console.log(`🧪 Testing price update for ${symbol} to $${newPrice}`);
    
    if (!symbol || !newPrice) {
        console.log("Usage: testHodPriceUpdate('SYMBOL', newPrice)");
        console.log("Example: testHodPriceUpdate('AAPL', 150.25)");
        return;
    }
    
    // Find the symbol in the HOD list
    const hodItem = state.hodTopList.find(item => up(item.symbol || item.name) === up(symbol));
    if (hodItem) {
        const oldPrice = hodItem.price;
        hodItem.price = newPrice;
        hodItem.lastMoveAt = Date.now();
        
        // Recalculate percentage below high
        if (Number.isFinite(hodItem.session_high) && hodItem.session_high > 0) {
            hodItem.pct_below_high = ((hodItem.session_high - hodItem.price) / hodItem.session_high) * 100;
        }
        
        console.log(`🧪 Updated ${symbol} price from $${oldPrice} to $${newPrice}`);
        console.log(`🧪 Triggering FORCED render...`);
        
        // Force immediate render
        markDirty(true);
    } else {
        console.log(`🧪 Symbol ${symbol} not found in HOD list`);
        console.log(`🧪 Available symbols:`, state.hodTopList.map(item => up(item.symbol || item.name)).slice(0, 10).join(', '));
    }
};

// Helper function to find a symbol in the HOD list
window.findHodSymbol = (symbol) => {
    const searchSymbol = up(symbol);
    const hodItem = state.hodTopList.find(item => up(item.symbol || item.name) === searchSymbol);
    
    if (hodItem) {
        const index = state.hodTopList.findIndex(item => up(item.symbol || item.name) === searchSymbol);
        console.log(`🔍 Found ${searchSymbol} at position ${index + 1}:`, {
            symbol: hodItem.symbol || hodItem.name,
            price: hodItem.price,
            session_high: hodItem.session_high,
            pct_below_high: hodItem.pct_below_high,
            at_high: hodItem.at_high,
            last_updated: hodItem.last_updated
        });
        return hodItem;
    } else {
        console.log(`🔍 Symbol ${searchSymbol} not found in HOD list`);
        console.log(`🔍 Available symbols:`, state.hodTopList.map(item => up(item.symbol || item.name)).join(', '));
        return null;
    }
};


