const DECAY_INTERVAL_MS = 1000;
const XP_DECAY_PER_TICK = 0.05; // Base decay per tick (you might lower this for longer duration)
const SCORE_NORMALIZATION = 3; // Increase this value to reduce the impact of score on decay

const frontlineState = {};
let container;

const symbolColors = {};

const BASE_MAX_SCORE = 100;
const BASE_MAX_HP = 10;
const SCALE_DOWN_THRESHOLD = 0.2; // 20%
const SCALE_DOWN_FACTOR = 0.9; // Reduce by 10%

let maxHP = BASE_MAX_HP;
let maxScore = BASE_MAX_SCORE;
let lastTopHeroes = [];

let eventsPaused = false;

const { isDev } = window.appFlags;

const freshStart = isDev;
const debug = false;
const debugScoreCalc = isDev;
const debugXp = isDev;

console.log("🎯 Fresh start mode:", freshStart);
console.log("🐛 Debug mode:", debug);

const debugLimitSamples = 1500;
let debugSamples = 0;

let buffs = [];

document.addEventListener("DOMContentLoaded", async () => {
    if (debug) console.log("⚡ Frontline Dom loaded");

    try {
        const fetchedBuffs = await window.electronAPI.getBuffs(); // ✅ pull buffs from preload
        window.buffs = fetchedBuffs; // ✅ set to global

        window.electronAPI.onBuffsUpdate((updatedBuffs) => {
            if (debug) console.log("🔄 Buffs updated via IPC:", updatedBuffs);
            window.buffs = updatedBuffs; // ✅ update global
        });
    } catch (err) {
        console.error("❌ Failed to load buffs:", err);
    }

    container = document.getElementById("frontline");

    try {
        // Load everything in parallel
        const [settings, storeSymbols, restoredState] = await Promise.all([window.settingsAPI.get(), window.frontlineAPI.getSymbols(), loadState()]);

        window.settings = settings;

        // Restore any saved state
        if (restoredState) {
            Object.assign(frontlineState, restoredState);
        }

        // Always hydrate missing entries from storeSymbols
        storeSymbols.forEach((symbolData) => {
            if (!frontlineState[symbolData.symbol]) {
                frontlineState[symbolData.symbol] = {
                    hero: symbolData.symbol,
                    price: symbolData.price || 1,
                    hp: 0,
                    dp: 0,
                    strength: 0,
                    xp: 0,
                    lv: 0,
                    score: 0,
                    lastEvent: {
                        hp: 0,
                        dp: 0,
                        xp: 0,
                    },
                    floatValue: symbolData.statistics?.floatShares || 0,
                    buffs: symbolData.buffs || {},
                    highestPrice: symbolData.highestPrice ?? symbolData.price ?? 1,
                };
            }
        });

        renderAll();
        startScoreDecay();

        // Set up listeners after initialization
        window.settingsAPI.onUpdate(async (updatedSettings) => {
            if (debug) console.log("🎯 Settings updated, applying changes...", updatedSettings);
            window.settings = updatedSettings;
            renderAll();
        });

        window.eventsAPI.onAlertEvents((events) => {
            const minPrice = window.settings?.top?.minPrice ?? 0;
            const maxPrice = window.settings?.top?.maxPrice ?? Infinity;

            events.forEach((event) => {
                if (event.price < minPrice || (maxPrice > 0 && event.price > maxPrice)) {
                    if (debug) console.log(`🚫 ${event.hero} skipped — price $${event.price} outside range $${minPrice}-$${maxPrice}`);
                    return;
                }
                updateFrontlineStateFromEvent(event);
            });
        });

        window.storeAPI.onHeroUpdate((updatedHeroes) => {
            updatedHeroes.forEach((updated) => {
                const hero = frontlineState[updated.hero];
                if (!hero) return;

                // Merge updated fields
                hero.buffs = updated.buffs || hero.buffs;
                hero.highestPrice = Math.max(hero.highestPrice || 0, updated.highestPrice || 0);
                hero.lastEvent = updated.lastEvent || hero.lastEvent;
                hero.xp = updated.xp ?? hero.xp;
                hero.lv = updated.lv ?? hero.lv;

                updateCardDOM(hero.hero);
            });
        });

        window.electronAPI.onNukeState(async () => {
            console.warn("🧨 Nuke signal received — clearing local state.");
            clearState();

            try {
                const fetchedBuffs = await window.electronAPI.getBuffs();
                window.buffs = fetchedBuffs;
                console.log("🔄 Buffs reloaded after nuke:", fetchedBuffs.length);
            } catch (err) {
                console.error("⚠️ Failed to reload buffs after nuke:", err);
            }

            location.reload(); // 🔁 Ensures fresh init
        });

        window.electronAPI.onXpReset(() => {
            console.log("🧼 XP Reset received — resetting XP and LV in frontline");

            Object.values(frontlineState).forEach((hero) => {
                hero.xp = 0;
                hero.lv = 1;
                updateCardDOM(hero.hero);
            });

            saveState(); // ✅ Persist the updated XP/LV state
        });
    } catch (error) {
        console.error("Frontline initialization failed:", error);
        // Add error recovery here if needed
    }
});

