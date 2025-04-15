const DECAY_INTERVAL_MS = 1000;
const XP_DECAY_PER_TICK = 0.1; // Base decay per tick (you might lower this for longer duration)
const SCORE_NORMALIZATION = 10; // Increase this value to reduce the impact of score on decay

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

isLongBiased = true;

let eventsPaused = false;

const debug = true;

const debugScoreCalc = true;
const debugLimitSamples = 6000;
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

function loadState() {
    const saved = localStorage.getItem("frontlineState");
    if (!saved) return false;

    try {
        const parsed = JSON.parse(saved);
        const today = getMarketDateString();

        if (parsed.date === today) {
            Object.entries(parsed.state).forEach(([symbol, data]) => {
                frontlineState[symbol] = data;
            });
            if (debug) console.log("🔄 Restored frontline state from earlier session.");
            return true;
        } else {
            if (debug) console.log("🧼 Session from previous day. Skipping restore.");
            localStorage.removeItem("frontlineState");
            return false;
        }
    } catch (err) {
        console.warn("⚠️ Could not parse frontline state. Clearing.");
        localStorage.removeItem("frontlineState");
        return false;
    }
}

function clearState() {
    localStorage.removeItem("frontlineState");
    for (const key in frontlineState) {
        delete frontlineState[key];
    }
    if (debug) console.log("🧹 Cleared saved and in-memory frontline state.");
}

document.addEventListener("DOMContentLoaded", async () => {
    if (debug) console.log("⚡ DOMContentLoaded event fired!");

    const restored = loadState(); // ✅ returns true if valid state loadedloadState();

    if (debug) console.log();

    container = document.getElementById("frontline"); // frontline div is where the cards will be injected

    // 1. Get symbols from preload store
    const storeSymbols = await window.frontlineAPI.getSymbols();
    window.settings = await window.settingsAPI.get();
    console.log("laoded settings: ", window.settings);

    // ✅ Listen for settings updates globally
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        if (debug) console.log("🎯 Settings updated, applying changes...", updatedSettings);
        window.settings = updatedSettings;
        renderAll();
    });

    // 2. Create initial frontline state
    // Only init state if we didn't load one
    if (!restored) {
        storeSymbols.forEach((symbolData) => {
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
                percs: [],
                floatValue: symbolData.statistics.floatShares,
            };
        });
    }

    renderAll();

    // 3. Listen for incoming alerts
    window.alertAPI.onAlertEvents((events) => {
        events.forEach(updateFrontlineStateFromEvent);
        // if(debug) console.log("⚡ Received frontline events:", events);
    });

    startScoreDecay();
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
    if (event.dp > 0) hero.hp = Math.max(hero.hp - event.dp, 0);

    // Update score
    const scoreDelta = calculateScore(hero, event);
    hero.score = Math.max(0, (hero.score || 0) + scoreDelta);

    hero.lastEvent = {
        hp: event.hp || 0,
        dp: event.dp || 0,
        score: scoreDelta,
    };

    hero.strength = event.strength;
    calculateXp(hero);

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
    saveState();
}

function renderAll() {
    container.innerHTML = "";

    Object.values(frontlineState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, window.settings?.top?.frontlineListLength ?? 3)
        .forEach((data) => {
            const card = renderCard(data);
            container.appendChild(card); // ✅ Append created card
        });

    // ✅ After rendering all top heroes, remove any zombie cards
    const topSymbols = Object.values(frontlineState)
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, window.settings?.top?.frontlineListLength ?? 3)
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
    if (!hero || !frontlineState[hero]) return;

    const existing = document.querySelector(`.ticker-card[data-symbol="${hero}"]`);
    if (!existing) return;

    const newCard = renderCard(frontlineState[hero]);

    // Smooth transitions
    ["hp", "score", "strength"].forEach((type) => {
        const oldBar = existing.querySelector(`.bar-fill.${type}`);
        const newBar = newCard.querySelector(`.bar-fill.${type}`);

        if (oldBar && newBar) {
            newBar.style.width = getComputedStyle(oldBar).width;
            void newBar.offsetHeight; // Force reflow
        }
    });

    // Add highlight animation class before replacing
    newCard.classList.add("card-update-highlight");

    existing.replaceWith(newCard);

    // Animate to final values
    requestAnimationFrame(() => {
        const state = frontlineState[hero];
        newCard.querySelector(".bar-fill.score").style.width = `${Math.min((state.score / maxScore) * 100, 100)}%`;
        newCard.querySelector(".bar-fill.hp").style.width = `${Math.min((state.hp / maxHP) * 100, 100)}%`;
        newCard.querySelector(".bar-fill.strength").style.width = `${Math.min((state.strength / 400000) * 100, 100)}%`;

        // Remove highlight after animation completes
        setTimeout(() => {
            newCard.classList.remove("card-update-highlight");
        }, 1000);
    });
}

