const DECAY_INTERVAL_MS = 12000;
const XP_DECAY_PER_TICK = 0.2; // Base decay per tick (you might lower this for longer duration)
const SCORE_NORMALIZATION = 4; // Increase this value to reduce the impact of score on decay

const focusState = {};
let container;

const symbolColors = {};

let maxXP = 100;
let maxHP = 10;

const BASE_MAX_HP = 300;
const HP_SCALE_DOWN_THRESHOLD = 0.2; // 20%
const HP_SCALE_DOWN_FACTOR = 0.9; // Reduce by 10%

let lastActiveTickerUpdate = 0;
const ACTIVE_TICKER_UPDATE_INTERVAL = 3 * 60 * 1000; // 3 minutes
let currentTopHero = null;
let currentActiveTicker = null;

let lastTopHeroes = [];

isLongBiased = true;

let eventsPaused = false;

const debug = true;

const debugScoreCalc = true;
const debugLimitSamples = 1500;
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
    console.log("laoded settings: ", window.settings);

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
    const scoreDelta = calculateScore(hero, event); // Call the function synchronously
    hero.score = Math.max(0, (hero.score || 0) + scoreDelta);

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
    const sortedHeroes = Object.values(focusState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);

    const newTopHero = sortedHeroes[0]?.hero;
    const currentTopHeroes = sortedHeroes.slice(0, topN).map((s) => s.hero);
    const now = Date.now();

    // 1. Priority: Immediately update if #1 hero changes
    if (newTopHero && newTopHero !== currentTopHero) {
        currentTopHero = newTopHero;
        if (window.activeAPI?.setActiveTicker) {
            window.activeAPI.setActiveTicker(newTopHero);
            currentActiveTicker = newTopHero;
            lastActiveTickerUpdate = now;
            if (debug) console.log(`🏆 New top hero: ${newTopHero}`);
        }
    }
    // 2. Secondary: Auto-rotate every 3 minutes (if no #1 change)
    else if (window.activeAPI?.setActiveTicker && currentTopHeroes.length > 0 && now - lastActiveTickerUpdate >= ACTIVE_TICKER_UPDATE_INTERVAL) {
        // Filter out current active ticker to avoid immediate repeats
        const candidates = currentTopHeroes.filter((h) => h !== currentActiveTicker);
        const selectedHero = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : currentTopHeroes[Math.floor(Math.random() * currentTopHeroes.length)];

        window.activeAPI.setActiveTicker(selectedHero);
        currentActiveTicker = selectedHero;
        lastActiveTickerUpdate = now;

        if (debug) console.log(`🔀 Rotated to: ${selectedHero} (of ${currentTopHeroes.length} top heroes)`);
    }

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

function calculateScore(hero, event) {
    if (event.strength < 1000) {
        if (debug && debugSamples < debugLimitSamples) {
            console.log(`⚠️ Skipping event due to low volume (strength: ${event.strength})`);
        }
        return 0; // Skip this event entirely
    }

    debugSamples++;
    const currentScore = Number(hero.score) || 0;

    // Logging initial state
    if (debug && debugSamples < debugLimitSamples) console.log(`\n⚡⚡⚡ [${hero.hero}] SCORING BREAKDOWN ⚡⚡⚡`);
    if (debug && debugSamples < debugLimitSamples) console.log(`📜 INITIAL STATE → Price: ${hero.price} | Score: ${currentScore.toFixed(2)} | HP: ${hero.hp || 0} | DP: ${hero.dp || 0}`);

    let baseScore = 0;
    const logStep = (emoji, message, value) => console.log(`${emoji} ${message.padEnd(30)} ${(Number(value) || 0).toFixed(2)}`);

    try {
        // If it's an "up" event (hp > 0)
        if (event.hp > 0) {
            baseScore += event.hp * 10;
            if (debug && debugSamples < debugLimitSamples) logStep("💖", "Base HP Added", baseScore);

            // Apply Float score
            const floatScore = getFloatScore(hero.floatValue || 1);
            if (debug && debugSamples < debugLimitSamples) {
                const formattedFloat = hero.floatValue ? humanReadableNumbers(hero.floatValue) : "N/A";
                logStep(hero.floatValue ? "🏷️" : "⚠️", `Float score (${formattedFloat})`, floatScore);
            }
            baseScore += floatScore;

            // Apply Volume score
            const volRes = calculateVolumeImpact(event.strength || 0, hero.price || 1);

            // Debugging: log the multiplier and category assigned
            if (debug && debugSamples < debugLimitSamples) {
                logStep("📢", `${volRes.message}`, volRes.score);
            }
            baseScore += volRes.score;
        }

        // If it's a "down" event (dp > 0)
        if (event.dp > 0) {
            baseScore -= event.dp * 10;
            if (debug && debugSamples < debugLimitSamples) logStep("💥", "Base DP Deducted", event.dp);
        }
    } catch (err) {
        console.error(`⚠️ Scoring error for ${hero.hero}:`, err);
        baseScore = 0; // Reset on error
    }

    // Final log and result
    if (debug && debugSamples < debugLimitSamples) console.log("━".repeat(50));
    if (debug && debugSamples < debugLimitSamples) logStep("🎯", "TOTAL SCORE CHANGE", baseScore);
    if (debug && debugSamples < debugLimitSamples) console.log(`🎼 FINAL SCORE → ${Math.max(0, currentScore + baseScore).toFixed(2)}\n\n\n`);

    return baseScore;
}

