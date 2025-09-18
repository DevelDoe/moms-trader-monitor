// heroes.clean.js — consume store buffs (Frontline style), minimal & maintainable

/* ===== 0) Config ===== */
const DECAY_INTERVAL_MS = 6000;
const XP_DECAY_PER_TICK = 0.2;
const SCORE_NORMALIZATION = 5;
const BASE_MAX_HP = 30;
const ACTIVE_TICKER_UPDATE_INTERVAL = 3 * 60 * 1000;
const MIN_UPDATE_INTERVAL = 5000;
const MAX_STRENGTH = 1_000_000;

// HOD Color Logic (from hod.js)
const GOLD_HEX = "#ffd24a";
const AT_HIGH_EPS = 0.01;
const HOD_BASE_AT3 = 0.3;
const HOD_EXP = 0.5;
const HOD_MIN = 0.05;
const HOD_MAX = 3.0;
let HOD_ZONE_SCALE = 1.0;

const clamp = (n, mi, ma) => Math.max(mi, Math.min(ma, n));

function hodThresholdUSDFromPrice(price) {
    if (!isFinite(price) || price <= 0) return HOD_BASE_AT3;
    const k = HOD_BASE_AT3 / Math.pow(3, HOD_EXP);
    let th = HOD_ZONE_SCALE * k * Math.pow(price, HOD_EXP);
    if (price < 2) th *= 0.8;
    if (price > 12) th *= 0.9;
    if (price > 20) th *= 0.8;
    return clamp(th, HOD_MIN, HOD_MAX);
}

function getHodPriceColor(currentPrice, sessionHigh) {
    if (!isFinite(currentPrice) || !isFinite(sessionHigh) || sessionHigh <= 0) {
        return 'white'; // Default color
    }

    const diffUSD = Math.max(0, sessionHigh - currentPrice);
    const thr = hodThresholdUSDFromPrice(currentPrice || sessionHigh || 0);
    const atHigh = diffUSD <= AT_HIGH_EPS;
    const within = diffUSD > AT_HIGH_EPS && diffUSD <= thr;

    if (atHigh) {
        return GOLD_HEX; // Gold when at high of day
    } else if (within) {
        return '#ffff99'; // Light yellow when within HOD threshold
    } else {
        return 'white'; // White when far from high
    }
}

/* ===== 1) State ===== */
const state = {
    heroes: Object.create(null),
    container: null,
    settings: {},
    buffsMaster: [], // only for volume color; buffs themselves come from store
    rafPending: false,
    renderKey: "",
    maxHP: BASE_MAX_HP,

    // heroes-specific settings
    heroesSettings: { listLength: 3 }, // Default fallback
    
    // traderview settings
    traderviewSettings: {}, // Default fallback

    // rotation & TradingView sync
    lastTopSymbolsKey: "",
    currentActiveTicker: null,
    lastActiveTickerUpdate: 0,
    lastTickerSetAt: 0,

    // medals
    rankMap: new Map(),
    trophyMap: new Map(),
    ratingRankMap: new Map(), // For rating tiered medals
    top3Unsub: null,
    ratingTop3Unsub: null,
    xpTop3Unsub: null,
};

/* ===== 2) Utils ===== */
const medalForRank = (r) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : "");
const getSymbolMedal = (s) => {
    const sym = String(s || "").toUpperCase();
    
    // Only use rating tiered medals
    const ratingTier = state.ratingRankMap.get(sym);
    if (ratingTier) {
        const medal = medalForRank(ratingTier);
        return medal ? `<span class="medal">${medal}</span>` : '';
    }
    
    return '';
};

const getSymbolTrophy = (s) => {
    const sym = String(s || "").toUpperCase();
    const trophy = state.trophyMap.get(sym) || '';
    return trophy ? `<span class="trophy">${trophy}</span>` : '';
};

