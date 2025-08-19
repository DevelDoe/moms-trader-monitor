// File: hod-scroll.js (HOD toplist: price + sessionHigh)
// ──────────────────────────────────────────────────────────────────────────────
// Simple audio: magic on HOD, ticks on approach; capped list; blink + dull;
// retry-attach for late bridges. Keep it understandable.
// ──────────────────────────────────────────────────────────────────────────────

/* ============================================================================
 * 0) Small helpers
 * ========================================================================== */
const up = (s) => String(s || "").toUpperCase();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/* ============================================================================
 * 1) Config
 * ========================================================================== */
const AT_HIGH_EPS = 0.01;
const GOLD_HEX = "#ffd24a";

// HOD window curve (for gating + UI)
const HOD_BASE_AT3 = 0.25;
let HOD_ZONE_SCALE = 1.0;
const HOD_EXP = 0.5;
const HOD_MIN = 0.05;
const HOD_MAX = 3.0;

// Audio throttles
window.MIN_AUDIO_INTERVAL_MS ??= 80; // global safety gap
window.lastAudioTime ??= 0;

// Housekeeping
const HOD_EVICT_MS = 60_000;
const MAX_ROWS = 10;
const DEFAULT_INACTIVE_MS = 12_000;

const SOUND_TRACKED_ONLY = true;

/* ============================================================================
 * 2) State
 * ========================================================================== */
const symbolColors = {};
let trackedTickers = [];
let _renderKey = null;
let _rafPending = false;
const tickers = Object.create(null); // SYM -> { hero, price, sessionHigh, pctBelowHigh, lastUpdate, hodAt }
const isTracked = (sym) => trackedTickers.includes(sym);

/* ============================================================================
 * 3) Style utils
 * ========================================================================== */
function getSymbolColor(symbol) {
    if (!symbolColors[symbol]) {
        const hash = [...symbol].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const hue = (hash * 37) % 360;
        symbolColors[symbol] = `hsla(${hue}, 80%, 50%, 0.5)`;
    }
    return symbolColors[symbol];
}
function formatPrice(n) {
    return typeof n === "number" && isFinite(n) ? `$${n.toFixed(2)}` : "—";
}
function silverTone(pctBelowHigh) {
    const pct = typeof pctBelowHigh === "number" ? pctBelowHigh : 1;
    const closeness = clamp(1 - pct, 0, 1);
    const sat = Math.round(35 + 55 * closeness);
    const light = Math.round(40 + 20 * closeness);
    const alpha = 0.45 + 0.45 * closeness;
    const SILVER_HUE = 210;
    return `hsla(${SILVER_HUE}, ${sat}%, ${light}%, ${alpha.toFixed(2)})`;
}

/* ============================================================================
 * 4) HOD threshold math
 * ========================================================================== */
function hodThresholdUSDFromPrice(price) {
    if (!isFinite(price) || price <= 0) return HOD_BASE_AT3;
    const k = HOD_BASE_AT3 / Math.pow(3, HOD_EXP);
    let th = HOD_ZONE_SCALE * k * Math.pow(price, HOD_EXP);
    if (price < 2) th *= 0.8;
    if (price > 12) th *= 0.9;
    if (price > 20) th *= 0.8;
    return clamp(th, HOD_MIN, HOD_MAX);
}

/* ============================================================================
 * 5) Audio — minimal and clear
 *    - HOD: magic.mp3 once (per-symbol cooldown)
 *    - Approach: ticks.mp3 on every price update (soft), gated by threshold
 * ========================================================================== */
const HOD_CHIME_VOL_DEFAULT = 0.12;
const TICK_VOL_DEFAULT = 0.06;
const HOD_CHIME_COOLDOWN_MS = 5000;

function getChimeVol() {
    const v = Number(window.settings?.hod?.chimeVolume);
    return Number.isFinite(v) ? v : HOD_CHIME_VOL_DEFAULT;
}
function getTickVol() {
    const v = Number(window.settings?.hod?.tickVolume);
    return Number.isFinite(v) ? v : TICK_VOL_DEFAULT;
}

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

    // Autoplay allowed by main → we can mark ready now
    audioReady = true;

    // 🔇 muted warm-up: primes the pipeline on cold boot
    try {
        const warm = ticksBase.cloneNode();
        warm.muted = true;
        warm.currentTime = 0;
        warm.play()
            .then(() => {
                setTimeout(() => {
                    try {
                        warm.pause();
                        warm.remove();
                    } catch {}
                }, 50);
            })
            .catch(() => {
                // if policy ever blocks, we fall back to real gesture
                audioReady = false;
                const unlock = () => {
                    audioReady = true;
                    ["pointerdown", "keydown"].forEach((ev) => window.removeEventListener(ev, unlock, true));
                };
                ["pointerdown", "keydown"].forEach((ev) => window.addEventListener(ev, unlock, { once: true, capture: true }));
            });
    } catch {}
}