function updateFrontlineStateFromEvent(event) {
    if (eventsPaused) return;

    if (!event || !event.hero) {
        console.warn("Invalid event received:", event);
        return;
    }

    let hero = frontlineState[event.hero];

    hero.price = event.price;

    // Handle HP changes
    const wasDead = hero.hp === 0 && event.hp > 0;
    if (wasDead) {
        if (debug) console.log(`💀 ${hero.hero} RISES FROM DEAD!`);
    }

    const isReversal = hero.lastEvent.dp > 0 && event.hp > 0;
    if (isReversal) {
        if (debug) console.log(`🔄 ${hero.hero} REVERSAL!`);
    }

    // Apply HP changes
    if (event.hp > 0) hero.hp += event.hp;
    if (event.dp > 0) hero.hp = Math.max(hero.hp - event.dp, 0); // Essence fades, but never extinguishes

    // Update score
    const scoreDelta = calculateScore(hero, event);
    hero.score = Math.max(0, (hero.score || 0) + scoreDelta);

    hero.lastEvent = {
        hp: event.hp || 0,
        dp: event.dp || 0,
        score: scoreDelta,
    };

    hero.strength = event.strength;

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
        renderAll();
    } else {
        updateCardDOM(event.hero);
    }

    hero.lastUpdate = Date.now();

    saveState();
}

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

    // Update bars
    const setBarWidth = (selector, value, max) => {
        const bar = card.querySelector(`.bar-fill.${selector}`);
        if (bar) bar.style.width = `${Math.min((value / max) * 100, 100)}%`;
    };

    setBarWidth("score", state.score, maxScore);
    setBarWidth("hp", state.hp, maxHP);
    // Volume impact-based coloring
    const volImpact = window.hlpsFunctions.calculateImpact(state.strength, state.price, window.buffs);
    const strengthBar = card.querySelector(".bar-fill.strength");
    if (strengthBar) {
        strengthBar.style.width = `${Math.min((state.strength / 400000) * 100, 100)}%`;
        strengthBar.style.backgroundColor = volImpact.style.color;
    }

    const strengthText = card.querySelector(".bar-text");
    if (strengthText) {
        strengthText.textContent = abbreviatedValues(state.strength);
        strengthText.style.color = volImpact.style.color;
    }

    // Update label
    const priceEl = card.querySelector(".lv");
    if (priceEl) priceEl.textContent = `$${state.price.toFixed(2)}`;

    // Fade logic
    const now = Date.now();
    const lastUpdate = state.lastUpdate || now;
    const timeSinceUpdate = now - lastUpdate;
    const inactiveThreshold = 7000;
    const shouldFadeOut = timeSinceUpdate > inactiveThreshold;

    if (shouldFadeOut) {
        card.classList.add("fade-out");
        card.classList.remove("card-update-highlight");
    } else {
        card.classList.remove("fade-out");
        card.classList.add("card-update-highlight");
        setTimeout(() => card.classList.remove("card-update-highlight"), 300);
    }
}