const getSymbolXpTrophy = (s) => {
    const sym = String(s || "").toUpperCase();
    const rank = window.xpRankMap?.get(sym) || 0;
    if (rank === 1) return '<span class="trophy trophy-xp trophy-xp-gold" title="XP Rank 1"></span>';
    if (rank === 2) return '<span class="trophy trophy-xp trophy-xp-silver" title="XP Rank 2"></span>';
    if (rank === 3) return '<span class="trophy trophy-xp trophy-xp-bronze" title="XP Rank 3"></span>';
    return '';
};

function buffSignature(h) {
    const b = h.buffs || {};
    return Object.keys(b)
        .sort()
        .map((k) => {
            const v = b[k] || {};
            const flag = v.isBuff === true ? "+" : v.isBuff === false ? "-" : "0";
            return `${k}:${flag}:${v.icon || ""}`;
        })
        .join("|");
}


const BUFF_SORT_ORDER = ["float", "volume", "news", "hasNews", "hasBullishNews", "hasBearishNews", "hasFiling", "bio", "weed", "space", "newHigh", "bounceBack", "highShort", "netLoss", "hasS3", "dilutionRisk", "china", "lockedShares"];
const placeholderDot = `<span class="buff-icon placeholder">•</span>`;

function buildBuffRows(h) {
    const arr = Object.entries(h.buffs || {}).map(([key, v]) => ({
        ...(v || {}),
        key,
        _sortKey: key.toLowerCase().startsWith("float") ? "float" : 
                  key.toLowerCase().includes("vol") ? "volume" : 
                  key.toLowerCase().includes("news") ? "news" :
                  key.toLowerCase().includes("filing") ? "hasFiling" : key,
    }));

    const sort = (xs) =>
        xs.sort((a, b) => {
            const ai = BUFF_SORT_ORDER.indexOf(a._sortKey);
            const bi = BUFF_SORT_ORDER.indexOf(b._sortKey);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

    const pos = sort(arr.filter((x) => x.isBuff === true));
    const neu = sort(arr.filter((x) => x.isBuff === undefined));
    const neg = sort(arr.filter((x) => x.isBuff === false));

    const row = (xs) =>
        xs.length
            ? xs.map((b) => {
                // For float buffs, use the value instead of icon and apply color class
                if (b._sortKey === "float") {
                    // Extract the numeric value from the icon (1, 5, 10, 20, 50, 100, 200, 500)
                    const floatValue = parseInt(b.icon) || 0;
                    let colorClass = "";
                    
                    // Precise color mapping based on actual values
                    if (floatValue === 1 || floatValue === 5 || floatValue === 10) {
                        colorClass = "float-green";
                    } else if (floatValue === 20) {
                        colorClass = "float-yellow";
                    } else if (floatValue === 50) {
                        colorClass = "float-orange";
                    } else if (floatValue === 100 || floatValue === 200 || floatValue === 500) {
                        colorClass = "float-red";
                    }
                    
                    return `<span class="buff-icon ${colorClass}" title="${b.desc || ""}">${b.icon}</span>`;
                }
                // For other buffs, use the icon as before
                return `<span class="buff-icon ${b.isBuff ? "buff-positive" : b.isBuff === false ? "buff-negative" : ""}" title="${b.desc || ""}">${b.icon || "•"}</span>`;
            }).join("")
            : placeholderDot;

    return { posHTML: row(pos), neuHTML: row(neu), negHTML: row(neg) };
}

/* ===== 3) Render scheduling ===== */
function markDirty() {
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(() => {
        state.rafPending = false;
        render();
    });
}

/* ===== 4) Card creation / patch ===== */
function createCard(h) {
    const card = document.createElement("div");
    card.className = "ticker-card";
    card.dataset.symbol = h.hero;

    const impact = window.hlpsFunctions?.calculateImpact?.(h.strength || 0, h.price || 0, state.buffsMaster) || { style: { color: "" } };
    const { totalXp, xpForNextLevel, xpPercent } = window.helpers.getXpProgress(h);
    const isFaded = Date.now() - (h.lastUpdate || 0) > 10_000;
    const { posHTML, neuHTML, negHTML } = buildBuffRows(h);
    
    // Get HOD color for price
    const priceColor = getHodPriceColor(h.price, h.sessionHigh);

    card.innerHTML = `
    <div class="ticker-header-grid">
      <div class="ticker-info">
        <div class="ticker-symbol ${isFaded ? 'faded' : ''}" style="background-color:${window.helpers.getSymbolColor(h.hue || 0)}">
          $${h.hero}
          <span class="lv">
            <span class="lv-medal">${getSymbolMedal(h.hero)}</span>
            ${getSymbolTrophy(h.hero)}
            ${getSymbolXpTrophy(h.hero)}
            <span class="lv-price ${priceColor === '#ffd24a' ? 'price-gold' : priceColor === '#ffff99' ? 'price-yellow' : 'price-white'}">$${(h.price ?? 0).toFixed(2)}</span>
          </span>
        </div>
        <div class="bar-text stats lv">L <span class="stat-white">${h.lv ?? 1}</span></div>
        <div class="bar-text stats x">X <span class="stat-green">${Math.floor(totalXp)}</span></div>
        <div class="bar-text stats ch">C <span class="stat-red">${(h.hp || 0).toFixed(0)}%</span></div>
        <div class="bar-text stats">V <span style="color:${impact.style.color};">${window.helpers.abbreviatedValues(h.strength || 0)}</span></div>
      </div>

      <div class="buff-container">
        <div class="buff-row positive">${posHTML}</div>
        <div class="buff-row neutral">${neuHTML}</div>
        <div class="buff-row negative">${negHTML}</div>
      </div>
    </div>

    <div class="bars">
      <!-- Dynamic width and background color - must stay as inline styles -->
      <div class="bar"><div class="bar-fill xp"       style="width:${xpPercent}%"><span class="bar-text">XP: ${Math.floor(totalXp)} / ${xpForNextLevel}</span></div></div>
      <div class="bar"><div class="bar-fill hp"       style="width:${Math.min((h.hp / state.maxHP) * 100, 100)}%"><span class="bar-text">HP: ${(h.hp || 0).toFixed(0)}</span></div></div>
      <div class="bar"><div class="bar-fill strength" style="background-color:${impact.style.color}; width:${Math.min((h.strength / MAX_STRENGTH) * 100, 100)}%">
        <span class="bar-text">STRENGTH: ${window.helpers.abbreviatedValues(h.strength || 0)}</span>
      </div></div>
    </div>
  `;

    const symEl = card.querySelector(".ticker-symbol");
    symEl.onclick = (e) => {
        e.stopPropagation();
        try {
            navigator.clipboard.writeText(h.hero);
            window.activeAPI?.setActiveTicker?.(h.hero);
            symEl.classList.add("symbol-clicked");
            setTimeout(() => symEl.classList.remove("symbol-clicked"), 200);
        } catch {}
    };

    return card;
}

function patchCardDOM(sym, h) {
    const card = state.container.querySelector(`.ticker-card[data-symbol="${sym}"]`);
    if (!card) return;

    const symEl = card.querySelector(".ticker-symbol");
    if (symEl) {
        const isFaded = Date.now() - (h.lastUpdate || 0) > 10_000;
        if (isFaded) {
            symEl.classList.add('faded');
        } else {
            symEl.classList.remove('faded');
        }
    }

    const priceEl = card.querySelector(".lv-price");
    if (priceEl) {
        priceEl.textContent = `$${(h.price ?? 0).toFixed(2)}`;
        // Apply HOD color logic based on proximity to session high
        const priceColor = getHodPriceColor(h.price, h.sessionHigh);
        // Remove existing price color classes
        priceEl.classList.remove('price-gold', 'price-yellow', 'price-white');
        // Add appropriate class
        if (priceColor === '#ffd24a') {
            priceEl.classList.add('price-gold');
        } else if (priceColor === '#ffff99') {
            priceEl.classList.add('price-yellow');
        } else {
            priceEl.classList.add('price-white');
        }
    }

    const medalEl = card.querySelector(".lv-medal");
    if (medalEl) medalEl.innerHTML = getSymbolMedal(sym);
    
    // Update trophy separately
    const trophyEl = card.querySelector('.trophy');
    if (trophyEl) {
        const trophy = getSymbolTrophy(sym);
        trophyEl.outerHTML = trophy;
    } else if (getSymbolTrophy(sym)) {
        // Add trophy if it doesn't exist but should
        const lvEl = card.querySelector('.lv');
        if (lvEl) {
            lvEl.insertAdjacentHTML('beforeend', getSymbolTrophy(sym));
        }
    }

    // Update XP trophy separately
    const xpTrophyEl = card.querySelector('.trophy-xp');
    if (xpTrophyEl) {
        xpTrophyEl.outerHTML = getSymbolXpTrophy(sym);
    } else if (getSymbolXpTrophy(sym)) {
        // Add XP trophy if it doesn't exist but should
        const lvEl = card.querySelector('.lv');
        if (lvEl) {
            lvEl.insertAdjacentHTML('beforeend', getSymbolXpTrophy(sym));
        }
    }

    const impact = window.hlpsFunctions?.calculateImpact?.(h.strength || 0, h.price || 0, state.buffsMaster) || { style: { color: "" } };
    const { xpPercent } = window.helpers.getXpProgress(h);

    // Dynamic width calculations - must stay as inline styles
    const setWidth = (sel, pct) => {
        const el = card.querySelector(sel);
        if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    };
    setWidth(".bar-fill.xp", xpPercent);
    setWidth(".bar-fill.hp", Math.min((h.hp / state.maxHP) * 100, 100));
    setWidth(".bar-fill.strength", Math.min((h.strength / MAX_STRENGTH) * 100, 100));

    // Dynamic background color - must stay as inline style
    const strBar = card.querySelector(".bar-fill.strength");
    if (strBar) {
        strBar.style.backgroundColor = impact.style.color;

        // ✅ update the STRENGTH label text
        const strengthText = strBar.querySelector(".bar-text");
        if (strengthText) {
            const fmt = window.helpers?.abbreviatedValues ? window.helpers.abbreviatedValues(h.strength || 0) : String(h.strength || 0);
            strengthText.textContent = `STRENGTH: ${fmt}`;
        }
    }

    const { posHTML, neuHTML, negHTML } = buildBuffRows(h);
    const posRow = card.querySelector(".buff-row.positive");
    const neuRow = card.querySelector(".buff-row.neutral");
    const negRow = card.querySelector(".buff-row.negative");
    if (posRow) posRow.innerHTML = posHTML;
    if (neuRow) neuRow.innerHTML = neuHTML;
    if (negRow) negRow.innerHTML = negHTML;
}

/* ===== 5) Render ===== */
function render() {
    if (!state.container) return;

    const topN = state.heroesSettings?.listLength ?? 3;
    const list = Object.values(state.heroes)
        .filter((h) => (h.score || 0) > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);

    const key = list.map((h) => `${h.hero}:${Math.round(h.score)}:${Math.round(h.hp)}:${buffSignature(h)}`).join(",");
    if (key === state.renderKey) {
        list.forEach((h) => patchCardDOM(h.hero, h));
        return;
    }
    state.renderKey = key;

    const need = new Set(list.map((h) => h.hero));
    state.container.querySelectorAll(".ticker-card").forEach((el) => {
        const sym = el.dataset.symbol;
        if (!need.has(sym)) el.remove();
    });

    list.forEach((h, i) => {
        let card = state.container.querySelector(`.ticker-card[data-symbol="${h.hero}"]`);
        if (!card) {
            card = createCard(h);
            state.container.insertBefore(card, state.container.children[i] || null);
        } else if (state.container.children[i] !== card) {
            state.container.insertBefore(card, state.container.children[i] || null);
        }
        patchCardDOM(h.hero, h);
    });

    // rotation + TV sync (optional, but kept)
    const now = Date.now();
    const topSymbols = list.map((h) => h.hero);
    const topKey = topSymbols.join(",");

    if (topSymbols.length && (now - state.lastActiveTickerUpdate >= ACTIVE_TICKER_UPDATE_INTERVAL || !state.currentActiveTicker)) {
        const candidates = topSymbols.filter((s) => s !== state.currentActiveTicker);
        const pick = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : topSymbols[0];
        window.activeAPI?.setActiveTicker?.(pick);
        state.currentActiveTicker = pick;
        state.lastActiveTickerUpdate = now;
    }

    if (topKey !== state.lastTopSymbolsKey) {
        state.lastTopSymbolsKey = topKey;
        if (window.traderviewAPI?.setTopTickers && now - state.lastTickerSetAt > MIN_UPDATE_INTERVAL) {
            // Check if heroes mode is enabled before setting top tickers
            const enableHeroes = state.traderviewSettings?.enableHeroes ?? false;
            if (enableHeroes) {
                const n = state.heroesSettings?.listLength ?? 3;
                window.traderviewAPI.setTopTickers(topSymbols.slice(0, n));
                state.lastTickerSetAt = now;
                console.log(`🦸 [HEROES] Heroes mode enabled, setting top tickers: ${topSymbols.slice(0, n).join(', ')}`);
            } else {
                console.log(`🦸 [HEROES] Heroes mode disabled, skipping top tickers update`);
            }
        }
    }
}

/* ===== 6) Score decay ===== */
function startScoreDecay() {
    setInterval(() => {
        let changed = false;
        const vals = Object.values(state.heroes);
        for (const h of vals) {
            const prev = h.score || 0;
            if (prev <= 0) continue;
            const next = Math.max(0, prev - XP_DECAY_PER_TICK * (1 + prev / SCORE_NORMALIZATION));
            if (next !== prev) {
                h.score = next;
                h.lastEvent = h.lastEvent || {};
                h.lastEvent.hp = 0;
                h.lastEvent.dp = 0;
                changed = true;
            }
        }
        if (!changed) return;

        const topN = state.heroesSettings?.listLength ?? 3;
        const top = vals
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topN);
        if (top.length) {
            const allBelow = top.every((x) => (x.hp || 0) < state.maxHP * 0.2);
            if (allBelow && state.maxHP > BASE_MAX_HP) state.maxHP = Math.max(BASE_MAX_HP, state.maxHP * 0.9);
        }
        markDirty();
    }, DECAY_INTERVAL_MS);
}

/* ===== 7) Alerts → State (minimal, dp-safe) ===== */
function handleAlertEvent(evt) {
    if (!evt?.hero) return;

    // Guards
    const minPrice = state.worldSettings?.minPrice ?? 0;
    const maxPrice = state.worldSettings?.maxPrice > 0 ? state.worldSettings.maxPrice : Infinity;

    const price = Number(evt.price);
    const vol = Number(evt.one_min_volume) || 0;
    const hp = Math.max(0, Number(evt.hp) || 0);
    const dp = Math.max(0, Number(evt.dp) || 0);

    if (vol <= 30000) return;
    if (!Number.isFinite(price) || price < minPrice || price > maxPrice) return;

    const sym = String(evt.hero).toUpperCase();

    // Upsert hero once (no redundant follow-up set)
    let h = state.heroes[sym];
    if (!h) {
        h = state.heroes[sym] = {
            hero: sym,
            price: Number.isFinite(price) ? price : 1,
            hue: evt.hue ?? 0,
            hp: 0,
            dp: 0,
            score: 0,
            xp: 0,
            lv: 1,
            totalXpGained: 0,
            strength: vol,
            lastEvent: { hp: 0, dp: 0, score: 0 },
            buffs: {},
            sessionHigh: evt.sessionHigh || Number.isFinite(price) ? price : 1,
            lastUpdate: 0,
        };
    }

    // Basic updates
    if (Number.isFinite(price)) h.price = price;
    if (evt.hue !== undefined) h.hue = evt.hue;
    h.strength = vol;
    
    // Update session high from alert data
    if (Number.isFinite(evt.sessionHigh)) {
        h.sessionHigh = evt.sessionHigh;
    }

    // HP bar: apply both sides (no mutual-exclusivity)
    if (hp > 0) h.hp += hp;
    if (dp > 0) h.hp = Math.max(h.hp - dp, 0);

    // History
    h.history = h.history || [];
    h.history.push({ hp, dp, ts: Date.now() });
    if (h.history.length > 10) h.history.shift();

    // Score: delegate to your scorer using the raw event
    let delta = 0;
    try {
        if (window.helpers?.calculateScore) {
            delta = Number(window.helpers.calculateScore(h, evt)) || 0;
        }
    } catch (e) {
        console.error("[Heroes] calculateScore failed", e);
        delta = 0;
    }
    if (delta !== 0) h.score = Math.max(0, (h.score || 0) + delta); // Allow score to decrease but not go below 0

    // Bookkeeping
    h.lastEvent = { hp, dp, score: delta };
    h.lastUpdate = Date.now();

    // Dynamic HP ceiling
    if (h.hp > state.maxHP) state.maxHP = h.hp * 1.05;

    // Buffs
    if (evt.buffs && Object.keys(evt.buffs).length) h.buffs = evt.buffs;

    markDirty();
}

/* ===== 8) Top3 medals ===== */
async function initTop3() {
    try {
        const { entries } = await window.changeTop3API.get();
        state.rankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.rank) || 0]));
    } catch {}
    state.top3Unsub = window.changeTop3API.onUpdate?.(({ entries }) => {
        state.rankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.rank) || 0]));
        state.container?.querySelectorAll(".ticker-card").forEach((card) => {
            const sym = card.dataset.symbol?.toUpperCase();
            const el = card.querySelector(".lv-medal");
            if (sym && el) el.innerHTML = getSymbolMedal(sym);
            
            // Update trophy separately
            const trophyEl = card.querySelector('.trophy');
            if (trophyEl) {
                const trophy = getSymbolTrophy(sym);
                trophyEl.outerHTML = trophy;
            } else if (getSymbolTrophy(sym)) {
                // Add trophy if it doesn't exist but should
                const lvEl = card.querySelector('.lv');
                if (lvEl) {
                    lvEl.insertAdjacentHTML('beforeend', getSymbolTrophy(sym));
                }
            }
        });
    });
}