function play(base, vol) {
    if (!audioReady) return;
    const now = Date.now();
    const minGap = window.MIN_AUDIO_INTERVAL_MS;
    if (now - (window.lastAudioTime || 0) < minGap) return;

    const a = base.cloneNode();
    if (!a.src) a.src = base.src;
    a.volume = Math.max(0, Math.min(1, vol)); // no floor
    a.currentTime = 0;
    a.play().catch(() => {});
    window.lastAudioTime = now;
}

function playHodChime(sym) {
    const now = Date.now();
    const last = lastHodChimeAt.get(sym) || 0;
    if (now - last < HOD_CHIME_COOLDOWN_MS) return;
    lastHodChimeAt.set(sym, now);
    play(magicBase, getChimeVol()); // <-- was HOD_CHIME_VOL
}

function playApproachTick() {
    play(ticksBase, getTickVol()); // <-- was TICK_VOL
}

setupAudio();
/* ============================================================================
 * 6) DOM helpers
 * ========================================================================== */
async function waitForElement(selector, { timeout = 10000 } = {}) {
    const existing = document.querySelector(selector);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
        const obs = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                obs.disconnect();
                resolve(el);
            }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => {
            obs.disconnect();
            reject(new Error(`Timeout: ${selector}`));
        }, timeout);
    });
}

/* ============================================================================
 * 7) Render
 * ========================================================================== */
function scheduleRender() {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => {
        _rafPending = false;
        render();
    });
}

function getInactiveThreshold() {
    const ms = Number(window.settings?.top?.inactiveMs);
    return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_INACTIVE_MS;
}
function getSymbolLength() {
    const want = Math.max(1, Number(window.settings?.top?.symbolLength) || 25);
    return Math.min(want, MAX_ROWS);
}

function render() {
    const container = document.getElementById("hod-scroll");
    if (!container) return;

    const order = new Map(trackedTickers.map((s, i) => [up(s), i]));
    const candidates = order.size ? Object.values(tickers).filter((t) => order.has(up(t.hero))) : Object.values(tickers);

    const display = candidates
        .filter((t) => (t.price ?? 0) > 0 && (t.sessionHigh ?? 0) > 0)
        .sort((a, b) => (a.pctBelowHigh ?? 1) - (b.pctBelowHigh ?? 1))
        .slice(0, getSymbolLength());

    const key = display.length ? display.map((t) => `${t.hero}:${t.price}:${t.sessionHigh}`).join(",") : "∅";
    if (_renderKey !== null && key === _renderKey) return;
    _renderKey = key;

    const now = Date.now();
    const inactiveThreshold = getInactiveThreshold();

    container.innerHTML = display
        .map((t, idx) => {
            const bg = getSymbolColor(t.hero);
            const diffUSD = Math.max(0, (t.sessionHigh ?? 0) - (t.price ?? 0));
            const thr = hodThresholdUSDFromPrice((t.price ?? t.sessionHigh) || 0);

            const atHigh = diffUSD <= AT_HIGH_EPS;
            const within = diffUSD > AT_HIGH_EPS && diffUSD <= thr;
            const closeness = within ? clamp(1 - diffUSD / thr, 0, 1) : 0;

            const blinkClass = within ? "blinking" : "";
            const blinkSpeed = (1.0 - 0.75 * closeness).toFixed(2); // 1s → 0.25s
            const blinkStyle = within ? `animation-duration:${blinkSpeed}s;` : "";

            const rowGlow = atHigh ? "box-shadow:0 0 10px rgba(255,210,74,0.3);" : "";

            const age = now - (t.lastUpdate || 0);
            const dullStyle = age > inactiveThreshold ? "opacity:0.75; filter:grayscale(0.8);" : "";

            return `
                <div class="xp-line ellipsis" data-ath="${atHigh ? 1 : 0}">
                    <span class="text-tertiary" style="display:inline-block; min-width:24px; text-align:right; margin-right:4px;">
                    ${idx + 1}.
                    </span>
                    <strong class="symbol" style="background:${bg}; ${dullStyle}">${t.hero}</strong>
                    <span style="${rowGlow} position:absolute; left:120px; font-weight:600; display:inline-block; font-size:15px; line-height:1; text-align:left;">
                    <div style="background-color:transparent; color:${GOLD_HEX}">${formatPrice(t.sessionHigh)}</div>
                    <div class="${blinkClass}" style="${blinkStyle} background:transparent; color:${silverTone(t.pctBelowHigh)};">
                        ${formatPrice(t.price)}
                    </div>
                    </span>
                </div>`;
        })
        .join("");

    container.querySelectorAll(".symbol").forEach((el) => {
        el.addEventListener("click", async (e) => {
            const hero = el.textContent.trim().replace("$", "");
            try {
                await navigator.clipboard.writeText(hero);
                window.activeAPI?.setActiveTicker?.(hero);
            } catch {}
            e.stopPropagation();
        });
    });
}
/* ============================================================================
 * 8) Init — super simple boot
 * ========================================================================== */