function renderCard(state) {
    const { hero, price, hp, dp, strength, lastUpdate } = state;

    const card = document.createElement("div");
    card.className = "ticker-card";
    card.dataset.symbol = hero;

    const change = state.lastEvent.hp ? `+${state.lastEvent.hp.toFixed(2)}%` : state.lastEvent.dp ? `-${state.lastEvent.dp.toFixed(2)}%` : "";

    const changeClass = state.lastEvent.hp ? "hp-boost" : state.lastEvent.dp ? "dp-damage" : "";

    const volumeImpact = window.hlpsFunctions.calculateImpact(strength, price, window.buffs);

    // Store initial values for animation
    const initialValues = {
        score: state.score,
        hp: state.hp,
        strength: strength,
    };

    const isVisiblyActive = state.lastEvent && (state.lastEvent.hp > 0 || state.lastEvent.dp > 0 || state.lastEvent.score > 0);

    // Buffs
    // ✅ 1. Define sort priority (group/category level)
    const sortOrder = ["volume", "float", "news", "bio", "weed", "space", "newHigh", "bounceBack", "highShort", "netLoss", "hasS3", "dilutionRisk", "china", "lockedShares"];

    // ✅ 2. Map specific keys to general categories
    const buffCategoryMap = {
        // Volume
        minVol: "volume",
        lowVol: "volume",
        mediumVol: "volume",
        highVol: "volume",
        parabolicVol: "volume",

        // Float
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

        // Everything else
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

    // ✅ 3. Sorting helper using mapped categories
    const sortBuffs = (arr) =>
        arr.sort((a, b) => {
            const keyA = buffCategoryMap[a.key] || a.key;
            const keyB = buffCategoryMap[b.key] || b.key;
            const aIndex = sortOrder.indexOf(keyA);
            const bIndex = sortOrder.indexOf(keyB);
            return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        });

    // Extract buffs
    const buffsArray = Object.values(state.buffs || {});

    // Merge and sort all buffs
    // Combine and sort buffs inline
    const sortedBuffs = sortBuffs(Object.values(state.buffs || {}));
    const buffsInline = sortedBuffs.map((buff) => `<span class="buff-icon ${buff.isBuff ? "buff-positive" : "buff-negative"}" title="${buff.desc}">${buff.icon}</span>`).join("");

    // Inject into ticker-data row
    card.innerHTML = `
<div class="ticker-header">
    <div class="ticker-symbol" style="background-color:${getSymbolColor(hero)}"> ${hero} <span class="lv">$${state.price.toFixed(2)}<span></div>
    <div class="ticker-info">
        <div class="ticker-data">
<span class="bar-text" style="color:${volumeImpact.style.color}">${abbreviatedValues(strength)}</span>
            ${change ? `<span class="${changeClass}">${change}</span>` : ""}
            ${buffsInline}
        </div>
        <div class="bars">
            <div class="bar">
                <div class="bar-fill score" style="width: ${Math.min((state.score / maxScore) * 100, 100)}%"></div>
            </div>
            <div class="bar">
                <div class="bar-fill hp" style="width: ${Math.min((state.hp / maxHP) * 100, 100)}%"></div>
            </div>
            <div class="bar">
                <div class="bar-fill strength" style="width: ${Math.min((strength / 400000) * 100, 100)}%"></div>
            </div>
        </div>
    </div>
</div>`;

    // Add click handler to the symbol element
    const symbolElement = card.querySelector(".ticker-symbol");
    symbolElement.onclick = (e) => {
        e.stopPropagation(); // Prevent event bubbling

        try {
            // Copy to clipboard
            navigator.clipboard.writeText(hero);
            console.log(`📋 Copied ${hero} to clipboard`);

            // Set as active ticker if the API exists
            if (window.activeAPI && window.activeAPI.setActiveTicker) {
                window.activeAPI.setActiveTicker(hero);
                console.log(`🎯 Set ${hero} as active ticker`);
            }

            // Store last clicked symbol
            lastClickedSymbol = hero;

            // Optional: Add visual feedback
            symbolElement.classList.add("symbol-clicked");
            setTimeout(() => {
                symbolElement.classList.remove("symbol-clicked");
            }, 200);
        } catch (err) {
            console.error(`⚠️ Failed to handle click for ${hero}:`, err);
        }
    };

    return card;
}

function getSpriteRowFromState({ hp, strength, lastEvent }) {
    if (hp <= 0) return 6; // Die
    if (lastEvent.dp > 0) return 5; // Taking damage
    if (lastEvent.hp > 0) return 2 + Math.floor(Math.random() * 3); // Random attack (2, 3, or 4)
    if (strength >= 200000) return 1; // Running
    return 0; // Idle
}

/////////////////////////////////// Calculations

function calculateScore(hero, event) {
    if (event.strength < 1000) {
        if (debug && debugSamples < debugLimitSamples) {
            console.log(`⚠️ Skipping event due to low volume (strength: ${event.strength})`);
        }
        return 0;
    }

    debugSamples++;
    const currentScore = Number(hero.score) || 0;

    if (debug && debugSamples < debugLimitSamples) {
        console.log(`\n⚡⚡⚡ [${hero.hero}] SCORING BREAKDOWN ⚡⚡⚡`);
        console.log(`📜 INITIAL STATE → Price: ${hero.price} | Score: ${currentScore.toFixed(2)} | HP: ${hero.hp || 0} | DP: ${hero.dp || 0}`);
    }

    let baseScore = 0;
    const logStep = (emoji, message, value) => console.log(`${emoji} ${message.padEnd(30)} ${(Number(value) || 0).toFixed(2)}`);

    try {
        if (event.hp > 0) {
            baseScore += event.hp * 10;
            logStep("💖", "Base HP Added", baseScore);

            // const floatBuff = getHeroBuff(hero, "float");
            // const floatMult = floatBuff?.multiplier ?? 1;
            // baseScore *= floatMult;
            // logStep(floatBuff?.key === "floatCorrupt" ? "🧨" : "🏷️", `Float Mult (${abbreviatedValues(hero.floatValue)})`, floatMult);

            const volumeBuff = getHeroBuff(hero, "volume");
            const volMult = volumeBuff?.multiplier ?? 1;
            baseScore *= volMult;
            logStep("📢", volumeBuff?.message ?? `No volume buff (${abbreviatedValues(event.strength || 0)})`, volMult);
        }

        if (event.dp > 0) {
            let dpScore = event.dp * 10;

            const volMult = getHeroBuff(hero, "volume")?.multiplier ?? 1;
            dpScore *= volMult;

            baseScore -= dpScore;
            logStep("💥", "Base DP Deducted", dpScore);
        }
    } catch (err) {
        console.error(`⚠️ Scoring error for ${hero.hero}:`, err);
        baseScore = 0;
    }

    if (debug && debugSamples < debugLimitSamples) {
        console.log("━".repeat(50));
        logStep("🎯", "TOTAL SCORE CHANGE", baseScore);
        console.log(`🎼 FINAL SCORE → ${Math.max(0, currentScore + baseScore).toFixed(2)}\n\n\n`);
    }

    return baseScore;
}

function getHeroBuff(hero, key) {
    return hero?.buffs?.[key] ?? {};
}

function startScoreDecay() {
    let decayTickCount = 0;
    const DECAY_TICKS_BETWEEN_LOGS = 5;

    setInterval(() => {
        decayTickCount++;
        let changed = false;
        let totalDecay = 0;
        let heroesDecayed = 0;
        const activeHeroes = [];

        Object.values(frontlineState).forEach((hero) => {
            if (hero.score > 0) {
                const originalScore = hero.score;
                const scale = 1 + hero.score / SCORE_NORMALIZATION;
                const cling = 0.1;
                const taper = Math.max(cling, Math.min(1, hero.score / 10));
                const decayAmount = XP_DECAY_PER_TICK * scale * taper;
                const newScore = Math.max(0, hero.score - decayAmount);

                if (hero.score !== newScore) {
                    hero.score = newScore;
                    hero.lastEvent.hp = 0;
                    hero.lastEvent.dp = 0;

                    changed = true;
                    totalDecay += originalScore - newScore;
                    heroesDecayed++;
                    activeHeroes.push(hero);
                }
            }
        });

        if (changed) {
            renderAll();
            saveState();
        }
    }, DECAY_INTERVAL_MS);
}

function abbreviatedValues(value) {
    if (value === null || value === undefined || isNaN(value) || value === "") {
        return "-";
    }
    const num = Number(value);
    if (num >= 1_000_000_000) {
        return (num / 1_000_000_000).toFixed(2) + "B";
    }
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(2) + "M";
    }
    if (num >= 1_000) {
        return (num / 1_000).toFixed(2) + "K";
    }
    return num.toLocaleString();
}

