// heroes.js — Refactored to align with frontline.js structure

// ======================= CONFIGURATION =======================
const DECAY_INTERVAL_MS = 6000;
const XP_DECAY_PER_TICK = 0.2;
const SCORE_NORMALIZATION = 5;
const BASE_MAX_HP = 300;
const SCALE_DOWN_THRESHOLD = 0.2;
const SCALE_DOWN_FACTOR = 0.9;
const debugLimitSamples = 1500;
const ACTIVE_TICKER_UPDATE_INTERVAL = 3 * 60 * 1000; // 3 minutes
const MIN_UPDATE_INTERVAL = 5000;
const MAX_STRENGTH = 1_000_000;

// ======================= STATE =======================
const heroesState = {};
let container;

let maxHP = BASE_MAX_HP;
let lastTopHeroes = [];
let eventsPaused = false;
let buffs = [];

let currentTopHero = null;
let currentActiveTicker = null;
let lastActiveTickerUpdate = 0;
let lastTickerSetAt = 0;

// ======================= FLAGS =======================
window.isDev = window.appFlags?.isDev === true;
if (!window.isDev) {
    console.log = () => {};
    console.debug = () => {};
    console.info = () => {};
    console.warn = () => {};
}

// ============================
// Document Ready
// ============================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Hero window loaded");
    container = document.getElementById("heroes");

    try {
        await initializeBuffs();
        await initializeHeroes();
        setupListeners();
    } catch (err) {
        console.error("❌ Heroes initialization failed:", err);
    }
});

async function initializeBuffs() {
    try {
        const fetchedBuffs = await window.electronAPI.getBuffs();
        window.buffs = fetchedBuffs;

        window.electronAPI.onBuffsUpdate((updatedBuffs) => {
            if (window.isDev) console.log("🔄 Buffs updated via IPC:", updatedBuffs);
            window.buffs = updatedBuffs;
        });
    } catch (err) {
        console.error("❌ Failed to load buffs:", err);
    }
}

async function initializeHeroes() {
    const [settings, storeSymbols, restoredState] = await Promise.all([
        window.settingsAPI.get(),
        window.heroesAPI.getSymbols(),
        // window.heroesStateManager.loadState(),
    ]);

    window.settings = settings;
    if (restoredState) Object.assign(heroesState, restoredState);

    storeSymbols.forEach((s) => {
        if (!heroesState[s.symbol]) {
            heroesState[s.symbol] = {
                hero: s.symbol,
                price: s.price || 1,
                hue: s.hue ?? 0,
                hp: 0,
                dp: 0,
                score: 0,
                xp: s.xp || 0,
                lv: s.lv || 1,
                totalXpGained: s.totalXpGained || 0,
                lastEvent: { hp: 0, dp: 0 },
                floatValue: s.statistics?.floatShares || 0,
                buffs: s.buffs || {},
                highestPrice: s.highestPrice ?? s.price ?? 1,
            };
        }
    });

    debouncedRenderAll();
    window.helpers.startScoreDecay();
}

function setupListeners() {
    window.settingsAPI.onUpdate((updatedSettings) => {
        if (window.isDev) console.log("🎯 Settings updated:", updatedSettings);
        window.settings = updatedSettings;
        debouncedRenderAll();
    });

    window.eventsAPI.onAlert(handleAlertEvent);
    window.storeAPI.onHeroUpdate(window.heroesStateManager.updateHeroData);
    window.electronAPI.onXpReset(window.heroesStateManager.resetXpLevels);
    window.electronAPI.onNukeState(window.heroesStateManager.nukeState);
}

function handleAlertEvent(event) {
    const minPrice = window.settings?.top?.minPrice ?? 0;
    const maxPrice = window.settings?.top?.maxPrice > 0 ? window.settings.top.maxPrice : Infinity;

    if (event.one_min_volume <= 10000) {
        if (window.isDev) console.log(`⛔ Skipped ${event.hero} — low volume (${event.one_min_volume})`);
        return;
    }

    if (event.price < minPrice || event.price > maxPrice) {
        if (window.isDev) console.log(`🚫 ${event.hero} skipped — price $${event.price} out of range`);
        return;
    }

    if (!heroesState[event.hero]) {
        heroesState[event.hero] = {
            hero: event.hero,
            hue: event.hue ?? 0,
            price: event.price || 1,
            strength: event.one_min_volume || 0,
            hp: 0,
            dp: 0,
            score: 0,
            xp: 0,
            lv: 1,
            totalXpGained: 0,
            lastEvent: { hp: 0, dp: 0 },
            floatValue: 0,
            buffs: {},
            highestPrice: event.price || 1,
        };
        if (window.isDev) console.log(`🆕 Initialized new hero from alert: ${event.hero}`);
    }

    updateHeroFromEvent(event);
}