async function initHOD() {
    setupAudio(); // make audio available (unlocks on first user gesture)

    const container = document.getElementById("hod-scroll");
    if (!container) {
        console.warn("❌ HOD: #hod-scroll missing");
        return;
    }

    // ensure content is clickable in frameless windows (if relevant)
    try {
        document.body.style["-webkit-app-region"] = "no-drag";
    } catch {}

    try {
        // settings + tracked
        window.settings = await window.settingsAPI.get();
        try {
            trackedTickers = (await window.storeAPI.getTracked()).map(up);
        } catch {
            trackedTickers = [];
        }

        window.storeAPI.onTrackedUpdate((list) => {
            trackedTickers = (list || []).map(up);
            pruneUntracked();
            scheduleRender();
        });

        // warm state
        try {
            const symbols = await window.storeAPI.getSymbols();
            symbols.forEach((s) => {
                tickers[s.symbol] = {
                    hero: s.symbol,
                    price: s.price || 0,
                    sessionHigh: s.sessionHigh || 0,
                    pctBelowHigh: s.pctBelowHigh ?? 1,
                    lastUpdate: Date.now(),
                };
            });
        } catch {}
        scheduleRender();

        // live alerts
        if (window.eventsAPI?.onAlert) {
            window.eventsAPI.onAlert((p) => {
                const { hero, price, sessionHigh, pctBelowHigh } = p || {};
                if (!hero) return;

                const sym = up(hero);
                const tracked = isTracked(sym);

                if (!tickers[sym]) tickers[sym] = { hero: sym };
                const t = tickers[sym];
                if (typeof price === "number") t.price = price;
                if (typeof sessionHigh === "number") t.sessionHigh = sessionHigh;
                if (typeof pctBelowHigh === "number") t.pctBelowHigh = pctBelowHigh;
                t.lastUpdate = Date.now();

                const diffUSD =
                    typeof p.centsBelowHigh === "number" ? Math.max(0, p.centsBelowHigh / 100) : isFinite(t.sessionHigh) && isFinite(t.price) ? Math.max(0, t.sessionHigh - t.price) : Infinity;

                const priceRef = isFinite(t.price) && t.price > 0 ? t.price : t.sessionHigh || 0;
                const thrUSD = hodThresholdUSDFromPrice(priceRef);

                t.diffUSD = diffUSD;
                t.thresholdUSD = thrUSD;

                // Same conditions your UI uses for glow/blink
                const isHOD = p.isHighOfDay === true || (isFinite(diffUSD) && diffUSD <= AT_HIGH_EPS);
                const inWindow = isFinite(diffUSD) && isFinite(thrUSD) && diffUSD > AT_HIGH_EPS && diffUSD <= thrUSD;

                // gate all audio to tracked only (per your spec)
                const allowSound = !SOUND_TRACKED_ONLY ? true : tracked;

                if (isHOD) {
                    if (allowSound) playHodChime(sym); // HOD chime only for tracked
                    t.hodAt = Date.now(); // still mark for UI/prune either way
                } else if (inWindow) {
                    if (allowSound) playApproachTick(); // ticks only when blinking AND tracked
                }

                scheduleRender();
            });
        } else {
            console.warn("[HOD] eventsAPI.onAlert not available");
        }

        // settings changes
        window.settingsAPI.onUpdate((updated) => {
            window.settings = updated;
            scheduleRender();
        });

        // state nuke
        window.electronAPI.onNukeState(async () => {
            for (const k of Object.keys(tickers)) delete tickers[k];
            trackedTickers = [];
            _renderKey = "";
            document.getElementById("hod-scroll").innerHTML = "";
            try {
                trackedTickers = (await window.storeAPI.getTracked()).map(up);
                const symbols = await window.storeAPI.getSymbols();
                symbols.forEach((s) => {
                    tickers[s.symbol] = {
                        hero: s.symbol,
                        price: s.price || 0,
                        sessionHigh: s.sessionHigh || 0,
                        pctBelowHigh: s.pctBelowHigh ?? 1,
                        lastUpdate: Date.now(),
                    };
                });
            } catch {}
            scheduleRender();
        });
    } catch (err) {
        console.error("❌ HOD init failed:", err);
    }
}