function renderCard({ hero, price, hp, dp, strength }) {
    const card = document.createElement("div");
    card.className = "ticker-card";
    card.dataset.symbol = hero;

    const state = frontlineState[hero] || {
        score,
        hp: 0,
        dp: 0,
        lastEvent: { hp: 0, dp: 0 },
    };

    const change = state.lastEvent.hp ? `+${state.lastEvent.hp.toFixed(2)}%` : state.lastEvent.dp ? `-${state.lastEvent.dp.toFixed(2)}%` : "";
    const changeClass = state.lastEvent.hp ? "hp-boost" : state.lastEvent.dp ? "dp-damage" : "";

    const volumeImpact = calculateVolumeImpact(strength, price);

    // Store initial values for animation
    const initialValues = {
        score: state.score,
        hp: state.hp,
        strength: strength,
    };

    const opacity = state.score < 10 ? 0.5 : 1;
    const opacityStyle = `opacity: ${opacity}`;

    card.innerHTML = `
    <div class="ticker-header" style="${opacityStyle}">
        <div class="ticker-symbol" style="background-color:${getSymbolColor(hero)}"> $${hero} </div>
        <div class="ticker-info">
            <div class="ticker-data">
                <span class="price">$${price.toFixed(2)}</span>
                <span class="bar-text ${volumeImpact.style.cssClass}">${Math.floor(strength / 1000)}k</span>
                ${change ? `<span class="${changeClass}">${change}</span>` : ""}
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

            // Apply Float Multiplier
            const floatMult = getFloatMultiplier(hero.floatValue || 1);
            if (debug && debugSamples < debugLimitSamples) logStep(hero.floatValue ? "🏷️" : "⚠️", `Float Mult (${humanReadableNumbers(hero.floatValue) || "N/A"})`, floatMult);
            baseScore *= floatMult;

            // Apply Volume Multiplier
            const volMult = calculateVolumeImpact(event.strength || 0, hero.price || 1);

            // Debugging: log the multiplier and category assigned
            if (debug && debugSamples < debugLimitSamples) logStep("📢", `${volMult.message}`, volMult.multiplier);

            baseScore *= volMult.multiplier;
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

function getFloatMultiplier(floatValue) {
    if (!floatValue) {
        return 1; // no multiplier if float data is missing or 0
    }

    let multiplier = 1;

    if (floatValue < 2_000_000) {
        multiplier = window.buffs.find((b) => b.key === "float1m")?.multiplier ?? 1;
    } else if (floatValue < 7_500_000) {
        multiplier = window.buffs.find((b) => b.key === "float5m")?.multiplier ?? 1;
    } else if (floatValue < 13_000_000) {
        multiplier = window.buffs.find((b) => b.key === "float10m")?.multiplier ?? 1;
    } else if (floatValue < 65_000_000) {
        multiplier = window.buffs.find((b) => b.key === "float50m")?.multiplier ?? 1;
    } else if (floatValue < 125_000_000) {
        multiplier = window.buffs.find((b) => b.key === "float100m")?.multiplier ?? 1;
    } else if (floatValue < 250_000_000) {
        // Added back (exists in your JSON)
        multiplier = window.buffs.find((b) => b.key === "float200m")?.multiplier ?? 1;
    } else if (floatValue < 600_000_000) {
        multiplier = window.buffs.find((b) => b.key === "float500m")?.multiplier ?? 1;
    } else {
        multiplier = window.buffs.find((b) => b.key === "float600m+")?.multiplier ?? 0.01;
    }

    return multiplier;
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

        Object.values(frontlineState).forEach((hero) => {
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
    if (value === null || value === undefined || isNaN(value) || value === "") {
        return "-";
    }
    const num = Math.abs(Number(value));
    const isNegative = Number(value) < 0;
    const formatNumber = (dividedNum, suffix) => {
        if (Math.abs(dividedNum - Math.round(dividedNum)) < 0.0001) {
            return (isNegative ? "-" : "") + Math.round(dividedNum) + suffix;
        }
        return (isNegative ? "-" : "") + dividedNum.toFixed(2) + suffix;
    };
    if (num >= 1_000_000_000) {
        return formatNumber(num / 1_000_000_000, "B");
    }
    if (num >= 1_000_000) {
        return formatNumber(num / 1_000_000, "M");
    }
    if (num >= 1_000) {
        return formatNumber(num / 1_000, "K");
    }
    if (num < 1) {
        return (isNegative ? "-" : "") + num.toFixed(2);
    }
    return (isNegative ? "-" : "") + Math.floor(num).toLocaleString();
}

function calculateVolumeImpact(volume = 0, price = 1) {
    const categories = (window.buffs || []).filter(
        (buff) => buff.category && (typeof buff.priceThreshold === "number" || buff.priceThreshold === "Infinity") && Array.isArray(buff.volumeStages) && buff.volumeStages.length > 0
    );

    let result = {
        multiplier: 1,
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
                result.volumeStage = stageToUse.key;
                result.message = `${category.category} ${stageToUse.key} (${humanReadableNumbers(volume)})`;

                result.style = {
                    cssClass: `volume-${stageToUse.key.toLowerCase()}`,
                    icon: stageToUse.icon || "",
                    description: stageToUse.desc || stageToUse.key,
                    color: getColorForStage(stageToUse.key),
                    animation: stageToUse.key === "parabolicVol" ? "pulse 1.5s infinite" : "none",
                };
            }
            break;
        }
    }

    return result;
}

// Placeholder for getColorForStage (since it wasn't provided)
function getColorForStage(stageKey) {
    const colors = {
        lowVol: "#cccccc",
        mediumVol: "#4caf50",
        highVol: "#ff9800",
        parabolicVol: "#f44336",
    };
    return colors[stageKey] || "#cccccc";
}

// Placeholder for humanReadableNumbers (since it wasn't provided)
function humanReadableNumbers(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
    return num.toString();
}

// Helper function to get colors for each stage
function getColorForStage(stageKey) {
    const colors = {
        lowVol: "#6b7280",
        mediumVol: "#3b82f6",
        highVol: "#ef4444",
        parabolicVol: "#f59e0b",
        default: "#cccccc",
    };
    return colors[stageKey] || colors.default;
}
