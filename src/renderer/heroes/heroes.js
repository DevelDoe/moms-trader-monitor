// heroes.clean.js — consume store buffs (Frontline style), minimal & maintainable

/* ===== 0) Config ===== */
const DECAY_INTERVAL_MS = 6000;
const XP_DECAY_PER_TICK = 0.2;
const SCORE_NORMALIZATION = 5;
const BASE_MAX_HP = 30;
const ACTIVE_TICKER_UPDATE_INTERVAL = 3 * 60 * 1000;
const MIN_UPDATE_INTERVAL = 5000;
const MAX_STRENGTH = 1_000_000;

/* ===== 1) State ===== */
const state = {
    heroes: Object.create(null),
    container: null,
    settings: {},
    buffsMaster: [], // only for volume color; buffs themselves come from store
    rafPending: false,
    renderKey: "",
    maxHP: BASE_MAX_HP,

    // rotation & TradingView sync
    lastTopSymbolsKey: "",
    currentActiveTicker: null,
    lastActiveTickerUpdate: 0,
    lastTickerSetAt: 0,

    // medals
    rankMap: new Map(),
    top3Unsub: null,
};

/* ===== 2) Utils ===== */
const medalForRank = (r) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : "");
const getSymbolMedal = (s) => medalForRank(state.rankMap.get(String(s || "").toUpperCase()) || 0);

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

const BUFF_SORT_ORDER = ["float", "volume", "news", "bio", "weed", "space", "newHigh", "bounceBack", "highShort", "netLoss", "hasS3", "dilutionRisk", "china", "lockedShares"];
const placeholderDot = `<span class="buff-icon" style="opacity:.0">•</span>`;

