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
    const sat = Math.round(35 + 55 * closeness);
    const light = Math.round(40 + 20 * closeness);
    const alpha = 0.45 + 0.45 * closeness;
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

const HOD_BASE_AT3 = 0.25;
const HOD_EXP = 0.5;
const HOD_MIN = 0.05;
const HOD_MAX = 3.0;
let HOD_ZONE_SCALE = 1.0;

window.MIN_AUDIO_INTERVAL_MS ??= 80;
window.lastAudioTime ??= 0;

const HOD_EVICT_MS = 60_000; // evict a row N ms after it hit HOD
const HOD_SYMBOL_LENGTH = 10; // rows to show
const HOD_INACTIVE_MS = 1000; // dull UI if older than this (ms)
const PRICE_MOVE_EPS = 0; // any price change counts as movement

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
const HOD_CHIME_COOLDOWN_MS = 5000;
const HOD_CHIME_VOL_DEFAULT = 0.12;
const TICK_VOL_DEFAULT = 0.06;

let audioReady = false;
let magicBase, ticksBase;
const lastHodChimeAt = new Map();

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
};
const isTracked = (sym) => state.tracked.includes(up(sym));

function markDirty() {
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(() => {
        state.rafPending = false;
        render();
    });
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

    items.sort((a, b) => (a.pctBelowHigh ?? 1) - (b.pctBelowHigh ?? 1) || (b.lastUpdate ?? 0) - (a.lastUpdate ?? 0));
    const display = items.slice(0, HOD_SYMBOL_LENGTH);

    const key = display.map((t) => `${t.hero}:${t.price}:${t.sessionHigh}:${t.pctBelowHigh}`).join("|") || "∅";
    if (state.renderKey && key === state.renderKey) return;
    state.renderKey = key;

    const now = Date.now();

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
            const rowGlow = atHigh ? "box-shadow:0 0 10px rgba(255,210,74,0.3);" : "";

            const age = now - (t.lastUpdate || 0);
            const dullStyle = age > HOD_INACTIVE_MS ? "opacity:0.75; filter:grayscale(0.8);" : "";

            return `
      <div class="xp-line ellipsis" data-ath="${atHigh ? 1 : 0}">
        <span class="text-tertiary" style="display:inline-block; min-width:24px; text-align:right; margin-right:4px;">${idx + 1}.</span>
        <strong class="symbol" style="background:${getSymbolColor(t.hero)}; ${dullStyle}">${t.hero}</strong>
        <span style="${rowGlow} position:absolute; left:120px; font-weight:600; display:inline-block; font-size:15px; line-height:1; text-align:left;">
          <div style="background:transparent; color:${GOLD_HEX}">${formatPrice(t.sessionHigh)}</div>
          <div class="${blinkClass}" style="${blinkStyle} background:transparent; color:${silverTone(t.pctBelowHigh)};">${formatPrice(t.price)}</div>
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

function pruneInactive() {
    const now = Date.now();
    let removed = false;
    for (const [sym, t] of state.tickers) {
        const last = t.lastMoveAt ?? t.lastUpdate ?? 0;
        if (now - last >= INACTIVE_EVICT_MS) {
            state.tickers.delete(sym);
            removed = true;
        }
    }
    if (removed) markDirty();
}

setInterval(pruneReachedHod, 5_000);
setInterval(pruneInactive, 90_000);

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

            t.lastUpdate = Date.now();

            // movement (price OR new highs)
            let moved = false;
            if (Number.isFinite(p.price)) moved ||= Number.isFinite(prevPrice) ? Math.abs(p.price - prevPrice) > PRICE_MOVE_EPS : true;
            if (Number.isFinite(p.sessionHigh)) moved ||= Number.isFinite(prevHigh) ? p.sessionHigh > prevHigh : true;
            if (moved) t.lastMoveAt = t.lastUpdate;

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

            if (isHOD) {
                play(magicBase, getChimeVol(state.settings));
                t.hodAt = Date.now();
            } else if (inWindow) {
                play(ticksBase, getTickVol(state.settings));
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
