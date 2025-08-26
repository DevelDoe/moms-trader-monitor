// ──────────────────────────────────────────────────────────────────────────────
// HOD Toplist — tracked-only, simple, reliable (subscribe-first)
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

const HOD_EVICT_MS = 60_000; // evict a row N ms after it hit HOD
const HOD_SYMBOL_LENGTH = 10; // rows to show
const PRICE_MOVE_EPS = 0; // any price change counts as movement

// --- Stability knobs ---
const EMA_ALPHA = 0.35; // 0..1, higher = snappier
const RANK_HYSTERESIS = 0.01; // need 1pp advantage to swap
const RENDER_THROTTLE_MS = 200; // min ms between paints

// Let brand-new HODs bypass hysteresis briefly
const HOT_HOD_MS = 1500; // ms after HOD to allow instant bubble-up

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

const HOD_CHIME_VOL_DEFAULT = 0.12;
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
        a.addEventListener("error", () => console.warn("[HOD] audio failed:", a.src));
    });
    audioReady = true;

    // warm-up muted; if blocked, unlock on first gesture
    try {
        const warm = ticksBase.cloneNode();
        warm.muted = true;
        warm.currentTime = 0;
        warm.play()
            .then(() =>
                setTimeout(() => {
                    try {
                        warm.pause();
                        warm.remove();
                    } catch {}
                }, 50)
            )
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
    const v = Number(settings?.hod?.chimeVolume);
    return Number.isFinite(v) ? v : HOD_CHIME_VOL_DEFAULT;
}
function getTickVol(settings) {
    const v = Number(settings?.hod?.tickVolume);
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
function simulateFirstGesture(delayMs = 800) {
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
    tickers: new Map(), // sym -> row
    tracked: [], // array of SYM (UPPERCASED)
    settings: {}, // volumes only
    renderKey: "",
    rafPending: false,
    prevOrder: [], // last displayed order of symbols
    lastRenderAt: 0,
    renderTimer: null,
};
const isTracked = (sym) => state.tracked.includes(up(sym));

function markDirty() {
    const now = Date.now();
    const since = now - (state.lastRenderAt || 0);

    // already scheduled
    if (state.renderTimer) return;

    if (since >= RENDER_THROTTLE_MS) {
        state.renderTimer = setTimeout(() => {
            state.renderTimer = null;
            state.lastRenderAt = Date.now();
            render();
        }, 0);
    } else {
        state.renderTimer = setTimeout(() => {
            state.renderTimer = null;
            state.lastRenderAt = Date.now();
            render();
        }, RENDER_THROTTLE_MS - since);
    }
}

/* 5) Render */
function render() {
    const container = document.getElementById("hod-scroll");
    if (!container) return;

    // tracked-only rows
    const items = [];
    for (const [, t] of state.tickers) {
        if (!isTracked(t.hero)) continue;
        if (!Number.isFinite(t.price) || !Number.isFinite(t.sessionHigh) || t.price <= 0 || t.sessionHigh <= 0) continue;
        items.push(t);
    }

    // 1) Ideal order by smoothed metric (fallback to raw), then recency
    const metric = (t) => {
        if (Number.isFinite(t.pctSmooth)) return t.pctSmooth;
        if (Number.isFinite(t.pctBelowHigh)) return t.pctBelowHigh;
        return 1; // worst
    };
    items.sort((a, b) => metric(a) - metric(b) || (b.lastUpdate ?? 0) - (a.lastUpdate ?? 0));
    const ideal = items.slice(0, HOD_SYMBOL_LENGTH);

    // 2) Stabilize: start from previous order, insert newcomers, then only allow a one-pass bubble-up
    //    if improvement exceeds RANK_HYSTERESIS
    const bySym = new Map(ideal.map((t) => [t.hero, t]));
    let stable = (state.prevOrder || []).filter((s) => bySym.has(s));
    if (!stable.length) stable = ideal.map((t) => t.hero);

    const isHot = (sym) => {
        const t = bySym.get(sym);
        return t?.hodAt && Date.now() - t.hodAt < HOT_HOD_MS;
    };

    // append newcomers (preserve ideal relative order)
    for (const t of ideal) {
        if (!stable.includes(t.hero)) stable.push(t.hero);
    }

    // one pass of guarded swaps (cheap and effective)
    for (let i = 1; i < stable.length; i++) {
        const aSym = stable[i - 1],
            bSym = stable[i];
        const a = bySym.get(aSym),
            b = bySym.get(bSym);
        if (!a || !b) continue;
        const aM = metric(a),
            bM = metric(b);

        // lower metric is better (closer to HOD). Only swap if b beats a by meaningful margin.
        if (isHot(bSym) || aM - bM > RANK_HYSTERESIS) {
            stable[i - 1] = bSym;
            stable[i] = aSym;
        }
    }

    // build display array in the stabilized order
    const display = stable.map((s) => bySym.get(s)).filter(Boolean);

    // need timestamp before checking windows
    const now = Date.now();
    const needMovePaint = display.some((t) => now - (t.lastMoveAt || 0) < MOVE_FLASH_MS);

    // keep order-only key, but don't bail if we must show the pulse
    const key = display.map((t) => t.hero).join("|") || "∅";
    if (state.renderKey && key === state.renderKey && !needMovePaint) return;
    state.renderKey = key;

    container.innerHTML = display
        .map((t, idx) => {
            const diffUSD = Math.max(0, (t.sessionHigh ?? 0) - (t.price ?? 0));
            const thr = hodThresholdUSDFromPrice((t.price ?? t.sessionHigh) || 0);

            const atHigh = diffUSD <= AT_HIGH_EPS;
            const within = diffUSD > AT_HIGH_EPS && diffUSD <= thr;
            const closeness = within ? clamp(1 - diffUSD / thr, 0, 1) : 0;

            const blinkClass = within ? "blinking" : "";
            const blinkSpeed = (1.0 - 0.75 * closeness).toFixed(2);
            const blinkStyle = within ? `animation-duration:${blinkSpeed}s;` : "";

            const isMoving = now - (t.lastMoveAt || 0) < MOVE_FLASH_MS;
            const elapsedMove = isMoving ? now - t.lastMoveAt : 0;
            const rowFlashVars = isMoving ? `--move-dur:${MOVE_FLASH_MS}ms; --move-delay:${-elapsedMove}ms;` : "";

            // pick direction class if we know it; otherwise no extra class
            const dirClass = isMoving ? (t.lastPriceDir > 0 ? "moving-up" : t.lastPriceDir < 0 ? "moving-down" : "") : "";

            return `
  <div class="xp-line ellipsis ${isMoving ? "moving" : ""} ${dirClass}" style="${rowFlashVars}" data-ath="${atHigh ? 1 : 0}">
    <strong class="symbol" style="background:${getSymbolColor(t.hero)};">${t.hero}</strong>

    <span class="prices">
      
      <span class="price now ${blinkClass}" style="${blinkStyle} color:${silverTone(t.pctBelowHigh)};">
        ${formatPrice(t.price)}
      </span>
      <span class="dot"> </span>
      <span class="price high" style="color:${GOLD_HEX};">
        ${formatPrice(t.sessionHigh)}
      </span>
    </span>
  </div>`;
        })
        .join("");

    state.prevOrder = display.slice(0, HOD_SYMBOL_LENGTH).map((t) => t.hero);

    // one delegated click handler
    if (!container.__boundClick) {
        container.__boundClick = true;
        container.addEventListener("click", async (e) => {
            const el = e.target.closest(".symbol");
            if (!el) return;
            const hero = el.textContent.trim().replace("$", "");
            try {
                await navigator.clipboard.writeText(hero);
                window.activeAPI?.setActiveTicker?.(hero);
            } catch {}
            e.stopPropagation();
        });
    }
}

/* 6) Housekeeping */
function pruneReachedHod() {
    const now = Date.now();
    let removed = false;
    for (const [sym, t] of state.tickers) {
        if (t?.hodAt && now - t.hodAt >= HOD_EVICT_MS) {
            state.tickers.delete(sym);
            removed = true;
        }
    }
    if (removed) markDirty();
}

const INACTIVE_EVICT_MS = 15 * 60 * 1000; // auto-evict after 15min inactivity

// function pruneInactive() {
//     const now = Date.now();
//     let removed = false;
//     for (const [sym, t] of state.tickers) {
//         const last = t.lastMoveAt ?? t.lastUpdate ?? 0;
//         if (now - last >= INACTIVE_EVICT_MS) {
//             state.tickers.delete(sym);
//             removed = true;
//         }
//     }
//     if (removed) markDirty();
// }

setInterval(pruneReachedHod, 5_000);
// setInterval(pruneInactive, 6000);

/* 7) Boot */
document.addEventListener("DOMContentLoaded", async () => {
    // Wait for bridges
    while (!(window.settingsAPI && window.storeAPI && window.eventsAPI && window.electronAPI)) {
        await new Promise((r) => setTimeout(r, 200));
    }

    // volumes only
    try {
        state.settings = await window.settingsAPI.get();
    } catch {
        state.settings = {};
    }
    window.settingsAPI.onUpdate((updated) => {
        state.settings = updated || {};
    });

    // Make content clickable in frameless windows
    try {
        document.body.style["-webkit-app-region"] = "no-drag";
    } catch {}

    // Audio boot + best-effort unlock
    setupAudio();
    if (!sessionStorage.getItem("hod:simulatedOnce")) {
        sessionStorage.setItem("hod:simulatedOnce", "1");
        simulateFirstGesture(1000);
    }

    // Subscribe FIRST so we never miss the initial tracked push
    const unsubscribeTracked = window.storeAPI.onTrackedUpdate((list = []) => {
        state.tracked = (list || []).map(up);
        // Hard prune anything no longer tracked
        if (state.tracked.length) {
            const allow = new Set(state.tracked);
            let removed = false;
            for (const sym of Array.from(state.tickers.keys())) {
                if (!allow.has(sym)) {
                    state.tickers.delete(sym);
                    removed = true;
                }
            }
            if (removed) markDirty();
            state.prevOrder = (state.prevOrder || []).filter((s) => allow.has(s)).slice(0, HOD_SYMBOL_LENGTH);
        }
        markDirty();
    });

    // Optional: one-time snapshot (safe even if event fires first)
    try {
        const snap = await window.storeAPI.getTracked();
        if (Array.isArray(snap) && snap.length) {
            state.tracked = snap.map(up);
            markDirty();
        }
    } catch {}

    // Strict tracked-only alert handling
    if (window.eventsAPI?.onAlert) {
        window.eventsAPI.onAlert((p = {}) => {
            const sym = up(p.hero);
            if (!sym || !isTracked(sym)) return;

            const t = state.tickers.get(sym) || { hero: sym };
            const prevPrice = t.price;
            const prevHigh = t.sessionHigh;

            if (Number.isFinite(p.price)) t.price = p.price;
            if (Number.isFinite(p.sessionHigh)) t.sessionHigh = p.sessionHigh;
            if (Number.isFinite(p.pctBelowHigh)) t.pctBelowHigh = p.pctBelowHigh;

            const rawPct = Number.isFinite(p.pctBelowHigh) ? p.pctBelowHigh : t.pctBelowHigh;
            if (Number.isFinite(rawPct)) {
                t.pctSmooth = Number.isFinite(t.pctSmooth) ? t.pctSmooth * (1 - EMA_ALPHA) + rawPct * EMA_ALPHA : rawPct;
            }

            t.lastUpdate = Date.now();

            // movement (price OR new highs)
            let moved = false;
            if (Number.isFinite(p.price)) moved ||= Number.isFinite(prevPrice) ? Math.abs(p.price - prevPrice) > PRICE_MOVE_EPS : true;
            if (Number.isFinite(p.sessionHigh)) moved ||= Number.isFinite(prevHigh) ? p.sessionHigh > prevHigh : true;
            if (moved) t.lastMoveAt = t.lastUpdate;

            if (Number.isFinite(p.price) && Number.isFinite(prevPrice) && Math.abs(p.price - prevPrice) > PRICE_MOVE_EPS) {
                t.lastPriceDir = p.price > prevPrice ? 1 : -1; // up = 1, down = -1
                t.lastPriceChangeAt = Date.now();
            }

            // window + audio
            const diffUSD = Number.isFinite(p.centsBelowHigh)
                ? Math.max(0, p.centsBelowHigh / 100)
                : Number.isFinite(t.sessionHigh) && Number.isFinite(t.price)
                ? Math.max(0, t.sessionHigh - t.price)
                : Infinity;

            const priceRef = Number.isFinite(t.price) && t.price > 0 ? t.price : t.sessionHigh || 0;
            const thrUSD = hodThresholdUSDFromPrice(priceRef);
            t.diffUSD = diffUSD;
            t.thrUSD = thrUSD;

            const isHOD = p.isHighOfDay === true || (isFinite(diffUSD) && diffUSD <= AT_HIGH_EPS);
            const inWindow = isFinite(diffUSD) && isFinite(thrUSD) && diffUSD > AT_HIGH_EPS && diffUSD <= thrUSD;

            const isUptick = Number.isFinite(p.hp) && p.hp > 0;

            if (isHOD) {
                if (shouldPlayHodChime(sym)) {
                    play(magicBase, getChimeVol(state.settings));
                }
                t.hodAt = Date.now();
            } else {
                // Volume ramps from 0 at the edge (diff == thr) to full at HOD (diff -> 0).
                const dist = Number.isFinite(t.diffUSD) ? t.diffUSD : Infinity;
                const thr = Number.isFinite(t.thrUSD) ? t.thrUSD : 0;
                const prox = thr > 0 ? clamp(1 - dist / thr, 0, 1) : 0; // 0..1

                if (isUptick && prox > 0 && shouldPlayTick(sym)) {
                    const user = clamp(getTickVol(state.settings), 0, 1);
                    // psychoacoustic easing + audible floor at the window edge
                    const eased = Math.pow(prox, TICK_VOL_EASE); // 0..1
                    const shaped = TICK_VOL_FLOOR + (1 - TICK_VOL_FLOOR) * eased; // floor..1
                    const vol = clamp(user * shaped, 0, 1);
                    play(ticksBase, vol);
                }
            }

            state.tickers.set(sym, t);
            markDirty();
        });
    } else {
        console.warn("[HOD] eventsAPI.onAlert not available");
    }

    // Nuke resets rows only; tracked comes from subscription
    window.electronAPI.onNukeState?.(() => {
        state.tickers.clear();
        state.renderKey = "";
        const container = document.getElementById("hod-scroll");
        if (container) container.innerHTML = "";
        markDirty();
    });

    // First paint
    markDirty();
});

/* 8) Debug helpers */
window.hodPeek = () => {
    const first = state.tickers.values().next().value || null;
    console.log({ tracked: state.tracked.slice(), count: state.tickers.size, sample: first });
};
window.hodAudioStatus = () => {
    setupAudio?.();
    const ch = getChimeVol(state.settings);
    const tv = getTickVol(state.settings);
    console.log({
        audioReady,
        chimeVolume: ch,
        tickVolume: tv,
        magicSrc: magicBase?.src || "(unset)",
        ticksSrc: ticksBase?.src || "(unset)",
        minAudioIntervalMs: window.MIN_AUDIO_INTERVAL_MS,
        lastAudioTime: window.lastAudioTime,
    });
};

window.hodTickTest = (p = 0.0) => {
    const user = clamp(getTickVol(state.settings), 0, 1);
    const eased = Math.pow(clamp(p, 0, 1), TICK_VOL_EASE);
    const shaped = TICK_VOL_FLOOR + (1 - TICK_VOL_FLOOR) * eased;
    const vol = clamp(user * shaped, 0, 1);
    console.log({ p, vol, user, shaped });
    play(ticksBase, vol);
};