/* ===== 8.1) Rating Top3 medals (tiered ranking) ===== */
async function initRatingTop3() {
    try {
        const { entries } = await window.top3API.get();
        // Map symbols to their tier (1st tier = rank 1, 2nd tier = rank 2, etc.)
        state.ratingRankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.tier) || 0]));
    } catch {}
    
    state.ratingTop3Unsub = window.top3API.subscribe?.(({ entries }) => {
        // Map symbols to their tier for tiered medals
        state.ratingRankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.tier) || 0]));
        
        // Update all visible cards with new rating medals
        state.container?.querySelectorAll(".ticker-card").forEach((card) => {
            const sym = card.dataset.symbol?.toUpperCase();
            const el = card.querySelector(".lv-medal");
            if (sym && el) el.innerHTML = getSymbolMedal(sym);
        });
    });
}

/* ===== 8.2) XP Top3 medals ===== */
async function initXpTop3() {
    try {
        const { entries: xpEntries } = await window.xpTop3API.get();
        window.xpRankMap = new Map((xpEntries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.rank) || 0]));
    } catch {}

    state.xpTop3Unsub = window.xpTop3API.onUpdate?.(({ entries }) => {
        window.xpRankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.rank) || 0]));
        // Update XP swords on visible cards
        state.container?.querySelectorAll(".ticker-card").forEach((card) => {
            const sym = card.dataset.symbol?.toUpperCase();
            const xpTrophyEl = card.querySelector('.trophy-xp');
            if (sym && xpTrophyEl) {
                xpTrophyEl.outerHTML = getSymbolXpTrophy(sym);
            } else if (getSymbolXpTrophy(sym)) {
                // Add XP trophy if it doesn't exist but should
                const lvEl = card.querySelector('.lv');
                if (lvEl) {
                    lvEl.insertAdjacentHTML('beforeend', getSymbolXpTrophy(sym));
                }
            }
        });
    });
}

