// frontlineState.js
// ======================= CONFIGURATION =======================
const DECAY_INTERVAL_MS = 1000;
const XP_DECAY_PER_TICK = 0.2; // Decay per tick
const SCORE_NORMALIZATION = 2; // Higher = slower decay influence
const BASE_MAX_SCORE = 10_000;
const BASE_MAX_HP = 10;
const SCALE_DOWN_THRESHOLD = 1; // 20%
const SCALE_DOWN_FACTOR = 0.9; // Reduce by 10%
const debugLimitSamples = 1500;

// ======================= STATE =======================
const frontlineState = {};
let container;

let maxHP = BASE_MAX_HP;
let maxScore = BASE_MAX_SCORE;
let lastTopHeroes = [];
let eventsPaused = false;
let buffs = [];

// ======================= FLAGS =======================
window.isDev = window.appFlags?.isDev === true;

if (!window.isDev) {
    console.log = () => {};
    console.debug = () => {};
    console.info = () => {};
    console.warn = () => {};
}

// ======================= DEBUG =======================
let debugSamples = 10;

console.log("🎯 Fresh start mode:", window.isDev);
console.log("🐛 isDev mode:", window.isDev);

// ============================
// Document Ready
// ============================
document.addEventListener("DOMContentLoaded", async () => {
    if (window.isDev) console.log("⚡ Frontline DOM loaded");

    try {
        await initializeBuffs();
        await initializeFrontline();
        setupListeners();
    } catch (err) {
        console.error("❌ Frontline initialization failed:", err);
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

async function initializeFrontline() {
    container = document.getElementById("frontline");

    const [settings, storeSymbols, restoredState] = await Promise.all([window.settingsAPI.get(), window.frontlineAPI.getSymbols()]);

    console.log(
        "🧾 Store symbols received:",
        storeSymbols.map((s) => s.symbol)
    );

    window.settings = settings;

    if (restoredState) {
        Object.assign(frontlineState, restoredState);
    }

    storeSymbols.forEach((symbolData) => {
        if (!frontlineState[symbolData.symbol]) {
            frontlineState[symbolData.symbol] = {
                hero: symbolData.symbol,
                price: symbolData.price || 1,
                hp: 0,
                dp: 0,
                strength: symbolData.one_min_volume || 0,
                xp: 0,
                lv: 0,
                score: 0,
                lastEvent: { hp: 0, dp: 0, xp: 0 },
                floatValue: symbolData.statistics?.floatShares || 0,
                buffs: symbolData.buffs || {},
                highestPrice: symbolData.highestPrice ?? symbolData.price ?? 1,
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
    window.storeAPI.onHeroUpdate(window.frontlineStateManager.updateHeroData);
    window.electronAPI.onNukeState(window.frontlineStateManager.handleNuke);
    window.electronAPI.onXpReset(window.frontlineStateManager.resetXpLevels);
}

function handleAlertEvent(event) {
    const minPrice = window.settings?.top?.minPrice ?? 0;
    const maxPrice = window.settings?.top?.maxPrice > 0 ? window.settings.top.maxPrice : Infinity;

    if (event.one_min_volume < 100) {
        if (window.isDev) console.log(`⚠️ Skipping ${event.hero} due to low 1-min volume: ${event.one_min_volume}`);
        return;
    }

    if (event.price < minPrice || event.price > maxPrice) {
        if (window.isDev) {
            const isTooLow = event.price < minPrice;
            const isTooHigh = event.price > maxPrice;

            console.log(`🚫 ${event.hero} skipped — price $${event.price} outside range`);
            console.log(`   ⤷ minPrice: $${minPrice}, maxPrice: $${maxPrice}`);
            console.log(`   ⤷ Reason: ${isTooLow ? "below min" : ""}${isTooLow && isTooHigh ? " and " : ""}${isTooHigh ? "above max" : ""}`);
            console.log("   ⤷ Full event:", event);
        }
        return;
    }

    if (!frontlineState[event.hero]) {
        frontlineState[event.hero] = {
            hero: event.hero,
            hue: event.hue ?? 0,
            price: event.price || 1,
            hp: 0,
            dp: 0,
            strength: event.one_min_volume,
            xp: 0,
            lv: 0,
            score: 0,
            lastEvent: { hp: 0, dp: 0, xp: 0 },
            floatValue: 0,
            buffs: {},
            highestPrice: event.price || 1,
        };

        if (window.isDev) {
            console.log(`🆕 Initialized new hero from alert: ${event.hero}`);
        }
    }

    updateFrontlineStateFromEvent(event);
}

function updateFrontlineStateFromEvent(event) {
    if (eventsPaused) return;

    if (!event || !event.hero) {
        console.warn("Invalid event received:", event);
        return;
    }

    let hero = frontlineState[event.hero];

    if (!hero) {
        console.warn("❌ Frontline state missing for hero:", event.hero, "Full event:", event);
        return; // Prevents crash on `hero.price = ...`
    }

    hero.price = event.price;
    hero.hue = event.hue ?? hero.hue ?? 0;
    hero.strength = event.one_min_volume ?? hero.strength ?? 0;
    hero.lastChangeText = hero.lastChangeText || "";

    if (event.hp > 0) {
        hero.hp += event.hp;
        hero.lastChangeText = `+${event.hp.toFixed(2)}%`;
    } else if (event.dp > 0) {
        hero.hp = Math.max(hero.hp - event.dp, 0);
        hero.lastChangeText = `-${event.dp.toFixed(2)}%`;
    }

    // Handle HP changes
    const wasDead = hero.hp === 0 && event.hp > 0;
    if (wasDead) {
        if (window.isDev) console.log(`💀 ${hero.hero} RISES FROM DEAD!`);
    }

    const isReversal = hero.lastEvent.dp > 0 && event.hp > 0;
    if (isReversal) {
        if (window.isDev) console.log(`🔄 ${hero.hero} REVERSAL!`);
    }
    // Update score
    let scoreDelta = 0;

    scoreDelta = window.helpers.calculateScore(hero, event);
    hero.score = Math.max(0, (hero.score || 0) + scoreDelta);

    hero.lastEvent = {
        hp: event.hp || 0,
        dp: event.dp || 0,
        score: scoreDelta,
    };

    // calculateXp(hero, event);

    // Check if we need to scale up
    let needsFullRender = false;
    if (hero.hp > maxHP) {
        maxHP = hero.hp * 1.05; // 5% buffer
        needsFullRender = true;
    }

    if (hero.score > maxScore) {
        maxScore = hero.score * 1.05; // 5% buffer
        needsFullRender = true;
    }

    // Check if we should scale down
    const topN = window.settings?.top?.frontlineListLength ?? 8;
    const currentTopHeroes = Object.values(frontlineState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
        .map((s) => s.hero);

    // Scale down HP if all below threshold
    if (
        currentTopHeroes.every((heroName) => {
            const h = frontlineState[heroName];
            return h.hp < maxHP * SCALE_DOWN_THRESHOLD;
        }) &&
        maxHP > BASE_MAX_HP
    ) {
        maxHP = Math.max(BASE_MAX_HP, maxHP * SCALE_DOWN_FACTOR);
        needsFullRender = true;
    }

    // Scale down Score if all below threshold
    if (
        currentTopHeroes.every((heroName) => {
            const h = frontlineState[heroName];
            return h.score < maxScore * SCALE_DOWN_THRESHOLD;
        }) &&
        maxScore > BASE_MAX_SCORE
    ) {
        maxScore = Math.max(BASE_MAX_SCORE, maxScore * SCALE_DOWN_FACTOR);
        needsFullRender = true;
    }

    // Render updates
    if (needsFullRender || currentTopHeroes.join(",") !== lastTopHeroes.join(",")) {
        lastTopHeroes = currentTopHeroes;
        debouncedRenderAll();
    } else {
        debouncedUpdateCardDOM(event.hero);
    }

    hero.lastUpdate = Date.now();
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
    const topN = window.settings?.top?.frontlineListLength ?? 3;
    const top = Object.values(frontlineState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);

    const topSymbols = top.map((h) => h.hero.trim().toUpperCase());
    const rendered = new Set();

    // Track and remove duplicates first
    document.querySelectorAll(".ticker-card").forEach((card) => {
        const sym = card.dataset.symbol?.trim().toUpperCase();
        if (rendered.has(sym) || !topSymbols.includes(sym)) {
            card.remove();
        } else {
            rendered.add(sym);
        }
    });

    top.forEach((heroData, i) => {
        const sym = heroData.hero.trim().toUpperCase();
        const existing = container.querySelector(`.ticker-card[data-symbol="${sym}"]`);

        if (!existing) {
            const newCard = renderCard(frontlineState[sym]);
            container.insertBefore(newCard, container.children[i] || null);

            // ⚡ Immediately check fade out / not
            updateCardDOM(sym);
        } else {
            if (container.children[i] !== existing) {
                container.insertBefore(existing, container.children[i] || null);
            }
            updateCardDOM(sym);
        }
    });
}

function updateCardDOM(hero) {
    hero = hero?.trim().toUpperCase();
    if (!hero || !frontlineState[hero]) return;

    const state = frontlineState[hero];
    const card = document.querySelector(`.ticker-card[data-symbol="${hero}"]`);
    if (!card) return;

    // ✅ Score bar only
    const bar = card.querySelector(`.bar-fill.score`);
    if (bar) {
        const exponent = 0.35; // Lower = flatter early growth, steeper late
        const normalized = Math.min(state.score / maxScore, 1);
        const fill = Math.pow(normalized, exponent);
        bar.style.width = `${fill * 100}%`;
    }

    // ✅ Update price label
    const priceEl = card.querySelector(".lv");
    if (priceEl) priceEl.textContent = `$${state.price.toFixed(2)}`;

    // ✅ Fade logic
    const now = Date.now();
    const lastUpdate = state.lastUpdate || now;
    const timeSinceUpdate = now - lastUpdate;
    const inactiveThreshold = 7000;

    if (timeSinceUpdate > inactiveThreshold) {
        card.classList.add("fade-out");
        card.classList.remove("card-update-highlight");
    } else {
        card.classList.remove("fade-out");
        card.classList.add("card-update-highlight");
        setTimeout(() => card.classList.remove("card-update-highlight"), 300);
    }

    // ✅ HP / DP change display
    const changeEl = card.querySelector(".change-placeholder");
    if (changeEl) {
        const hadHp = state.lastEvent.hp > 0;
        const hadDp = state.lastEvent.dp > 0;

        if (hadHp) {
            changeEl.classList.remove("dp-damage");
            changeEl.classList.add("hp-boost");
            state.lastChangeText = `+${state.lastEvent.hp.toFixed(2)}%`;
        } else if (hadDp) {
            changeEl.classList.remove("hp-boost");
            changeEl.classList.add("dp-damage");
            state.lastChangeText = `-${state.lastEvent.dp.toFixed(2)}%`;
        }

        changeEl.textContent = state.lastChangeText || "";
        changeEl.classList.add("change-flash");
        setTimeout(() => changeEl.classList.remove("change-flash"), 400);
    }
}

function renderCard(state) {
    const { hero, price, strength, lastEvent } = state;

    const card = document.createElement("div");
    card.className = "ticker-card";
    card.dataset.symbol = hero;

    const change = lastEvent.hp ? `+${lastEvent.hp.toFixed(2)}%` : lastEvent.dp ? `-${lastEvent.dp.toFixed(2)}%` : "";
    const changeClass = lastEvent.hp ? "hp-boost" : lastEvent.dp ? "dp-damage" : "";

    const volumeImpact = window.hlpsFunctions.calculateImpact(strength, price, window.buffs);

    const sortOrder = ["volume", "float", "news", "bio", "weed", "space", "newHigh", "bounceBack", "highShort", "netLoss", "hasS3", "dilutionRisk", "china", "lockedShares"];
    const buffCategoryMap = {
        minVol: "volume",
        lowVol: "volume",
        mediumVol: "volume",
        highVol: "volume",
        parabolicVol: "volume",
        float1m: "float",
        float5m: "float",
        float10m: "float",
        float50m: "float",
        float100m: "float",
        float200m: "float",
        float500m: "float",
        float600m: "float",
        float600mPlus: "float",
        floatCorrupt: "float",
        floatUnranked: "float",
        news: "news",
        bounceBack: "bounceBack",
        highShort: "highShort",
        newHigh: "newHigh",
        netLoss: "netLoss",
        hasS3: "hasS3",
        dilutionRisk: "dilutionRisk",
        china: "china",
        bio: "bio",
        weed: "weed",
        space: "space",
        lockedShares: "lockedShares",
    };

    const sortBuffs = (arr) =>
        arr.sort((a, b) => {
            const aKey = buffCategoryMap[a.key] || a.key;
            const bKey = buffCategoryMap[b.key] || b.key;
            return (sortOrder.indexOf(aKey) || 999) - (sortOrder.indexOf(bKey) || 999);
        });

    const sortedBuffs = sortBuffs(Object.values(state.buffs || {}));
    const buffsInline = sortedBuffs.map((buff) => `<span class="buff-icon ${buff.isBuff ? "buff-positive" : "buff-negative"}" title="${buff.desc}">${buff.icon}</span>`).join("");

    card.innerHTML = `
<div class="ticker-header">
    <div class="ticker-symbol" style="background-color:${window.helpers.getSymbolColor(state.hue || 0)}">
        ${hero} <span class="lv">$${price.toFixed(2)}</span>
    </div>
    <div class="ticker-info">
        <div class="ticker-data">
            <span class="bar-text" style="color:${volumeImpact.style.color}">
                ${window.helpers.abbreviatedValues(strength)}
            </span>
            <span class="change-placeholder ${changeClass}">${change}</span>
            ${buffsInline}
        </div>
        <div class="bars">
            <div class="bar">
                <div class="bar-fill score" style="width: ${Math.min((state.score / maxScore) * 100, 100)}%"></div>
            </div>
        </div>
    </div>
</div>`;

    const symbolElement = card.querySelector(".ticker-symbol");
    symbolElement.onclick = (e) => {
        e.stopPropagation();
        try {
            navigator.clipboard.writeText(hero);
            if (window.activeAPI?.setActiveTicker) window.activeAPI.setActiveTicker(hero);
            lastClickedSymbol = hero;
            symbolElement.classList.add("symbol-clicked");
            setTimeout(() => symbolElement.classList.remove("symbol-clicked"), 200);
        } catch (err) {
            console.error(`⚠️ Failed to handle click for ${hero}:`, err);
        }
    };

    return card;
}
