// heroes.refactor.js — aligns with frontline pattern (state → markDirty → render)

/* ======================= 0) Config ======================= */
const DECAY_INTERVAL_MS = 6000;
const XP_DECAY_PER_TICK = 0.2;
const SCORE_NORMALIZATION = 5;
const BASE_MAX_HP = 30;
const SCALE_DOWN_THRESHOLD = 0.2; // when all below this fraction of maxHP, shrink maxHP
const SCALE_DOWN_FACTOR = 0.9;
const ACTIVE_TICKER_UPDATE_INTERVAL = 3 * 60 * 1000; // 3 min
const MIN_UPDATE_INTERVAL = 5000; // for TradingView setTopTickers
const MAX_STRENGTH = 1_000_000;

window.isDev = window.appFlags?.isDev === true;

/* ======================= 1) State ======================= */
const state = {
    heroes: Object.create(null), // symbol -> hero record
    container: null,
    settings: {},
    buffs: [],
    rafPending: false,
    renderKey: "", // 🔑 visible lineup hash
    maxHP: BASE_MAX_HP,

    // top/rotation mirrors
    lastTopSymbolsKey: "",
    currentTopHero: null,
    currentActiveTicker: null,
    lastActiveTickerUpdate: 0,
    lastTickerSetAt: 0,

    // medals/top3
    rankMap: new Map(),
    top3Unsub: null,
};

/* ======================= 2) Utilities ======================= */
const medalForRank = (r) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : "");
const getSymbolMedal = (s) => medalForRank(state.rankMap.get(String(s || "").toUpperCase()) || 0);

/* ======================= 3) Render scheduling ======================= */
function markDirty() {
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(() => {
        state.rafPending = false;
        render();
    });
}