window.addEventListener("beforeunload", () => {
    if (state.top3Unsub) state.top3Unsub();
    if (state.ratingTop3Unsub) state.ratingTop3Unsub();
    if (state.xpTop3Unsub) state.xpTop3Unsub();
});

/* ===== 9) Boot ===== */
async function boot() {
    // Preload critical fonts
    if (window.fontLoader) {
        await window.fontLoader.preloadCriticalFonts();
    }
    
    // Initialize header component
    const headerContainer = document.getElementById("header-container");
    if (headerContainer && window.HeaderComponent) {
        new window.HeaderComponent(headerContainer, {
            icon: "🛡️",
            text: "Heroes of Myth and Momentum (sustained)",
            className: "heroes-header"
        });
        
    }
    
    state.container = document.getElementById("heroes");
    if (!state.container) return;

    // Settings are now managed by Electron stores
    try {
        state.buffsMaster = (await window.electronAPI.getBuffs()) || [];
        window.electronAPI.onBuffsUpdate?.((b) => {
            state.buffsMaster = b || [];
            markDirty();
        });
    } catch {}
    
    // heroes settings
    try {
        state.heroesSettings = await window.electronAPI.ipc.invoke("heroes-settings:get");
    } catch {}
    
    // traderview settings
    try {
        state.traderviewSettings = await window.electronAPI.ipc.invoke("traderview-settings:get");
    } catch {}
    
    // world settings
    try {
        state.worldSettings = await window.worldSettingsAPI.get();
    } catch {}

    // seed from store
    try {
        const symbols = await window.heroesAPI.getSymbols();
        symbols.forEach((s) => {
            const sym = s.symbol;
            if (!state.heroes[sym]) {
                state.heroes[sym] = {
                    hero: sym,
                    price: s.price || 1,
                    hue: s.hue ?? 0,
                    hp: 0,
                    dp: 0,
                    score: 0,
                    xp: s.xp || 0,
                    lv: s.lv || 1,
                    totalXpGained: s.totalXpGained || 0,
                    strength: s.one_min_volume || 0,
                    lastEvent: { hp: 0, dp: 0 },
                    buffs: s.buffs || {}, // already hydrated by store
                    sessionHigh: s.sessionHigh ?? s.price ?? 1,
                    lastUpdate: Date.now(),
                };
            }
        });
    } catch {}

    // Settings are now managed by Electron stores
    
    // heroes settings listener
    window.electronAPI.ipc?.send("heroes-settings:subscribe");
    window.electronAPI.ipc?.on("heroes-settings:change", (_event, heroesSettings) => {
        state.heroesSettings = heroesSettings || { listLength: 3 };
        markDirty();
    });
    
    // traderview settings listener
    window.electronAPI.ipc?.send("traderview-settings:subscribe");
    window.electronAPI.ipc?.on("traderview-settings:change", (_event, traderviewSettings) => {
        state.traderviewSettings = traderviewSettings || {};
        markDirty();
    });
    
    // world settings listener
    window.worldSettingsAPI.onUpdate((worldSettings) => {
        state.worldSettings = worldSettings || {};
        markDirty();
    });

    // ============================
    // Alert Event Listener
    // ============================
    
    // TEST: Check if the API is available
    console.log("🔍 [HEROES] Checking if eventsAPI is available:", {
        hasEventsAPI: !!window.eventsAPI,
        hasOnAlert: !!(window.eventsAPI?.onAlert),
        eventsAPIType: typeof window.eventsAPI,
        onAlertType: typeof window.eventsAPI?.onAlert
    });
    
    if (!window.eventsAPI || !window.eventsAPI.onAlert) {
        console.error("❌ [HEROES] eventsAPI.onAlert is NOT available! This is why alerts aren't working!");
        return;
    }
    
    console.log("✅ [HEROES] eventsAPI.onAlert is available, setting up listener...");
    
    window.eventsAPI.onAlert(handleAlertEvent);

    window.storeAPI.onHeroUpdate?.((payload) => {
        const items = Array.isArray(payload) ? payload : [payload];
        items.forEach(({ hero, buffs, price, one_min_volume, sessionHigh, lastEvent, xp, lv, totalXpGained }) => {
            if (!hero) return;
            const sym = String(hero).toUpperCase();
            const h =
                state.heroes[sym] ||
                (state.heroes[sym] = {
                    hero: sym,
                    price: price || 1,
                    hue: 0,
                    hp: 0,
                    dp: 0,
                    score: 0,
                    xp: 0,
                    lv: 1,
                    totalXpGained: 0,
                    strength: one_min_volume || 0,
                    lastEvent: { hp: 0, dp: 0 },
                    buffs: {},
                    sessionHigh: sessionHigh ?? price ?? 1,
                    lastUpdate: 0,
                });

            if (Number.isFinite(price)) h.price = price;
            if (Number.isFinite(one_min_volume)) h.strength = one_min_volume;
            if (Number.isFinite(sessionHigh)) h.sessionHigh = sessionHigh;
            if (lastEvent) h.lastEvent = lastEvent;
            if (Number.isFinite(xp)) h.xp = xp;
            if (Number.isFinite(lv)) h.lv = lv;
            if (Number.isFinite(totalXpGained)) h.totalXpGained = totalXpGained;
            if (buffs && Object.keys(buffs).length) h.buffs = buffs;

            h.lastUpdate = Date.now();
        });
        markDirty();
    });

    await initTop3();
    await initRatingTop3();
    await initXpTop3();

    // Initialize trophy data from the change top3 store
    try {
        const { entries: trophyData } = await window.changeTop3API.get();
        state.trophyMap = new Map(trophyData.map((t) => [t.symbol.toUpperCase(), t.trophy]));
        console.log("🏆 [HEROES] Initial trophy data loaded from change top3:", state.trophyMap);
    } catch (error) {
        console.error("❌ [HEROES] Failed to load initial trophy data:", error);
    }

    // Subscribe to trophy updates from change top3
    window.changeTop3API.onUpdate?.(({ entries: trophyData }) => {
        console.log("🏆 [HEROES] Trophy update received from change top3:", trophyData);
        state.trophyMap = new Map(trophyData.map((t) => [t.symbol.toUpperCase(), t.trophy]));
        
        // Update visible cards with new trophies
        state.container?.querySelectorAll(".ticker-card").forEach((card) => {
            const sym = card.dataset.symbol?.toUpperCase();
            const medalEl = card.querySelector(".lv-medal");
            if (sym && medalEl) {
                medalEl.innerHTML = getSymbolMedal(sym);
                
                // Update trophy separately
                const trophyEl = card.querySelector('.trophy');
                if (trophyEl) {
                    const trophy = getSymbolTrophy(sym);
                    trophyEl.outerHTML = trophy;
                } else if (getSymbolTrophy(sym)) {
                    // Add trophy if it doesn't exist but should
                    const lvEl = card.querySelector('.lv');
                    if (lvEl) {
                        lvEl.insertAdjacentHTML('beforeend', getSymbolTrophy(sym));
                    }
                }
            }
        });
    });

    startScoreDecay();
    markDirty();
}

/* ===== 10) DOM ready ===== */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch((e) => console.error("heroes boot failed:", e)));
} else {
    boot().catch((e) => console.error("heroes boot failed:", e));
}
