const DECAY_INTERVAL_MS = 12000;
const XP_DECAY_PER_TICK = 0.2; // Base decay per tick (you might lower this for longer duration)
const SCORE_NORMALIZATION = 10; // Increase this value to reduce the impact of score on decay

const focusState = {};
let container;

const symbolColors = {};

let maxXP = 100;
let maxHP = 300;

const BASE_MAX_HP = 300;
const HP_SCALE_DOWN_THRESHOLD = 0.2; // 20%
const HP_SCALE_DOWN_FACTOR = 0.9; // Reduce by 10%

let lastTopHeroes = [];

isLongBiased = true;

let eventsPaused = false;

const debug = true;

const debugScoreCalc = true;
const debugLimitSamples = 15;
let debugSamples = 0;


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
    const existing = localStorage.getItem("focusState");
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
            console.warn("⚠️ Invalid existing focus state. Overwriting.");
        }
    }

    const payload = {
        date: sessionDate,
        state: focusState,
    };

    localStorage.setItem("focusState", JSON.stringify(payload));
}

function loadState() {
    const saved = localStorage.getItem("focusState");
    if (!saved) return false;

    try {
        const parsed = JSON.parse(saved);
        const today = getMarketDateString();

        if (parsed.date === today) {
            Object.entries(parsed.state).forEach(([symbol, data]) => {
                focusState[symbol] = data;
            });
            if (debug) console.log("🔄 Restored focus state from earlier session.");
            return true;
        } else {
            if (debug) console.log("🧼 Session from previous day. Skipping restore.");
            localStorage.removeItem("focusState");
            return false;
        }
    } catch (err) {
        console.warn("⚠️ Could not parse focus state. Clearing.");
        localStorage.removeItem("focusState");
        return false;
    }
}

function clearState() {
    localStorage.removeItem("focusState");
    for (const key in focusState) {
        delete focusState[key];
    }
    if (debug) console.log("🧹 Cleared saved and in-memory focus state.");
}

document.addEventListener("DOMContentLoaded", async () => {
    if (debug) console.log("⚡ DOMContentLoaded event fired!");

    const restored = loadState(); // ✅ returns true if valid state loadedloadState();

    if (debug) console.log();

    container = document.getElementById("focus"); // Focus div is where the cards will be injected

    // 1. Get symbols from preload store
    const storeSymbols = await window.focusAPI.getSymbols();
    window.settings = await window.settingsAPI.get();

    // ✅ Listen for settings updates globally
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        if (debug) console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);
        window.settings = updatedSettings;
        renderAll();
    });

    // 2. Create initial focus state
    // Only init state if we didn't load one
    if (!restored) {
        storeSymbols.forEach((symbolData) => {
            focusState[symbolData.symbol] = {
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
                percs: [],
                floatValue: symbolData.statistics.floatShares,
            };
        });
    }

    renderAll();

    // 3. Listen for incoming alerts
    window.focusAPI.onFocusEvents((events) => {
        events.forEach(updateFocusStateFromEvent);
        // if(debug) console.log("⚡ Received focus events:", events);
    });

    startScoreDecay();
});