// function calculateVolumeImpact(volume = 0, price = 1) {
//     const categories = Object.entries(window.buffs)
//         .map(([category, data]) => ({ category, ...data }))
//         .sort((a, b) => a.priceThreshold - b.priceThreshold);

//     for (const category of categories) {
//         if (price <= category.priceThreshold) {
//             const sortedStages = [...category.volumeStages].sort((a, b) => a.volumeThreshold - b.volumeThreshold);

//             const stageToUse =
//                 sortedStages.find((stage, index) => {
//                     const current = stage.volumeThreshold;
//                     const prev = index === 0 ? 0 : sortedStages[index - 1].volumeThreshold;
//                     if (index === sortedStages.length - 1) {
//                         return volume >= prev;
//                     }
//                     return volume > prev && volume <= current;
//                 }) || sortedStages[sortedStages.length - 1];

//             // ✅ Only now we can safely use stageToUse
//             return {
//                 ...stageToUse, // ⬅️ brings icon, desc, isBuff, key, etc.
//                 capAssigned: category.category,
//                 volumeStage: stageToUse.key,
//                 message: `${category.category} ${stageToUse.key} (${abbreviatedValues(volume)})`,
//                 style: {
//                     cssClass: `volume-${stageToUse.key.toLowerCase()}`,
//                     color: getColorForStage(stageToUse.key),
//                     animation: stageToUse.key === "parabolicVol" ? "pulse 1.5s infinite" : "none",
//                 },
//             };
//         }
//     }