function createCard(h) {
    const card = document.createElement("div");
    card.className = "ticker-card";
    card.dataset.symbol = h.hero;

    const changeText = h.lastEvent?.hp ? `+${h.lastEvent.hp.toFixed(2)}%` : h.lastEvent?.dp ? `-${h.lastEvent.dp.toFixed(2)}%` : "";

    // external helpers expected to exist:
    // - window.helpers.getSymbolColor(h.hue)
    // - window.hlpsFunctions.calculateImpact(strength, price, buffs)
    // - window.helpers.getXpProgress(stateObj) -> { totalXp, xpForNextLevel, xpPercent }
    const volImpact = window.hlpsFunctions.calculateImpact(h.strength || 0, h.price || 0, state.buffs);
    const { totalXp, xpForNextLevel, xpPercent } = window.helpers.getXpProgress(h);

    const fadeStyle = Date.now() - (h.lastUpdate || 0) <= 10_000 ? "" : "opacity:.8; filter:grayscale(.8);";

    // buffs (grouped + inline)
    const sortOrder = ["float", "volume", "news", "bio", "weed", "space", "newHigh", "bounceBack", "highShort", "netLoss", "hasS3", "dilutionRisk", "china", "lockedShares"];
    const toBuffRow = (arr) =>
        arr
            .sort((a, b) => (sortOrder.indexOf(a._sortKey) ?? 999) - (sortOrder.indexOf(b._sortKey) ?? 999))
            .map((b) => `<span class="buff-icon ${b.isBuff ? "buff-positive" : b.isBuff === false ? "buff-negative" : ""}" title="${b.desc || ""}">${b.icon || "•"}</span>`)
            .join("");

    const buffsArray = Object.entries(h.buffs || {}).map(([key, b]) => ({
        ...(b || {}),
        key,
        _sortKey: key.toLowerCase().includes("vol") ? "volume" : key,
    }));
    const pos = buffsArray.filter((b) => b.isBuff === true);
    const neg = buffsArray.filter((b) => b.isBuff === false);
    const neu = buffsArray.filter((b) => b.isBuff === undefined);

    card.innerHTML = `
    <div class="ticker-header-grid">
      <div class="ticker-info">
        <div class="ticker-symbol" style="background-color:${window.helpers.getSymbolColor(h.hue || 0)}; ${fadeStyle}">
          $${h.hero}
          <span class="lv">
            <span class="lv-medal">${getSymbolMedal(h.hero)}</span>
            <span class="lv-price">$${(h.price ?? 0).toFixed(2)}</span>
          </span>
        </div>
        <div id="lv"><span class="bar-text stats lv" style="font-size:6px;margin-top:4px">L <span style="color:white;"> ${h.lv ?? 1}</span></span></div>
        <div id="x"><span class="bar-text stats x" style="font-size:6px;margin-top:4px">X <span style="color:#04f370;"> ${Math.floor(totalXp)}</span></span></div>
        <div id="ch"><span class="bar-text stats ch" style="font-size:6px;margin-top:4px">C <span style="color:#fd5151;"> ${(h.hp || 0).toFixed(0)}%</span></span></div>
        <div id="vo"><span class="bar-text stats" style="font-size:6px;margin-top:4px">V <span style="color:${volImpact.style.color};"> ${window.helpers.abbreviatedValues(
        h.strength || 0
    )}</span></span></div>
      </div>

      <div class="buff-container">
        <div class="buff-row positive">${pos.length ? toBuffRow(pos) : `<span class="buff-icon" style="opacity:.0">•</span>`}</div>
        <div class="buff-row neutral">${neu.length ? toBuffRow(neu) : `<span class="buff-icon" style="opacity:.0">•</span>`}</div>
        <div class="buff-row negative">${neg.length ? toBuffRow(neg) : `<span class="buff-icon" style="opacity:.0">•</span>`}</div>
      </div>
    </div>

    <div class="bars">
      <div class="bar">
        <div class="bar-fill xp" style="width:${xpPercent}%">
          <span class="bar-text">XP: ${Math.floor(totalXp)} / ${xpForNextLevel}</span>
        </div>
      </div>
      <div class="bar">
        <div class="bar-fill hp" style="width:${Math.min((h.hp / state.maxHP) * 100, 100)}%">
          <span class="bar-text">HP: ${(h.hp || 0).toFixed(0)}</span>
        </div>
      </div>
      <div class="bar">
        <div class="bar-fill strength" style="background-color:${volImpact.style.color}; width:${Math.min((h.strength / MAX_STRENGTH) * 100, 100)}%">
          <span class="bar-text">STRENGTH: ${Math.floor((h.strength || 0) / 100_000)}k</span>
        </div>
      </div>
    </div>
  `;

    const symbolEl = card.querySelector(".ticker-symbol");
    symbolEl.onclick = (e) => {
        e.stopPropagation();
        try {
            navigator.clipboard.writeText(h.hero);
            window.activeAPI?.setActiveTicker?.(h.hero);
            symbolEl.classList.add("symbol-clicked");
            setTimeout(() => symbolEl.classList.remove("symbol-clicked"), 200);
        } catch {}
    };

    return card;
}

function patchCardDOM(sym, h) {
    const card = state.container.querySelector(`.ticker-card[data-symbol="${sym}"]`);
    if (!card) return;

    const priceEl = card.querySelector(".lv-price");
    if (priceEl) priceEl.textContent = `$${(h.price ?? 0).toFixed(2)}`;

    const medalEl = card.querySelector(".lv-medal");
    if (medalEl) medalEl.textContent = getSymbolMedal(sym);

    // animate bars towards new widths
    const volImpact = window.hlpsFunctions.calculateImpact(h.strength || 0, h.price || 0, state.buffs);
    const { xpPercent } = window.helpers.getXpProgress(h);

    const setWidth = (selector, pct) => {
        const el = card.querySelector(selector);
        if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    };
    setWidth(".bar-fill.xp", xpPercent);
    setWidth(".bar-fill.hp", Math.min((h.hp / state.maxHP) * 100, 100));
    setWidth(".bar-fill.strength", Math.min((h.strength / MAX_STRENGTH) * 100, 100));

    const strBar = card.querySelector(".bar-fill.strength");
    if (strBar) strBar.style.backgroundColor = volImpact.style.color;

}