function updateFocusStateFromEvent(event) {
    if (eventsPaused) return; // Skip event processing if paused

    // 1. Add validation for the hero
    if (!event || !event.hero) {
        console.warn("Invalid event received:", event);
        return;
    }

    let hero = focusState[event.hero];

    hero.price = event.price;

    // 1. FIRST check for resurrection BEFORE changing HP
    const wasDead = hero.hp === 0 && event.hp > 0;
    if (wasDead) {
        if (debug) console.log(`💀 ${hero.hero} RISES FROM DEAD!`);
        // hero.score += 5; // Directly add to score
    }

    // 2. Check for reversal (must happen BEFORE applying new HP)
    const isReversal = hero.lastEvent.dp > 0 && event.hp > 0;
    if (isReversal) {
        // hero.score += 5;
        if (debug) console.log(`🔄 ${hero.hero} REVERSAL! s`);
    }

    // 🧠 Apply alert changes
    if (event.hp > 0) hero.hp += event.hp;
    if (event.dp > 0) hero.hp = Math.max(hero.hp - event.dp, 0);

    // 🧠 Update event log
    hero.lastEvent = {
        hp: event.hp || 0,
        dp: event.dp || 0,
        xp: 0,
    };

    // 🎯 scoring
    calculateScore(hero, event).then((scoreDelta) => {
        hero.score = Math.max(0, (hero.score || 0) + scoreDelta);
    });

    hero.lastEvent = {
        hp: event.hp || 0,
        dp: event.dp || 0,
        xp: 0, // you can keep or remove this if unused
    };

    hero.strength = event.strength;

    calculateXp(hero);

    let needsFullRender = false;
    if (hero.hp > maxHP) {
        maxHP = hero.hp * 1.05;
        needsFullRender = true;
    }

    if (hero.xp > maxXP) {
        maxXP = hero.xp;
        needsFullRender = true;
    }

    const topN = window.settings?.top?.focusListLength ?? 10;
    const currentTopHeroes = Object.values(focusState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
        .map((s) => s.hero);

    // Check if we should scale down maxHP
    if (currentTopHeroes.length > 0) {
        const allBelowThreshold = currentTopHeroes.every((heroName) => {
            const hero = focusState[heroName];
            return hero.hp < maxHP * HP_SCALE_DOWN_THRESHOLD;
        });

        if (allBelowThreshold && maxHP > BASE_MAX_HP) {
            // Scale down maxHP but never below BASE_MAX_HP
            maxHP = Math.max(BASE_MAX_HP, maxHP * HP_SCALE_DOWN_FACTOR);
            needsFullRender = true;
        }
    }

    // If layout changed or full render required, redraw everything
    if (needsFullRender || currentTopHeroes.join(",") !== lastTopHeroes.join(",")) {
        lastTopHeroes = currentTopHeroes;
        renderAll();
    } else {
        updateCardDOM(event.hero);
    }
    saveState();
}

function renderAll() {
    container.innerHTML = "";

    Object.values(focusState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, window.settings?.top?.focusListLength ?? 3)
        .forEach((data) => {
            const card = renderCard(data);
            container.appendChild(card); // ✅ Append created card
        });

    // ✅ After rendering all top heroes, remove any zombie cards
    const topSymbols = Object.values(focusState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, window.settings?.top?.focusListLength ?? 3)
        .map((s) => s.hero);

    // 🔍 Remove all cards not in the top list
    document.querySelectorAll(".ticker-card").forEach((card) => {
        const sym = card.dataset.symbol;
        if (!topSymbols.includes(sym)) {
            card.remove();
        }
    });
}

function updateCardDOM(hero) {
    // 1. Safety checks
    if (!hero || !focusState[hero]) {
        console.warn(`Hero "${hero}" not found in focusState`);
        return;
    }

    // 2. Check if hero is in top list
    const topN = window.settings?.top?.focusListLength ?? 10;
    const topHeroes = Object.values(focusState)
        .filter((s) => s.score > 0)
        .sort((a, b) => (b?.score || 0) - (a?.score || 0))
        .slice(0, topN)
        .map((s) => s?.hero)
        .filter(Boolean);

    if (!topHeroes.includes(hero)) return;

    // 3. Get DOM elements
    const existing = document.querySelector(`.ticker-card[data-symbol="${hero}"]`);
    if (!existing) return;

    // 4. Create new card
    const newCard = renderCard(focusState[hero]);

    // 5. Smooth bar transitions
    ["xp", "hp", "strength"].forEach((type) => {
        const oldBar = existing.querySelector(`.bar-fill.${type}`);
        const newBar = newCard.querySelector(`.bar-fill.${type}`);

        if (oldBar && newBar) {
            // Start from current width for smooth transition
            newBar.style.width = getComputedStyle(oldBar).width;

            // Force reflow before animating
            void newBar.offsetHeight;
        }
    });

    // 6. Replace card in DOM
    existing.replaceWith(newCard);

    // 7. Animate to final values
    requestAnimationFrame(() => {
        const state = focusState[hero];
        const strengthCap = state.price < 1.5 ? 800000 : 400000;

        newCard.querySelector(".bar-fill.xp").style.width = `${Math.min((state.xp / ((state.lv + 1) * 100)) * 100, 100)}%`;

        newCard.querySelector(".bar-fill.hp").style.width = `${Math.min((state.hp / maxHP) * 100, 100)}%`;

        newCard.querySelector(".bar-fill.strength").style.width = `${Math.min((state.strength / strengthCap) * 100, 100)}%`;
    });
}

function renderCard({ hero, price, hp, dp, strength }) {
    const card = document.createElement("div");
    card.className = "ticker-card";
    card.dataset.symbol = hero;

    const state = focusState[hero] || {
        hp: 0,
        dp: 0,
        lastEvent: { hp: 0, dp: 0 },
    };

    const change = state.lastEvent.hp ? `+${state.lastEvent.hp.toFixed(2)}%` : state.lastEvent.dp ? `-${state.lastEvent.dp.toFixed(2)}%` : "";
    const changeClass = state.lastEvent.hp ? "hp-boost" : state.lastEvent.dp ? "dp-damage" : "";

    const row = getSpriteRowFromState(state);
    const yOffset = row * 100;

    const topPosition = 100;
    const requiredXp = (state.lv + 1) * 100;
    const xpProgress = Math.min((state.xp / requiredXp) * 100, 100);
    const strengthCap = price < 1.5 ? 800000 : 400000;

    // Store initial values for animation
    const initialValues = {
        xp: state.xp,
        hp: state.hp,
        strength: strength,
    };

    card.innerHTML = `
    <div class="ticker-header">
        <div class="sprite-container">
            <div class="sprite" style="background-position: 0 -${yOffset}px;"></div>
        </div>
        <div class="ticker-info">
           <div class="ticker-symbol" style="background-color:${getSymbolColor(hero)}">
                $${hero} <span class="lv">LV ${state.lv}</span>
            </div>
            <div class="ticker-price">
                $<span class="price" style="font-size: 12px;">${price.toFixed(2)}</span>
            </div>
            ${change ? `<div class="${changeClass}" style="top: 0 + ${topPosition}px;">${change}</div>` : ""}
            <div id="score"><span class="bar-text score" style="font-size: 6px; margin-top:4px">SCORE: ${state.score.toFixed(0)}</span></div>
        </div>
    </div>
    <div class="bars">
        <div class="bar">
            <div class="bar-fill xp" style="width: ${Math.min((initialValues.xp / requiredXp) * 100, 100)}%">
                <span class="bar-text">XP: ${Math.floor(state.xp)} / ${requiredXp}</span>
            </div>
        </div>
        <div class="bar">
            <div class="bar-fill hp" style="width: ${Math.min((initialValues.hp / maxHP) * 100, 100)}%">
                <span class="bar-text">CHANGE: ${state.hp.toFixed(0)}</span>
            </div>
        </div>
        <div class="bar">
            <div class="bar-fill strength" style="width: ${Math.min((initialValues.strength / strengthCap) * 100, 100)}%">
                <span class="bar-text">VOLUME: ${Math.floor(strength / 1000)}k</span>
            </div>
        </div>
    </div>
    `;

    // Get references to the bars from the newly created card
    const xpBar = card.querySelector(".bar-fill.xp");
    const hpBar = card.querySelector(".bar-fill.hp");
    const strengthBar = card.querySelector(".bar-fill.strength");

    // Animate to final values
    requestAnimationFrame(() => {
        if (xpBar) xpBar.style.width = `${xpProgress}%`;
        if (hpBar) hpBar.style.width = `${Math.min((state.hp / maxHP) * 100, 100)}%`;
        if (strengthBar) strengthBar.style.width = `${Math.min((strength / strengthCap) * 100, 100)}%`;
    });

    const spriteEl = card.querySelector(".sprite");
    if (state.lastEvent.hp > 0 || state.lastEvent.dp > 0) {
        spriteEl.classList.add("sprite-active");
        setTimeout(() => {
            spriteEl.classList.remove("sprite-active");
        }, 900);
    }

    return card;
}

function getSpriteRowFromState({ hp, strength, lastEvent }) {
    if (hp <= 0) return 6; // Die
    if (lastEvent.dp > 0) return 5; // Taking damage
    if (lastEvent.hp > 0) return 2 + Math.floor(Math.random() * 3); // Random attack (2, 3, or 4)
    if (strength >= 200000) return 1; // Running
    return 0; // Idle
}

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

async function calculateScore(hero, event) {
    if (event.strength < 1000) {
        if (debug && debugSamples< debugLimitSamples) console.log("TO LOW VOLUME, SKIPPING...");
        return 0;
    }
    debugSamples++;
    const currentScore = Number(hero.score) || 0;

    // Logging initial state
    if (debug && debugSamples< debugLimitSamples)  console.log(`\n⚡⚡⚡ [${hero.hero}] SCORING BREAKDOWN ⚡⚡⚡`);
    if (debug && debugSamples< debugLimitSamples)  console.log(`📜 INITIAL STATE → Price: ${hero.price} |  Score: ${currentScore.toFixed(2)} | HP: ${hero.hp || 0} | DP: ${hero.dp || 0}`);

    let baseScore = 0;
    const logStep = (emoji, message, value) => console.log(`${emoji} ${message.padEnd(30)} ${(Number(value) || 0).toFixed(2)}`);

    try {
        // If it's an "up" event (hp > 0)
        if (event.hp > 0) {
            baseScore += event.hp;
            if (debug && debugSamples< debugLimitSamples)  logStep("💖", "Base HP Added", event.hp);
        }

        // If it's a "down" event (dp > 0)
        if (event.dp > 0) {
            baseScore -= event.dp;
            if (debug && debugSamples< debugLimitSamples)  logStep("💥", "Base DP Deducted", event.dp);
        }

        // Apply Float Multiplier
        const floatMult = getFloatMultiplier(hero.floatValue || 1);
        if (debug && debugSamples< debugLimitSamples)  logStep(hero.floatValue ? "🏷️" : "⚠️", `Float Mult (${humanReadableNumbers(hero.floatValue) || "N/A"})`, floatMult);

        if (floatMult < 0.01) {
            Score = 0;
        } else {
            baseScore *= floatMult;
        }

        // Apply Volume Multiplier

        const { multiplier: volMult } = await window.focusAPI.calculateVolumeImpact(event.strength || 0, hero.price || 1);
        if (debug && debugSamples< debugLimitSamples)  logStep("📢", `Volume Mult (${humanReadableNumbers(event.strength)})`, volMult);
        baseScore *= volMult;
    } catch (err) {
        console.error(`⚠️ Scoring error for ${hero.hero}:`, err);
        baseScore = 0; // Reset on error
    }

    // Final log and result
    if (debug && debugSamples< debugLimitSamples)  console.log("━".repeat(50));
    if (debug && debugSamples< debugLimitSamples)  logStep("🎯", "TOTAL SCORE CHANGE", baseScore);
    if (debug && debugSamples< debugLimitSamples)  console.log(`🎼 FINAL SCORE → ${Math.max(0, currentScore + baseScore).toFixed(2)}\n\n\n`);

    return baseScore;
}

function adjustMultiplier(multiplier) {
    return Math.max(0.01, Math.min(multiplier, 5)); // Limit to 3x max multiplier
}

function getFloatMultiplier(floatValue) {
    if (!floatValue) {
        return 1; // no multiplier if float data is missing or 0
    }

    let multiplier = 1;

    if (floatValue < 1_200_000) {
        multiplier = window.buffs.find((b) => b.key === "float1m")?.value ?? 1;
    } else if (floatValue < 5_000_000) {
        multiplier = window.buffs.find((b) => b.key === "float5m")?.value ?? 1;
    } else if (floatValue < 10_000_000) {
        multiplier = window.buffs.find((b) => b.key === "float10m")?.value ?? 1;
    } else if (floatValue < 50_000_000) {
        multiplier = window.buffs.find((b) => b.key === "float50m")?.value ?? 1;
    } else if (floatValue < 100_000_000) {
        multiplier = window.buffs.find((b) => b.key === "float100m")?.value ?? 1;
    } else if (floatValue < 200_000_000) {
        multiplier = window.buffs.find((b) => b.key === "float200m")?.value ?? 1;
    } else {
        multiplier = window.buffs.find((b) => b.key === "float600m+")?.value ?? 1;
    }

    return adjustMultiplier(multiplier);
}

function calculateXp(hero) {
    hero.xp += hero.lastEvent.hp || 0; // Only gain XP from HP events

    const requiredXp = (hero.lv + 1) * 100;

    while (hero.xp >= requiredXp) {
        hero.xp -= requiredXp;
        hero.lv += 1;

        // 🪄 Optional: Trigger "Level Up!" animation
        if (debug) console.log(`✨ ${hero.hero} leveled up to LV ${hero.lv}!`);
    }
}

function startScoreDecay() {
    setInterval(() => {
        let changed = false;

        Object.values(focusState).forEach((hero) => {
            if (hero.score > 0) {
                // Calculate a multiplier based on the current score.
                const scalingFactor = 1 + hero.score / SCORE_NORMALIZATION;
                // Compute the decay amount for this tick.
                const decayAmount = XP_DECAY_PER_TICK * scalingFactor;
                const newScore = Math.max(0, hero.score - decayAmount);
                if (hero.score !== newScore) {
                    hero.score = newScore;

                    // Clear any event indicators so that decay doesn't trigger new animations.
                    hero.lastEvent.hp = 0;
                    hero.lastEvent.dp = 0;
                    changed = true;
                }
            }
        });

        if (changed) {
            renderAll();
            saveState();
        }
    }, DECAY_INTERVAL_MS);
}

function humanReadableNumbers(value) {
    if (!value || isNaN(value)) return "-";
    const num = Number(value);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
    return num.toLocaleString(); // For values smaller than 1,000
}

// Constants to fine-tune the algorithm
const BASE_MULTIPLIER = 0.5; // Starting multiplier
const VOLUME_SCALING = 50000; // Volume divisor for log2 scaling
const PRICE_SCALING = 3; // Root type for price influence: 2 = square root, 3 = cube root
const MAX_MULTIPLIER = 2.5; // Cap on the multiplier

function calculateVolumeImpact(volume = 0, price = 1) {
    // Adjust volume factor
    const volumeFactor = Math.log2(1 + volume / VOLUME_SCALING);

    // Adjust price weight based on chosen scaling
    const priceWeight = PRICE_SCALING === 3 ? Math.cbrt(price) : Math.sqrt(price);

    // Compute multiplier with cap
    const rawMultiplier = BASE_MULTIPLIER * volumeFactor * priceWeight;
    const multiplier = Math.min(rawMultiplier, MAX_MULTIPLIER);

    return {
        multiplier,
        icon: volumeFactor > 1.5 ? "🔥" : volumeFactor > 1.0 ? "🚛" : "💤",
        label: `Volume (${volume.toLocaleString()})`,
    };
}
