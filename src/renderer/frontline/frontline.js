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
        const [settings, storeSymbols, restored] = await Promise.all([
            window.settingsAPI.get(),
            window.frontlineAPI.getSymbols(),
            loadState(), // Now async
        ]);

        window.settings = settings;

        // Initialize state if not restored
        if (!restored) {
            storeSymbols.forEach((symbolData) => {
                if (!frontlineState[symbolData.symbol]) {
                    frontlineState[symbolData.symbol] = {
                        hero: symbolData.symbol,
                        price: symbolData.price || 1,
                        hp: 0,
                        dp: 0,
                        strength: 0,
                        xp: 0,
                        lv: 1,
                        score: 0,
                        lastEvent: {
                            hp: 0,
                            dp: 0,
                            xp: 0,
                        },
                        floatValue: symbolData.statistics?.floatShares || 0, // Safe access
                        buffs: symbolData.buffs || {},
                        highestPrice: symbolData.highestPrice ?? symbolData.price ?? 1,
                    };
                }
            });
        }

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

        window.storeAPI.onBuffsUpdate((updatedSymbols) => {
            updatedSymbols.forEach((updatedSymbol) => {
                const hero = frontlineState[updatedSymbol.symbol];
                if (!hero) return;

                hero.buffs = updatedSymbol.buffs || hero.buffs;

                if (updatedSymbol.highestPrice > (hero.highestPrice || 0)) {
                    hero.highestPrice = updatedSymbol.highestPrice;
                }

                if (updatedSymbol.lastEvent) {
                    hero.lastEvent = updatedSymbol.lastEvent;
                }

                updateCardDOM(hero.hero);
            });
        });

        renderAll();
        startScoreDecay();
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

    calculateXp(hero, event);

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
    function calculateVolumeImpact(volume = 0, price = 1) {
        const categories = Object.entries(window.buffs)
            .map(([category, data]) => ({ category, ...data }))
            .sort((a, b) => a.priceThreshold - b.priceThreshold);

        for (const category of categories) {
            if (price <= category.priceThreshold) {
                const sortedStages = [...category.volumeStages].sort((a, b) => a.volumeThreshold - b.volumeThreshold);

                const stageToUse =
                    sortedStages.find((stage, index) => {
                        const current = stage.volumeThreshold;
                        const prev = index === 0 ? 0 : sortedStages[index - 1].volumeThreshold;
                        if (index === sortedStages.length - 1) {
                            return volume >= prev;
                        }
                        return volume > prev && volume <= current;
                    }) || sortedStages[sortedStages.length - 1];

                // ✅ Only now we can safely use stageToUse
                return {
                    ...stageToUse, // ⬅️ brings icon, desc, isBuff, key, etc.
                    capAssigned: category.category,
                    volumeStage: stageToUse.key,
                    message: `${category.category} ${stageToUse.key} (${humanReadableNumbers(volume)})`,
                    style: {
                        cssClass: `volume-${stageToUse.key.toLowerCase()}`,
                        color: getColorForStage(stageToUse.key),
                        animation: stageToUse.key === "parabolicVol" ? "pulse 1.5s infinite" : "none",
                    },
                };
            }
        }

        // Fallback if no category matched
        return {
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
            score: 0,
        };
    }

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
        function calculateVolumeImpact(volume = 0, price = 1) {
            const categories = Object.entries(window.buffs)
                .map(([category, data]) => ({ category, ...data }))
                .sort((a, b) => a.priceThreshold - b.priceThreshold);

            for (const category of categories) {
                if (price <= category.priceThreshold) {
                    const sortedStages = [...category.volumeStages].sort((a, b) => a.volumeThreshold - b.volumeThreshold);

                    const stageToUse =
                        sortedStages.find((stage, index) => {
                            const current = stage.volumeThreshold;
                            const prev = index === 0 ? 0 : sortedStages[index - 1].volumeThreshold;
                            if (index === sortedStages.length - 1) {
                                return volume >= prev;
                            }
                            return volume > prev && volume <= current;
                        }) || sortedStages[sortedStages.length - 1];

                    // ✅ Only now we can safely use stageToUse
                    return {
                        ...stageToUse, // ⬅️ brings icon, desc, isBuff, key, etc.
                        capAssigned: category.category,
                        volumeStage: stageToUse.key,
                        message: `${category.category} ${stageToUse.key} (${humanReadableNumbers(volume)})`,
                        style: {
                            cssClass: `volume-${stageToUse.key.toLowerCase()}`,
                            color: getColorForStage(stageToUse.key),
                            animation: stageToUse.key === "parabolicVol" ? "pulse 1.5s infinite" : "none",
                        },
                    };
                }
            }

            // Fallback if no category matched
            return {
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
                score: 0,
            };
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
<div class="ticker-header" style="${opacityStyle}">
    <div class="ticker-symbol" style="background-color:${getSymbolColor(hero)}"> $${hero} </div>
    <div class="ticker-info">
        <div class="ticker-data">
            <span class="price">$${price.toFixed(2)}</span>
            <span class="bar-text ${volumeImpact.style.cssClass}">${Math.floor(strength / 1000)}k</span>
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

            const floatBuff = getHeroBuff(hero, "float");
            const floatMult = floatBuff?.multiplier ?? 1;
            baseScore *= floatMult;
            logStep(floatBuff?.key === "floatCorrupt" ? "🧨" : "🏷️", `Float Mult (${humanReadableNumbers(hero.floatValue)})`, floatMult);

            const volumeBuff = getHeroBuff(hero, "volume");
            const volMult = volumeBuff?.multiplier ?? 1;
            baseScore *= volMult;
            logStep("📢", volumeBuff?.message ?? `No volume buff (${humanReadableNumbers(event.strength || 0)})`, volMult);
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

function calculateXp(hero, event) {
    const hp = event.hp || 0;
    const dp = event.dp || 0;
    const totalMove = hp + dp;
    const strength = event.strength || 0;

    // 📈 Base XP gain from price action and volume strength
    let baseXp = totalMove * 10; // Adjust divisor to balance XP scaling

    // 🎯 Get buff-based multiplier (float, volume, etc.)
    const volumeBuff = getHeroBuff(hero, "volume");
    const volMult = volumeBuff?.multiplier ?? 1;

    const xpDelta = Math.round(baseXp * volMult);

    hero.xp = (hero.xp || 0) + xpDelta;

    hero.lv = Math.max(1, hero.lv || 1);
    const requiredXp = hero.lv * 1000;
    while (hero.xp >= requiredXp) {
        hero.xp -= requiredXp;
        hero.lv += 1;
        if (debug) console.log(`✨ ${hero.hero} leveled up to LV ${hero.lv}!`);
    }

    if (debugXp) {
        console.log(`⚡⚡⚡ [${hero.hero}] XP BREAKDOWN ⚡⚡⚡`);
        console.log(`📜 ALERT → HP: ${hp.toFixed(2)} | DP: ${dp.toFixed(2)} | Strength: ${strength.toLocaleString()}`);
        console.log(`💖 Base XP                     ${baseXp.toFixed(2)}`);

        if (volumeBuff?.desc) {
            console.log(`🏷️ Buff: ${volumeBuff.desc.padEnd(26)} x${volMult.toFixed(2)}`);
        } else {
            console.log(`🏷️ Volume Multiplier           x${volMult.toFixed(2)}`);
        }

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`🎯 XP GAINED                   ${xpDelta}`);
        console.log(`🎼 TOTAL XP →                  ${hero.xp} (LV ${hero.lv})`);
    }

    window.frontlineAPI?.updateXp(hero.hero, hero.xp, hero.lv);
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
                const scale = 1 + hero.score / SCORE_NORMALIZATION;
                const cling = 0.2;
                const taper = Math.max(cling, Math.min(1, hero.score / 10)); // Tapers when score < 10
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
    const categories = Object.entries(window.buffs)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => a.priceThreshold - b.priceThreshold);

    for (const category of categories) {
        if (price <= category.priceThreshold) {
            const sortedStages = [...category.volumeStages].sort((a, b) => a.volumeThreshold - b.volumeThreshold);

            const stageToUse =
                sortedStages.find((stage, index) => {
                    const current = stage.volumeThreshold;
                    const prev = index === 0 ? 0 : sortedStages[index - 1].volumeThreshold;
                    if (index === sortedStages.length - 1) {
                        return volume >= prev;
                    }
                    return volume > prev && volume <= current;
                }) || sortedStages[sortedStages.length - 1];

            // ✅ Only now we can safely use stageToUse
            return {
                ...stageToUse, // ⬅️ brings icon, desc, isBuff, key, etc.
                capAssigned: category.category,
                volumeStage: stageToUse.key,
                message: `${category.category} ${stageToUse.key} (${humanReadableNumbers(volume)})`,
                style: {
                    cssClass: `volume-${stageToUse.key.toLowerCase()}`,
                    color: getColorForStage(stageToUse.key),
                    animation: stageToUse.key === "parabolicVol" ? "pulse 1.5s infinite" : "none",
                },
            };
        }
    }

    // Fallback if no category matched
    return {
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
        score: 0,
    };
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

function getColorForStage(stageKey) {
    const colors = {
        lowVol: "#cccccc",
        mediumVol: "#4caf50",
        highVol: "#ff9800",
        parabolicVol: "#f44336",
    };
    return colors[stageKey] || "#cccccc";
}

function humanReadableNumbers(num) {
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
        return false;
    }
    const saved = localStorage.getItem("frontlineState");
    if (!saved) return false;

    try {
        const parsed = JSON.parse(saved);
        const today = getMarketDateString();

        if (parsed.date === today) {
            Object.assign(frontlineState, parsed.state); // More efficient than forEach
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