function updateHeroFromEvent(event) {
    if (eventsPaused) return;
    if (!event || !event.hero) {
        console.warn("Invalid event received:", event);
        return;
    }

    let hero = heroesState[event.hero];

    hero.price = event.price;
    hero.hue = event.hue ?? hero.hue ?? 0;
    hero.strength = event.one_min_volume || 0;

    const wasDead = hero.hp === 0 && event.hp > 0;
    if (wasDead && window.isDev) console.log(`💀 ${hero.hero} RISES FROM DEAD!`);

    const isReversal = hero.lastEvent.dp > 0 && event.hp > 0;
    if (isReversal && window.isDev) console.log(`🔄 ${hero.hero} REVERSAL!`);

    if (event.hp > 0) hero.hp += event.hp;
    if (event.dp > 0) hero.hp = Math.max(hero.hp - event.dp, 0);

    hero.lastEvent = {
        hp: event.hp || 0,
        dp: event.dp || 0,
    };

    hero.history = hero.history || [];
    hero.history.push({
        hp: event.hp || 0,
        dp: event.dp || 0,
        ts: Date.now(),
    });
    if (hero.history.length > 10) hero.history.shift();

    const scoreDelta = window.helpers.calculateScore(hero, event);
    hero.score = Math.max(0, (hero.score || 0) + scoreDelta);


    let needsFullRender = false;
    if (hero.hp > maxHP) {
        maxHP = hero.hp * 1.05;
        needsFullRender = true;
    }

    const topN = window.settings?.top?.heroesListLength ?? 10;
    const sortedHeroes = Object.values(heroesState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);

    const newTopHero = sortedHeroes[0]?.hero;
    const currentTopHeroes = sortedHeroes.slice(0, topN).map((s) => s.hero);
    const now = Date.now();

    if (newTopHero && newTopHero !== currentTopHero) {
        currentTopHero = newTopHero;
        if (window.activeAPI?.setActiveTicker) {
            window.activeAPI.setActiveTicker(newTopHero);
            currentActiveTicker = newTopHero;
            lastActiveTickerUpdate = now;
            if (window.isDev) console.log(`🏆 New top hero: ${newTopHero}`);
        }
    } else if (window.activeAPI?.setActiveTicker && currentTopHeroes.length > 0 && now - lastActiveTickerUpdate >= ACTIVE_TICKER_UPDATE_INTERVAL) {
        const candidates = currentTopHeroes.filter((h) => h !== currentActiveTicker);
        const selectedHero = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : currentTopHeroes[Math.floor(Math.random() * currentTopHeroes.length)];
        window.activeAPI.setActiveTicker(selectedHero);
        currentActiveTicker = selectedHero;
        lastActiveTickerUpdate = now;
        if (window.isDev) console.log(`🔀 Rotated to: ${selectedHero}`);
    }

    if (currentTopHeroes.length > 0) {
        const allBelowThreshold = currentTopHeroes.every((heroName) => {
            const hero = heroesState[heroName];
            return hero.hp < maxHP *SCALE_DOWN_THRESHOLD;
        });
        if (allBelowThreshold && maxHP > BASE_MAX_HP) {
            maxHP = Math.max(BASE_MAX_HP, maxHP * SCALE_DOWN_FACTOR);
            needsFullRender = true;
        }
    }

    if (needsFullRender || currentTopHeroes.join(",") !== lastTopHeroes.join(",")) {
        lastTopHeroes = currentTopHeroes;
        debouncedRenderAll();
        if (window.traderviewAPI?.setTopTickers && Date.now() - lastTickerSetAt > MIN_UPDATE_INTERVAL) {
            const traderviewWindowCount = window.settings?.top?.traderviewWindowCount ?? 3;
            const topForTradingView = currentTopHeroes.slice(0, traderviewWindowCount);
            window.traderviewAPI.setTopTickers(topForTradingView);
            lastTickerSetAt = Date.now();
            if (window.isDev) console.log(`🪞 Updated TradingView windows to:`, topForTradingView);
        }
    } else {
        debouncedUpdateCardDOM(event.hero);
    }

    hero.lastUpdate = Date.now();
    // window.heroesStateManager.saveState();
}