function getFloatScore(floatValue) {
    if (!floatValue) return 0; // Neutral score if missing

    const floatBuffs = window.buffs?.filter((b) => b.key?.startsWith("float")) || [];

    if (floatValue < 2_000_000) {
        return floatBuffs.find((b) => b.key === "float1m")?.score ?? 0;
    } else if (floatValue < 7_500_000) {
        return floatBuffs.find((b) => b.key === "float5m")?.score ?? 0;
    } else if (floatValue < 13_000_000) {
        return floatBuffs.find((b) => b.key === "float10m")?.score ?? 0;
    } else if (floatValue < 65_000_000) {
        return floatBuffs.find((b) => b.key === "float50m")?.score ?? 0;
    } else if (floatValue < 125_000_000) {
        return floatBuffs.find((b) => b.key === "float100m")?.score ?? -50;
    } else if (floatValue < 250_000_000) {
        return floatBuffs.find((b) => b.key === "float200m")?.score ?? -100;
    } else if (floatValue < 600_000_000) {
        return floatBuffs.find((b) => b.key === "float500m")?.score ?? -300;
    } else {
        return floatBuffs.find((b) => b.key === "float600m+")?.score ?? -1000;
    }
}

function getFloatScore(floatValue) {
    if (!floatValue) {
        return 1; // no multiplier if float data is missing or 0
    }

    let score = 1;

    if (floatValue < 2_000_000) {
        score = window.buffs.find((b) => b.key === "float1m")?.score ?? 1;
    } else if (floatValue < 7_500_000) {
        score = window.buffs.find((b) => b.key === "float5m")?.score ?? 1;
    } else if (floatValue < 13_000_000) {
        score = window.buffs.find((b) => b.key === "float10m")?.score ?? 1;
    } else if (floatValue < 65_000_000) {
        score = window.buffs.find((b) => b.key === "float50m")?.score ?? 1;
    } else if (floatValue < 125_000_000) {
        score = window.buffs.find((b) => b.key === "float100m")?.score ?? 1;
    } else if (floatValue < 250_000_000) {
        score = window.buffs.find((b) => b.key === "float200m")?.score ?? 1;
    } else if (floatValue < 600_000_000) {
        score = window.buffs.find((b) => b.key === "float500m")?.score ?? 1;
    } else {
        score = window.buffs.find((b) => b.key === "float600m+")?.score ?? 0.01;
    }

    return score;
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
    let decayTickCount = 0;
    const DECAY_TICKS_BETWEEN_LOGS = 5; // Only log every 5 ticks to avoid spam

    console.log(`\n🌌🌠 STARTING SCORE DECAY SYSTEM 🌠🌌`);
    console.log(`⏱️  Decay Interval: ${DECAY_INTERVAL_MS}ms`);
    console.log(`📉 Base Decay/Tick: ${XP_DECAY_PER_TICK}`);
    console.log(`⚖️  Normalization Factor: ${SCORE_NORMALIZATION}\n`);

    setInterval(() => {
        decayTickCount++;
        let changed = false;
        let totalDecay = 0;
        let heroesDecayed = 0;
        const activeHeroes = [];

        Object.values(focusState).forEach((hero) => {
            if (hero.score > 0) {
                const originalScore = hero.score;
                const scalingFactor = 1 + hero.score / SCORE_NORMALIZATION;
                const decayAmount = XP_DECAY_PER_TICK * scalingFactor;
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
            // Only show full details periodically
            if (decayTickCount % DECAY_TICKS_BETWEEN_LOGS === 0) {
                console.log(`\n⏳ [DECAY TICK #${decayTickCount}]`);
                console.log(`🌡️ ${heroesDecayed} heroes decaying | Total decay: ${totalDecay.toFixed(2)}`);
                console.log("━".repeat(50));

                // Show top 3 most affected heroes (or all if ≤3)
                activeHeroes
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)
                    .forEach((hero) => {
                        const decayAmount = XP_DECAY_PER_TICK * (1 + hero.score / SCORE_NORMALIZATION);
                        console.log(`🧙 ${hero.hero.padEnd(15)}`);
                        console.log(`   📊 Score: ${hero.score.toFixed(2).padStart(8)} → ${(hero.score - decayAmount).toFixed(2)}`);
                        console.log(`   🔻 Decay: ${decayAmount.toFixed(2)} (scale: ${(1 + hero.score / SCORE_NORMALIZATION).toFixed(2)}x)`);
                        console.log("─".repeat(50));
                    });
            }

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

function calculateVolumeImpact(volume = 0, price = 1) {
    const categories = (window.buffs || []).filter(
        (buff) => buff.category && (typeof buff.priceThreshold === "number" || buff.priceThreshold === "Infinity") && Array.isArray(buff.volumeStages) && buff.volumeStages.length > 0
    );

    let result = {
        multiplier: 1,
        score: 0,
        capAssigned: "None",
        volumeStage: "None",
        message: "No matching category found",
        style: {
            cssClass: "volume-none",
            icon: "",
            description: "No volume",
            color: "#cccccc",
            animation: "none",
        },
    };

    if (categories.length === 0) return result;

    // Sort categories by price (lowest first, Infinity last)
    const sortedCategories = [...categories].sort((a, b) => {
        const aPrice = a.priceThreshold === "Infinity" ? Infinity : a.priceThreshold;
        const bPrice = b.priceThreshold === "Infinity" ? Infinity : b.priceThreshold;
        return aPrice - bPrice;
    });

    // Find matching category
    for (const category of sortedCategories) {
        const priceThreshold = category.priceThreshold === "Infinity" ? Infinity : category.priceThreshold;
        if (price <= priceThreshold) {
            result.capAssigned = category.category;

            // Sort stages by threshold (descending, highest first)
            const sortedStages = [...category.volumeStages].sort((a, b) => {
                const aThreshold = a.volumeThreshold === "Infinity" ? Infinity : a.volumeThreshold;
                const bThreshold = b.volumeThreshold === "Infinity" ? Infinity : b.volumeThreshold;
                return bThreshold - aThreshold; // Descending order
            });

            // Find the first stage where volume is <= threshold
            let matchedStage = null;
            for (const stage of sortedStages) {
                const threshold = stage.volumeThreshold === "Infinity" ? Infinity : stage.volumeThreshold;
                if (volume <= threshold) {
                    matchedStage = stage;
                } else {
                    break; // Since we're going high to low, stop once volume exceeds threshold
                }
            }

            // If no stage matched (volume > all thresholds), use the highest threshold stage
            const stageToUse = matchedStage || sortedStages[0];

            if (stageToUse) {
                result.multiplier = stageToUse.multiplier;
                result.score = stageToUse.score || 0;
                result.volumeStage = stageToUse.key;
                result.message = `${category.category} ${stageToUse.key} (${humanReadableNumbers(volume)})`;

                result.style = {
                    cssClass: `volume-${stageToUse.key.toLowerCase()}`,
                    icon: stageToUse.icon || "",
                    description: stageToUse.desc || stageToUse.key,
                    color: getColorForStage(stageToUse.key), // Assuming this function is defined elsewhere
                    animation: stageToUse.key === "parabolicVol" ? "pulse 1.5s infinite" : "none",
                };
            }
            break;
        }
    }

    return result;
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