//     // Fallback if no category matched
//     return {
//         multiplier: 1,
//         capAssigned: "None",
//         volumeStage: "None",
//         message: "No matching category found",
//         style: {
//             cssClass: "volume-none",
//             icon: "",
//             description: "No volume",
//             color: "#cccccc",
//             animation: "none",
//         },
//         score: 0,
//     };
// }

function getSymbolColor(symbol) {
    if (!symbolColors[symbol]) {
        const hash = [...symbol].reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const hue = (hash * 37) % 360;
        const saturation = 80;
        const lightness = 50;
        const alpha = 0.5;
        symbolColors[symbol] = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    }
    return symbolColors[symbol];
}

function getColorForStage(stageKey) {
    const colors = {
        lowVol: "#cccccc",
        mediumVol: "#4caf50",
        highVol: "#ff9800",
        parabolicVol: "#f44336",
    };
    return colors[stageKey] || "#cccccc";
}

function abbreviatedValues(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
    return num.toString();
}

/////////////////////////////////// state

window.pauseEvents = () => {
    eventsPaused = true;
    if (debug) console.log("Events are now paused");
};

window.resumeEvents = () => {
    eventsPaused = false;
    if (debug) console.log("Events are now resumed");
};

function getMarketDateString() {
    const now = new Date();
    const offset = -5 * 60; // EST offset in minutes (adjust for DST if needed)
    const localOffset = now.getTimezoneOffset();
    const estDate = new Date(now.getTime() + (localOffset - offset) * 60000);
    return estDate.toISOString().split("T")[0];
}

function saveState() {
    const existing = localStorage.getItem("frontlineState");
    let sessionDate = getMarketDateString();

    if (existing) {
        try {
            const parsed = JSON.parse(existing);
            if (parsed.date && parsed.date !== sessionDate) {
                if (debug) console.log("🧼 Overwriting old session from", parsed.date);
            } else {
                sessionDate = parsed.date || sessionDate;
            }
        } catch {
            console.warn("⚠️ Invalid existing frontline state. Overwriting.");
        }
    }

    const payload = {
        date: sessionDate,
        state: frontlineState,
    };

    localStorage.setItem("frontlineState", JSON.stringify(payload));
}

async function loadState() {
    if (freshStart) {
        console.log("🧪 loadState() overridden for testing — skipping restore");
        return null;
    }
    const saved = localStorage.getItem("frontlineState");
    if (!saved) return null;

    try {
        const parsed = JSON.parse(saved);
        const today = getMarketDateString();

        if (parsed.date === today) {
            if (debug) console.log("🔄 Restored frontline state from earlier session.");
            return parsed.state || null;
        } else {
            if (debug) console.log("🧼 Session from previous day. Skipping restore.");
            localStorage.removeItem("frontlineState");
            return null;
        }
    } catch (err) {
        console.warn("⚠️ Could not parse frontline state. Clearing.");
        localStorage.removeItem("frontlineState");
        return null;
    }
}

function clearState() {
    localStorage.removeItem("frontlineState");
    for (const key in frontlineState) {
        delete frontlineState[key];
    }
    if (debug) console.log("🧹 Cleared saved and in-memory frontline state.");
}