/* ======================= 5) Render ======================= */
function render() {
    if (!state.container) return;

    const topN = state.settings?.top?.heroesListLength ?? 10;
    const list = Object.values(state.heroes)
        .filter((h) => (h.score || 0) > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);

    // 🔑 build a key to detect meaningful UI changes
    const key = list.map((h) => `${h.hero}:${Math.round(h.score)}:${Math.round(h.hp)}`).join(",");
    if (key === state.renderKey) {
        // only patch values (cheaper than rebuilding)
        list.forEach((h) => patchCardDOM(h.hero, h));
        return;
    }
    state.renderKey = key;

    // Reconcile DOM order and content
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

    // ——— active ticker rotation + TradingView sync ———
    const now = Date.now();
    const topSymbols = list.map((h) => h.hero);
    const topKey = topSymbols.join(",");
    const newTopHero = topSymbols[0];

    if (newTopHero && newTopHero !== state.currentTopHero) {
        state.currentTopHero = newTopHero;
        if (window.activeAPI?.setActiveTicker) {
            window.activeAPI.setActiveTicker(newTopHero);
            state.currentActiveTicker = newTopHero;
            state.lastActiveTickerUpdate = now;
        }
    } else if (window.activeAPI?.setActiveTicker && topSymbols.length > 0 && now - state.lastActiveTickerUpdate >= ACTIVE_TICKER_UPDATE_INTERVAL) {
        const candidates = topSymbols.filter((s) => s !== state.currentActiveTicker);
        const pick = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : topSymbols[Math.floor(Math.random() * topSymbols.length)];
        window.activeAPI.setActiveTicker(pick);
        state.currentActiveTicker = pick;
        state.lastActiveTickerUpdate = now;
    }

    if (topKey !== state.lastTopSymbolsKey) {
        state.lastTopSymbolsKey = topKey;
        if (window.traderviewAPI?.setTopTickers && now - state.lastTickerSetAt > MIN_UPDATE_INTERVAL) {
            const n = state.settings?.top?.traderviewWindowCount ?? 3;
            window.traderviewAPI.setTopTickers(topSymbols.slice(0, n));
            state.lastTickerSetAt = now;
        }
    }
}

/* ======================= 6) Score decay ======================= */
function startScoreDecay() {
    setInterval(() => {
        let changed = false;
        const vals = Object.values(state.heroes);
        for (const h of vals) {
            const prev = h.score || 0;
            if (prev <= 0) continue;
            const scale = 1 + prev / SCORE_NORMALIZATION;
            const dec = XP_DECAY_PER_TICK * scale;
            const next = Math.max(0, prev - dec);
            if (next !== prev) {
                h.score = next;
                h.lastEvent = h.lastEvent || {};
                h.lastEvent.hp = 0;
                h.lastEvent.dp = 0;
                changed = true;
            }
        }
        if (!changed) return;

        // scale down maxHP if everything fell
        const topN = state.settings?.top?.heroesListLength ?? 10;
        const top = vals
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topN);
        if (top.length) {
            const allBelow = top.every((x) => (x.hp || 0) < state.maxHP * SCALE_DOWN_THRESHOLD);
            if (allBelow && state.maxHP > BASE_MAX_HP) {
                state.maxHP = Math.max(BASE_MAX_HP, state.maxHP * SCALE_DOWN_FACTOR);
            }
        }
        markDirty();
    }, DECAY_INTERVAL_MS);
}