function buildBuffRows(h) {
    const arr = Object.entries(h.buffs || {}).map(([key, v]) => ({
        ...(v || {}),
        key,
        _sortKey: key.toLowerCase().startsWith("float") ? "float" : key.toLowerCase().includes("vol") ? "volume" : key,
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
            ? xs.map((b) => `<span class="buff-icon ${b.isBuff ? "buff-positive" : b.isBuff === false ? "buff-negative" : ""}" title="${b.desc || ""}">${b.icon || "•"}</span>`).join("")
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
    const faded = Date.now() - (h.lastUpdate || 0) > 10_000 ? "opacity:.8; filter:grayscale(.8);" : "";
    const { posHTML, neuHTML, negHTML } = buildBuffRows(h);

    card.innerHTML = `
    <div class="ticker-header-grid">
      <div class="ticker-info">
        <div class="ticker-symbol" style="background-color:${window.helpers.getSymbolColor(h.hue || 0)}; ${faded}">
          $${h.hero}
          <span class="lv">
            <span class="lv-medal">${getSymbolMedal(h.hero)}</span>
            <span class="lv-price">$${(h.price ?? 0).toFixed(2)}</span>
          </span>
        </div>
        <div class="bar-text stats lv" style="font-size:6px;margin-top:4px">L <span style="color:white;">${h.lv ?? 1}</span></div>
        <div class="bar-text stats x"  style="font-size:6px;margin-top:4px">X <span style="color:#04f370;">${Math.floor(totalXp)}</span></div>
        <div class="bar-text stats ch" style="font-size:6px;margin-top:4px">C <span style="color:#fd5151;">${(h.hp || 0).toFixed(0)}%</span></div>
        <div class="bar-text stats"    style="font-size:6px;margin-top:4px">V <span style="color:${impact.style.color};">${window.helpers.abbreviatedValues(h.strength || 0)}</span></div>
      </div>

      <div class="buff-container">
        <div class="buff-row positive">${posHTML}</div>
        <div class="buff-row neutral">${neuHTML}</div>
        <div class="buff-row negative">${negHTML}</div>
      </div>
    </div>

    <div class="bars">
      <div class="bar"><div class="bar-fill xp"       style="width:${xpPercent}%"><span class="bar-text">XP: ${Math.floor(totalXp)} / ${xpForNextLevel}</span></div></div>
      <div class="bar"><div class="bar-fill hp"       style="width:${Math.min((h.hp / state.maxHP) * 100, 100)}%"><span class="bar-text">HP: ${(h.hp || 0).toFixed(0)}</span></div></div>
      <div class="bar"><div class="bar-fill strength" style="background-color:${impact.style.color}; width:${Math.min((h.strength / MAX_STRENGTH) * 100, 100)}%">
        <span class="bar-text">STRENGTH: ${Math.floor((h.strength || 0) / 100_000)}k</span>
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

    const priceEl = card.querySelector(".lv-price");
    if (priceEl) priceEl.textContent = `$${(h.price ?? 0).toFixed(2)}`;

    const medalEl = card.querySelector(".lv-medal");
    if (medalEl) medalEl.textContent = getSymbolMedal(sym);

    const impact = window.hlpsFunctions?.calculateImpact?.(h.strength || 0, h.price || 0, state.buffsMaster) || { style: { color: "" } };
    const { xpPercent } = window.helpers.getXpProgress(h);

    const setWidth = (sel, pct) => {
        const el = card.querySelector(sel);
        if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    };
    setWidth(".bar-fill.xp", xpPercent);
    setWidth(".bar-fill.hp", Math.min((h.hp / state.maxHP) * 100, 100));
    setWidth(".bar-fill.strength", Math.min((h.strength / MAX_STRENGTH) * 100, 100));

    const strBar = card.querySelector(".bar-fill.strength");
    if (strBar) strBar.style.backgroundColor = impact.style.color;

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

    const topN = state.settings?.top?.heroesListLength ?? 10;
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
            const n = state.settings?.top?.traderviewWindowCount ?? 3;
            window.traderviewAPI.setTopTickers(topSymbols.slice(0, n));
            state.lastTickerSetAt = now;
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

        const topN = state.settings?.top?.heroesListLength ?? 10;
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

/* ===== 7) Alerts → State (minimal) ===== */
function handleAlertEvent(evt) {
    const minPrice = state.settings?.top?.minPrice ?? 0;
    const maxPrice = state.settings?.top?.maxPrice > 0 ? state.settings.top.maxPrice : Infinity;
    if (!evt?.hero) return;
    if ((evt.one_min_volume ?? 0) <= 30000) return;
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
            buffs: {}, // will be overwritten by store if present
            highestPrice: evt.price || 1,
            lastUpdate: 0,
        });

    h.price = evt.price ?? h.price;
    h.hue = evt.hue ?? h.hue;
    h.strength = evt.one_min_volume ?? h.strength;

    if (evt.hp > 0) h.hp += evt.hp;
    if (evt.dp > 0) h.hp = Math.max(h.hp - evt.dp, 0);

    h.history = h.history || [];
    h.history.push({ hp: evt.hp || 0, dp: evt.dp || 0, ts: Date.now() });
    if (h.history.length > 10) h.history.shift();

    const delta = window.helpers.calculateScore(h, evt);
    h.score = Math.max(0, (h.score || 0) + delta);
    h.lastEvent = { hp: evt.hp || 0, dp: evt.dp || 0, score: delta };
    h.lastUpdate = Date.now();

    if (h.hp > state.maxHP) state.maxHP = h.hp * 1.05;

    // If your alerts carry hydrated buffs, keep this:
    if (evt.buffs && Object.keys(evt.buffs).length) h.buffs = evt.buffs;

    markDirty();
}

/* ===== 8) Top3 medals ===== */
async function initTop3() {
    try {
        const { entries } = await window.top3API.get();
        state.rankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.rank) || 0]));
    } catch {}
    state.top3Unsub = window.top3API.subscribe?.(({ entries }) => {
        state.rankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.rank) || 0]));
        state.container?.querySelectorAll(".ticker-card").forEach((card) => {
            const sym = card.dataset.symbol?.toUpperCase();
            const el = card.querySelector(".lv-medal");
            if (sym && el) el.textContent = medalForRank(state.rankMap.get(sym) || 0);
        });
    });
}
window.addEventListener("beforeunload", () => state.top3Unsub && state.top3Unsub());

/* ===== 9) Boot ===== */
async function boot() {
    state.container = document.getElementById("heroes");
    if (!state.container) return;

    try {
        state.settings = await window.settingsAPI.get();
    } catch {}
    try {
        state.buffsMaster = (await window.electronAPI.getBuffs()) || [];
        window.electronAPI.onBuffsUpdate?.((b) => {
            state.buffsMaster = b || [];
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
                    buffs: s.buffs || {}, // already hydrated by store
                    highestPrice: s.highestPrice ?? s.price ?? 1,
                    lastUpdate: Date.now(),
                };
            }
        });
    } catch {}

    // settings + alerts + store updates
    window.settingsAPI.onUpdate((s) => {
        state.settings = s || {};
        markDirty();
    });
    window.eventsAPI.onAlert(handleAlertEvent);

    window.storeAPI.onHeroUpdate?.((payload) => {
        const items = Array.isArray(payload) ? payload : [payload];
        items.forEach(({ hero, buffs, price, one_min_volume, highestPrice, lastEvent, xp, lv, totalXpGained }) => {
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
                    highestPrice: highestPrice ?? price ?? 1,
                    lastUpdate: 0,
                });

            if (Number.isFinite(price)) h.price = price;
            if (Number.isFinite(one_min_volume)) h.strength = one_min_volume;
            if (highestPrice !== undefined) h.highestPrice = highestPrice;
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
    startScoreDecay();
    markDirty();
}

/* ===== 10) DOM ready ===== */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch((e) => console.error("heroes boot failed:", e)));
} else {
    boot().catch((e) => console.error("heroes boot failed:", e));
}