// Debounce helper
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

const debouncedRenderAll = debounce(renderAll, 80);
const debouncedUpdateCardDOM = debounce(updateCardDOM, 30);

function renderAll() {
    container.innerHTML = "";

    // 🔁 Calculate top heroes only once
    const topN = window.settings?.top?.heroesListLength ?? 3;
    const topHeroes = Object.values(heroesState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);

    // 🧱 Render top hero cards
    topHeroes.forEach((data) => {
        const card = renderCard(data);
        container.appendChild(card);
    });

    // 🧼 Clean up any zombie cards
    const topSymbols = topHeroes.map((s) => s.hero);
    document.querySelectorAll(".ticker-card").forEach((card) => {
        if (!topSymbols.includes(card.dataset.symbol)) {
            card.remove();
        }
    });
}


function updateCardDOM(hero) {
    if (!hero || !heroesState[hero]) {
        console.warn(`Hero "${hero}" not found in heroesState`);
        return;
    }

    const topN = window.settings?.top?.heroesListLength ?? 10;

    // 🎯 Determine if this hero is in the current top list
    const topSymbols = Object.values(heroesState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
        .map((s) => s.hero);

    if (!topSymbols.includes(hero)) return;

    const existing = document.querySelector(`.ticker-card[data-symbol="${hero}"]`);
    if (!existing) return;

    const newCard = renderCard(heroesState[hero]);

    // ♻️ Preserve bar widths visually between replacement
    ["xp", "hp", "strength"].forEach((type) => {
        const oldBar = existing.querySelector(`.bar-fill.${type}`);
        const newBar = newCard.querySelector(`.bar-fill.${type}`);
        if (oldBar && newBar) {
            newBar.style.width = getComputedStyle(oldBar).width;
        }
    });

    // 🔄 Replace DOM card instantly
    existing.replaceWith(newCard);

    // 🧠 Animate to new bar values
    requestAnimationFrame(() => {
        const state = heroesState[hero];
        const { xpPercent } = window.helpers.getXpProgress(state);

        function animateBar(selector, newWidth) {
            const bar = newCard.querySelector(selector);
            if (!bar) return;

            const oldWidth = parseFloat(bar.style.width) || 0;
            const newWidthValue = parseFloat(newWidth);

            if (Math.abs(oldWidth - newWidthValue) > 1) {
                bar.classList.add("bar-animate");
                bar.addEventListener("animationend", () => {
                    bar.classList.remove("bar-animate");
                }, { once: true });
            }

            bar.style.width = `${newWidth}`;
        }

        animateBar(".bar-fill.xp", `${xpPercent}%`);
        animateBar(".bar-fill.hp", `${Math.min((state.hp / maxHP) * 100, 100)}%`);
        animateBar(".bar-fill.strength", `${Math.min((state.strength / MAX_STRENGTH) * 100, 100)}%`);
    });
}

function renderCard({ hero, price, hp, dp, strength, lastEvent }) {
    const card = document.createElement("div");
    card.className = "ticker-card";
    card.dataset.symbol = hero;

    const state = heroesState[hero] || {
        hp: 0,
        dp: 0,
        lastEvent: { hp: 0, dp: 0 },
        score: 0,
        lv: 1,
        totalXpGained: 0,
    };

    const change = lastEvent.hp ? `+${lastEvent.hp.toFixed(2)}%` : lastEvent.dp ? `-${lastEvent.dp.toFixed(2)}%` : "";
    const changeClass = state.lastEvent.hp ? "hp-boost" : state.lastEvent.dp ? "dp-damage" : "";

    const volumeImpact = window.hlpsFunctions.calculateImpact(strength, price, window.buffs);
    const { totalXp, xpForNextLevel, xpPercent } = window.helpers.getXpProgress(state);
    const fadeStyle = Date.now() - (state.lastUpdate || 0) <= 30000 ? "" : "opacity: 0.5; filter: grayscale(0.4);";

    const sortOrder = [
        "float", "volume", "news", "bio", "weed", "space", "newHigh", "bounceBack", "highShort",
        "netLoss", "hasS3", "dilutionRisk", "china", "lockedShares"
    ];

    const buffsArray = Object.entries(state.buffs || {}).map(([originalKey, b]) => ({
        ...b,
        key: originalKey,
        _sortKey: originalKey.toLowerCase().includes("vol") ? "volume" : originalKey,
    }));

    const sortBuffs = (arr) => arr.sort((a, b) => {
        const aIndex = sortOrder.indexOf(a._sortKey);
        const bIndex = sortOrder.indexOf(b._sortKey);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });

    const positiveBuffs = sortBuffs(buffsArray.filter((b) => b.isBuff === true));
    const negativeBuffs = sortBuffs(buffsArray.filter((b) => b.isBuff === false));
    const neutralBuffs = sortBuffs(buffsArray.filter((b) => b.isBuff === undefined));
    const placeholder = `<span class="buff-icon" style="opacity: 0;">•</span>`;

    const buffHtml = `
        <div class="buff-container">
            <div class="buff-row positive">
                ${positiveBuffs.length ? positiveBuffs.map((buff) => `<span class="buff-icon" title="${buff.desc}">${buff.icon}</span>`).join("") : placeholder}
            </div>
            <div class="buff-row neutral">
                ${neutralBuffs.length ? neutralBuffs.map((buff) => `<span class="buff-icon" title="${buff.desc}">${buff.icon}</span>`).join("") : placeholder}
            </div>
            <div class="buff-row negative">
                ${negativeBuffs.length ? negativeBuffs.map((buff) => `<span class="buff-icon" title="${buff.desc}">${buff.icon}</span>`).join("") : placeholder}
            </div>
        </div>
    `;

    card.innerHTML = `
        <div class="ticker-header-grid">
            <div class="ticker-info">
                <div class="ticker-symbol" style="background-color:${window.helpers.getSymbolColor(state.hue || 0)}; ${fadeStyle}">
                    $${hero}<span class="lv">$${state.price.toFixed(2)}</span>
                </div>
                <div id="change">${change ? `<div class="${changeClass}">${change}</div>` : ""}</div>
               <div id="lv"><span class="bar-text stats lv" style="font-size: 6px; margin-top:4px">L <span style="color:white;"> ${state.lv}</span></span></div>
                <div id="x"><span class="bar-text stats x" style="font-size: 6px; margin-top:4px">X <span style="color:#04f370;">  ${totalXp}</span></span></div>
                <div id="ch"><span class="bar-text stats ch" style="font-size: 6px; margin-top:4px">C <span style="color:#fd5151;"> ${hp.toFixed(0)}%</span></span></div>
                <div id="vo"><span class="bar-text stats" style=" font-size: 6px; margin-top:4px">V <span style="color:${volumeImpact.style.color};">  ${window.helpers.abbreviatedValues(strength)}</span></span></div>
            </div>
            ${buffHtml}
        </div>

        <div class="bars">
            <div class="bar">
                <div class="bar-fill xp" style="width: ${xpPercent}%">
                    <span class="bar-text">XP: ${Math.floor(totalXp)} / ${xpForNextLevel}</span>
                </div>
            </div>
            <div class="bar">
                <div class="bar-fill hp" style="width: ${Math.min((hp / maxHP) * 100, 100)}%">
                    <span class="bar-text">HP: ${hp.toFixed(0)}</span>
                </div>
            </div>
            <div class="bar">
                <div class="bar-fill strength" style="background-color: ${volumeImpact.style.color}; width: ${Math.min((strength / MAX_STRENGTH) * 100, 100)}%">
                    <span class="bar-text">STRENGTH: ${Math.floor(strength / 1000)}k</span>
                </div>
            </div>
        </div>
    `;

    const symbolElement = card.querySelector(".ticker-symbol");
    symbolElement.onclick = (e) => {
        e.stopPropagation();
        try {
            navigator.clipboard.writeText(hero);
            console.log(`📋 Copied ${hero} to clipboard`);
            window.activeAPI?.setActiveTicker?.(hero);
            lastClickedSymbol = hero;

            symbolElement.classList.add("symbol-clicked");
            setTimeout(() => symbolElement.classList.remove("symbol-clicked"), 200);
        } catch (err) {
            console.error(`⚠️ Failed to handle click for ${hero}:`, err);
        }
    };

    return card;
}