/* ======================= 7) Events → State ======================= */
function handleAlertEvent(evt) {
    const minPrice = state.settings?.top?.minPrice ?? 0;
    const maxPrice = state.settings?.top?.maxPrice > 0 ? state.settings.top.maxPrice : Infinity;

    if (!evt?.hero) return;
    if ((evt.one_min_volume ?? 0) <= 30_000) return;
    if (evt.price < minPrice || evt.price > maxPrice) return;

    const sym = String(evt.hero).toUpperCase();
    const h =
        state.heroes[sym] ||
        (state.heroes[sym] = {
            hero: sym,
            price: evt.price || 1,
            hue: evt.hue ?? 0,
            hp: 0,
            dp: 0,
            score: 0,
            xp: 0,
            lv: 1,
            totalXpGained: 0,
            strength: evt.one_min_volume || 0,
            lastEvent: { hp: 0, dp: 0 },
            floatValue: 0,
            buffs: evt.buffs || {},
            highestPrice: evt.price || 1,
            lastUpdate: 0,
        });

    h.price = evt.price ?? h.price;
    h.hue = evt.hue ?? h.hue;
    h.strength = evt.one_min_volume ?? h.strength;
    if (evt.buffs && Object.keys(evt.buffs).length) h.buffs = evt.buffs;

    if (evt.hp > 0) h.hp += evt.hp;
    if (evt.dp > 0) h.hp = Math.max(h.hp - evt.dp, 0);

    // history (bounded)
    h.history = h.history || [];
    h.history.push({ hp: evt.hp || 0, dp: evt.dp || 0, ts: Date.now() });
    if (h.history.length > 10) h.history.shift();

    const delta = window.helpers.calculateScore(h, evt);
    h.score = Math.max(0, (h.score || 0) + delta);
    h.lastEvent = { hp: evt.hp || 0, dp: evt.dp || 0, score: delta };
    h.lastUpdate = Date.now();

    // grow maxHP if needed
    if (h.hp > state.maxHP) state.maxHP = h.hp * 1.05;

    markDirty();
}

/* ======================= 8) Top3 medals ======================= */
async function initTop3() {
    try {
        const { entries } = await window.top3API.get();
        state.rankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.rank) || 0]));
    } catch {}

    state.top3Unsub = window.top3API.subscribe?.(({ entries }) => {
        state.rankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.rank) || 0]));
        // patch medals for visible cards
        state.container?.querySelectorAll(".ticker-card").forEach((card) => {
            const sym = card.dataset.symbol?.toUpperCase();
            const el = card.querySelector(".lv-medal");
            if (sym && el) el.textContent = medalForRank(state.rankMap.get(sym) || 0);
        });
    });
}

window.addEventListener("beforeunload", () => {
    if (state.top3Unsub) state.top3Unsub();
});

/* ======================= 9) Boot ======================= */
async function boot() {
    state.container = document.getElementById("heroes");
    if (!state.container) return;

    // settings + buffs
    try {
        state.settings = await window.settingsAPI.get();
    } catch {}
    try {
        state.buffs = await window.electronAPI.getBuffs();
        window.electronAPI.onBuffsUpdate?.((b) => {
            state.buffs = b || [];
            markDirty();
        });
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
                    floatValue: s.statistics?.floatShares || 0,
                    buffs: s.buffs || {},
                    highestPrice: s.highestPrice ?? s.price ?? 1,
                    lastUpdate: Date.now(),
                };
            }
        });
    } catch (e) {
        log("heroes seed failed:", e);
    }

    // listeners
    window.settingsAPI.onUpdate((s) => {
        state.settings = s || {};
        markDirty();
    });
    window.eventsAPI.onAlert(handleAlertEvent);

    // keep: external managers (if you still use them)
    window.storeAPI.onHeroUpdate?.(window.heroesStateManager?.updateHeroData);
    window.electronAPI.onXpReset?.(window.heroesStateManager?.resetXpLevels);
    window.electronAPI.onNukeState?.(window.heroesStateManager?.nukeState);

    // medals
    await initTop3();

    // decay loop
    startScoreDecay();

    // first paint
    markDirty();
}

/* ======================= 10) DOM ready ======================= */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch((e) => console.error("heroes boot failed:", e)));
} else {
    boot().catch((e) => console.error("heroes boot failed:", e));
}