function simulateFirstGesture() {
    // make sure audio bases exist
    setupAudio();

    const fire = (target, ev) => {
        try {
            target.dispatchEvent(ev);
        } catch {}
    };

    // small delay so listeners from setup/init are attached
    setTimeout(() => {
        // focus helps some platforms kick timers
        try {
            window.focus();
            document.body?.focus?.();
        } catch {}

        // pointerdown
        const pd = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, isPrimary: true });
        fire(window, pd);
        fire(document, pd);
        document.body && fire(document.body, pd);

        // keydown
        const kd = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " });
        fire(window, kd);
        fire(document, kd);
        document.body && fire(document.body, kd);
    }, 30);
}

// Plain document-ready boot — no retries, no loops
document.addEventListener("DOMContentLoaded", () => {
    initHOD();
    pruneHodReached();
    // One-time "first click" per window
    // if (!sessionStorage.getItem("hod:simulatedOnce")) {
    //     sessionStorage.setItem("hod:simulatedOnce", "1");
    //     simulateFirstGesture();
    // }
});

async function attachWhenBridgesReady() {
    while (!(window.settingsAPI && window.storeAPI && window.eventsAPI && window.electronAPI)) {
        await new Promise((r) => setTimeout(r, 250));
    }
    initHOD();
}

document.addEventListener("DOMContentLoaded", () => {
    attachWhenBridgesReady();
});

/* ============================================================================
 * 9) Housekeeping
 * ========================================================================== */
function pruneHodReached() {
    const now = Date.now();
    let removed = false;

    for (const [sym, t] of Object.entries(tickers)) {
        if (t?.hodAt && now - t.hodAt >= HOD_EVICT_MS) {
            delete tickers[sym];
            removed = true;
        }
    }

    if (removed) {
        console.debug("[HOD] pruned at", new Date(now).toLocaleTimeString());
        scheduleRender();
    }
}

// Add this near other housekeeping helpers
function pruneUntracked() {
    if (!Array.isArray(trackedTickers) || trackedTickers.length === 0) return;
    const allow = new Set(trackedTickers.map(up));
    let removed = false;
    for (const sym of Object.keys(tickers)) {
        if (!allow.has(sym)) {
            delete tickers[sym];
            removed = true;
        }
    }
    if (removed) scheduleRender();
}

setInterval(pruneHodReached, 5000);

/* ============================================================================
 * 10) Debug helpers
 * ========================================================================== */

// Existing:
window.hodPeek = () => {
    const sampleKey = Object.keys(tickers)[0];
    console.log({ tracked: trackedTickers, sample: sampleKey ? tickers[sampleKey] : null });
};

// --- Audio debug (new) ---

// Quick status snapshot
window.hodAudioStatus = () => {
    setupAudio?.(); // ensure bases exist
    const ch = typeof getChimeVol === "function" ? getChimeVol() : typeof HOD_CHIME_VOL === "number" ? HOD_CHIME_VOL : 0.12;
    const tv = typeof getTickVol === "function" ? getTickVol() : typeof TICK_VOL === "number" ? TICK_VOL : 0.06;
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

// Play a single tick (ticks.mp3). Optional volume override: hodAudioTestTick(0.1)
window.hodAudioTestTick = async (vol) => {
    try {
        setupAudio?.();
        // try to unlock best-effort; may still require a user click in some environments
        audioReady = true;
        // bypass global throttle for test
        window.lastAudioTime = 0;
        if (typeof vol === "number") {
            const v = Math.max(0, Math.min(1, vol));
            const a = ticksBase.cloneNode();
            if (!a.src) a.src = ticksBase.src;
            a.volume = v;
            a.currentTime = 0;
            await a.play();
            console.log("[HOD] test tick played at vol", v);
        } else {
            playApproachTick();
            console.log("[HOD] test tick played via playApproachTick()");
        }
    } catch (err) {
        console.warn("[HOD] test tick failed:", err?.name || err, "— click the view once to unlock audio or check ticks.mp3 path.");
    }
};

// Play a single chime
