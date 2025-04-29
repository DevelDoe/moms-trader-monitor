const DECAY_INTERVAL_MS = 6000;
const XP_DECAY_PER_TICK = 0.2; // Base decay per tick (you might lower this for longer duration)
const SCORE_NORMALIZATION = 5; // Increase this value to reduce the impact of score on decay

const focusState = {};
let container;

const symbolColors = {};

let maxXP = 1000;
let maxHP = 10;

const BASE_MAX_HP = 300;
const HP_SCALE_DOWN_THRESHOLD = 0.2; // 20%
const HP_SCALE_DOWN_FACTOR = 0.9; // Reduce by 10%

let lastActiveTickerUpdate = 0;
const ACTIVE_TICKER_UPDATE_INTERVAL = 3 * 60 * 1000; // 3 minutes
let currentTopHero = null;
let currentActiveTicker = null;

let lastTopHeroes = [];

let eventsPaused = false;

const { isDev } = window.appFlags;

const freshStart = isDev;
const debug = isDev;
const debugScoreCalc = isDev;
const debugXp = isDev;

console.log("🎯 Fresh start mode:", freshStart);
console.log("🐛 Debug mode:", debug);

const debugLimitSamples = 1500;
let debugSamples = 0;

let buffs = [];

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Hero window loaded");

    container = document.getElementById("focus");

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

    try {
        const [settings, storeSymbols, restoredState] = await Promise.all([window.settingsAPI.get(), window.heroesAPI.getSymbols(), loadState()]);

        window.settings = settings;

        // Merge restored state
        if (restoredState) {
            Object.assign(focusState, restoredState);
        }

        // Hydrate missing entries from store
        storeSymbols.forEach((symbolData) => {
            if (!focusState[symbolData.symbol]) {
                focusState[symbolData.symbol] = {
                    hero: symbolData.symbol,
                    hp: 0,
                    dp: 0,
                    score: 0,
                    xp: symbolData.xp || 0, // ← FIX HERE
                    lv: symbolData.lv || 1, // ← maybe also fix lv
                    totalXpGained: symbolData.totalXpGained || 0,
                    lastEvent: { hp: 0, dp: 0 },
                    floatValue: symbolData.statistics?.floatShares || 0,
                    buffs: symbolData.buffs || {},
                    highestPrice: symbolData.highestPrice ?? symbolData.price ?? 1,
                };
            }
        });

        renderAll();
        startScoreDecay();

        // 🟢 Push top tickers to TradingView immediately (on initial state)
        const topN = window.settings?.top?.focusListLength ?? 10;
        const sortedHeroes = Object.values(focusState)
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score);

        const initialTopTickers = sortedHeroes.slice(0, topN).map((s) => s.hero);
        if (initialTopTickers.length > 0 && window.traderviewAPI?.setTopTickers) {
            const traderviewWindowCount = window.settings?.top?.traderviewWindowCount ?? 3;
            const topForTradingView = initialTopTickers.slice(0, traderviewWindowCount);
            window.traderviewAPI.setTopTickers(topForTradingView);
            if (debug) console.log("🚀 Initial TradingView tickers set:", topForTradingView);
        }

        // Set up event listeners AFTER initialization
        window.settingsAPI.onUpdate(async (updatedSettings) => {
            if (debug) console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);
            window.settings = updatedSettings;
            renderAll();
        });

        window.heroesAPI.onFocusEvents((events) => {
            const minPrice = window.settings?.top?.minPrice ?? 0;
            const maxPrice = window.settings?.top?.maxPrice ?? Infinity;

            events.forEach((event) => {
                if (event.price < minPrice || (maxPrice > 0 && event.price > maxPrice)) {
                    if (debug) console.log(`🚫 ${event.hero} skipped — price $${event.price} outside range $${minPrice}-$${maxPrice}`);
                    return;
                }
                updateFocusStateFromEvent(event);
            });
        });

        window.storeAPI.onHeroUpdate((updatedHeroes) => {
            updatedHeroes.forEach((updated) => {
                const hero = focusState[updated.hero];
                if (!hero) return;

                hero.buffs = updated.buffs || hero.buffs;
                hero.highestPrice = Math.max(hero.highestPrice || 0, updated.highestPrice || 0);
                hero.lastEvent = updated.lastEvent || hero.lastEvent;
                hero.xp = updated.xp ?? hero.xp;
                hero.lv = updated.lv ?? hero.lv;
                hero.totalXpGained = updated.totalXpGained ?? (hero.totalXpGained || 0); // <-- already good!

                if (debugXp) console.log(`🎮 ${updated.hero} XP update → LV ${hero.lv}, XP ${hero.xp}, TOTAL XP ${hero.totalXpGained}`);
                updateCardDOM(hero.hero);
            });
        });

        window.electronAPI.onXpReset(() => {
            console.log("🧼 XP Reset received — resetting XP and LV in focus");

            Object.values(focusState).forEach((hero) => {
                hero.xp = 0;
                hero.lv = 1;
                updateCardDOM(hero.hero);
            });

            saveState(); // ✅ Persist new XP/LV state
        });

        window.electronAPI.onNukeState(() => {
            console.warn("🧨 Nuke signal received — clearing local state.");
            clearState();
            location.reload();
        });
    } catch (error) {
        console.error("Initialization failed:", error);
        // Fallback or error handling here
    }
});

let lastTickerSetAt = 0;
const MIN_UPDATE_INTERVAL = 5000; // 3 seconds

function updateFocusStateFromEvent(event) {
    if (eventsPaused) return;
    if (!event || !event.hero) {
        console.warn("Invalid event received:", event);
        return;
    }

    let hero = focusState[event.hero];

    hero.price = event.price;

    const wasDead = hero.hp === 0 && event.hp > 0;
    if (wasDead && debug) console.log(`💀 ${hero.hero} RISES FROM DEAD!`);

    const isReversal = hero.lastEvent.dp > 0 && event.hp > 0;
    if (isReversal && debug) console.log(`🔄 ${hero.hero} REVERSAL!`);

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

    const scoreDelta = calculateScore(hero, event);
    hero.score = Math.max(0, (hero.score || 0) + scoreDelta);

    hero.strength = event.strength;

    let needsFullRender = false;
    if (hero.hp > maxHP) {
        maxHP = hero.hp * 1.05;
        needsFullRender = true;
    }

    const topN = window.settings?.top?.focusListLength ?? 10;
    const sortedHeroes = Object.values(focusState)
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
            if (debug) console.log(`🏆 New top hero: ${newTopHero}`);
        }
    } else if (window.activeAPI?.setActiveTicker && currentTopHeroes.length > 0 && now - lastActiveTickerUpdate >= ACTIVE_TICKER_UPDATE_INTERVAL) {
        const candidates = currentTopHeroes.filter((h) => h !== currentActiveTicker);
        const selectedHero = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : currentTopHeroes[Math.floor(Math.random() * currentTopHeroes.length)];
        window.activeAPI.setActiveTicker(selectedHero);
        currentActiveTicker = selectedHero;
        lastActiveTickerUpdate = now;
        if (debug) console.log(`🔀 Rotated to: ${selectedHero}`);
    }

    if (currentTopHeroes.length > 0) {
        const allBelowThreshold = currentTopHeroes.every((heroName) => {
            const hero = focusState[heroName];
            return hero.hp < maxHP * HP_SCALE_DOWN_THRESHOLD;
        });
        if (allBelowThreshold && maxHP > BASE_MAX_HP) {
            maxHP = Math.max(BASE_MAX_HP, maxHP * HP_SCALE_DOWN_FACTOR);
            needsFullRender = true;
        }
    }

    if (needsFullRender || currentTopHeroes.join(",") !== lastTopHeroes.join(",")) {
        lastTopHeroes = currentTopHeroes;
        renderAll();
        if (window.traderviewAPI?.setTopTickers && Date.now() - lastTickerSetAt > MIN_UPDATE_INTERVAL) {
            const traderviewWindowCount = window.settings?.top?.traderviewWindowCount ?? 3;
            const topForTradingView = currentTopHeroes.slice(0, traderviewWindowCount);
            window.traderviewAPI.setTopTickers(topForTradingView);
            lastTickerSetAt = Date.now();
            if (debug) console.log(`🪞 Updated TradingView windows to:`, topForTradingView);
        }
    } else {
        updateCardDOM(event.hero);
    }

    hero.lastUpdate = Date.now();
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

function getTotalXpToReachLevel(level) {
    if (level <= 1) return 0;
    let totalXp = 0;
    for (let i = 1; i < level; i++) {
        totalXp += i * 1000;
    }
    return totalXp;
}

function getXpProgress(state) {
    const totalXp = state.totalXpGained || 0;
    const lv = Math.max(1, state.lv || 1);

    // Total XP needed to reach the next level
    const xpForNextLevel = getTotalXpToReachLevel(lv + 1);

    // Percentage progress toward next level based on total XP
    const xpPercent = xpForNextLevel > 0 ? Math.min((totalXp / xpForNextLevel) * 100, 100) : 100;

    return { totalXp, xpForNextLevel, xpPercent };
}

function updateCardDOM(hero) {
    if (!hero || !focusState[hero]) {
        console.warn(`Hero "${hero}" not found in focusState`);
        return;
    }

    const topN = window.settings?.top?.focusListLength ?? 10;
    const topHeroes = Object.values(focusState)
        .filter((s) => s.score > 0)
        .sort((a, b) => (b?.score || 0) - (a?.score || 0))
        .slice(0, topN)
        .map((s) => s?.hero)
        .filter(Boolean);

    if (!topHeroes.includes(hero)) return;

    const existing = document.querySelector(`.ticker-card[data-symbol="${hero}"]`);
    if (!existing) return;

    const newCard = renderCard(focusState[hero]);

    // Copy old bar widths onto newCard before inserting
    ["xp", "hp", "strength"].forEach((type) => {
        const oldBar = existing.querySelector(`.bar-fill.${type}`);
        const newBar = newCard.querySelector(`.bar-fill.${type}`);
        if (oldBar && newBar) {
            newBar.style.width = getComputedStyle(oldBar).width;
        }
    });

    // Replace immediately
    existing.replaceWith(newCard);

    // Animate to the new values
    // Animate to the new values
    requestAnimationFrame(() => {
        const state = focusState[hero];
        const strengthCap = state.price < 1.5 ? 800000 : 400000;
        const { xpPercent } = getXpProgress(state);

        // Helper to update + pulse a bar
        function animateBar(selector, newWidth) {
            const bar = newCard.querySelector(selector);
            if (bar) {
                const oldWidth = parseFloat(bar.style.width) || 0;
                const newWidthValue = parseFloat(newWidth);

                // Only pulse if width actually changes meaningfully
                if (Math.abs(oldWidth - newWidthValue) > 1) {
                    bar.classList.add("bar-animate");
                    bar.addEventListener(
                        "animationend",
                        () => {
                            bar.classList.remove("bar-animate");
                        },
                        { once: true }
                    );
                }

                bar.style.width = `${newWidth}`;
            }
        }

        animateBar(".bar-fill.xp", `${xpPercent}%`);
        animateBar(".bar-fill.hp", `${Math.min((state.hp / maxHP) * 100, 100)}%`);
        animateBar(".bar-fill.strength", `${Math.min((state.strength / strengthCap) * 100, 100)}%`);
    });
}

function renderCard({ hero, price, hp, dp, strength, buffs }) {
    const card = document.createElement("div");
    card.className = "ticker-card";
    card.dataset.symbol = hero;

    const state = focusState[hero] || {
        hp: 0,
        dp: 0,
        lastEvent: { hp: 0, dp: 0 },
        score: 0,
        lv: 1,
        totalXpGained: 0,
    };

    const change = state.lastEvent.hp ? `+${state.lastEvent.hp.toFixed(2)}%` : state.lastEvent.dp ? `-${state.lastEvent.dp.toFixed(2)}%` : "";
    const changeClass = state.lastEvent.hp ? "hp-boost" : state.lastEvent.dp ? "dp-damage" : "";

    const row = getSpriteRowFromState(state);
    const yOffset = row * 100;

    const topPosition = 200;
    const strengthCap = price < 1.5 ? 800000 : 400000;

    const volumeImpact = window.hlpsFunctions.calculateImpact(strength, price, window.buffs);

    const { totalXp, xpForNextLevel, xpPercent } = getXpProgress(state);

    // Buffs
    const sortOrder = ["float", "volume", "news", "bio", "weed", "space", "newHigh", "bounceBack", "highShort", "netLoss", "hasS3", "dilutionRisk", "china", "lockedShares"];
    const buffsArray = Object.entries(state.buffs || {}).map(([originalKey, b]) => ({
        ...b,
        key: originalKey,
        _sortKey: originalKey.toLowerCase().includes("vol") ? "volume" : originalKey,
    }));

    const sortBuffs = (arr) =>
        arr.sort((a, b) => {
            const aIndex = sortOrder.indexOf(a._sortKey);
            const bIndex = sortOrder.indexOf(b._sortKey);
            return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        });

    const positiveBuffs = sortBuffs(buffsArray.filter((b) => b.isBuff === true));
    const negativeBuffs = sortBuffs(buffsArray.filter((b) => b.isBuff === false));
    const neutralBuffs = sortBuffs(buffsArray.filter((b) => b.isBuff === undefined));

    const now = Date.now();
    const recentlyUpdated = now - (state.lastUpdate || 0) <= 30000;
    const fadeStyle = recentlyUpdated ? "" : "opacity: 0.5; filter: grayscale(0.4);";

    const buffHtml = `
    <div class="buff-container">
        <div class="buff-row positive">
            ${positiveBuffs.map((buff) => `<span class="buff-icon" title="${buff.desc}">${buff.icon}</span>`).join("")}
        </div>
        <div class="buff-row neutral">
            ${neutralBuffs.map((buff) => `<span class="buff-icon" title="${buff.desc}">${buff.icon}</span>`).join("")}
        </div>
        <div class="buff-row negative">
            ${negativeBuffs.map((buff) => `<span class="buff-icon" title="${buff.desc}">${buff.icon}</span>`).join("")}
        </div>
    </div>
    `;

    card.innerHTML = `
    <div class="ticker-header-grid">
        <div class="ticker-info">
            <div class="ticker-symbol" style="background-color:${getSymbolColor(hero)}; ${fadeStyle}">$${hero}<span class="lv">$${state.price.toFixed(2)}</span></div>
            <div id="change" style="top: 0 + ${topPosition}px;">${change ? `<div class="${changeClass}">${change}</div>` : ""}</div>
            
            <div id="lv"><span class="bar-text stats lv" style="font-size: 6px; margin-top:4px">L <span style="color:white;"> ${state.lv}</span></span></div>
            <div id="x"><span class="bar-text stats x" style="font-size: 6px; margin-top:4px">X <span style="color:#04f370;">  ${totalXp}</span></span></div>
            <div id="ch"><span class="bar-text stats ch" style="font-size: 6px; margin-top:4px">C <span style="color:#fd5151;"> ${hp.toFixed(0)}%</span></span></div>
            <div id="vo"><span class="bar-text stats" style=" font-size: 6px; margin-top:4px">V <span style="color:${volumeImpact.style.color};">  ${abbreviatedValues(strength)}</span></span></div>
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
                <span class="bar-text">CHANGE: ${hp.toFixed(0)}%</span>
            </div>
        </div>
        <div class="bar">
            <div class="bar-fill " style="background-color: ${volumeImpact.style.color}; width: ${Math.min((strength / strengthCap) * 100, 100)}%">
                <span class="bar-text">VOLUME: ${Math.floor(strength / 1000)}k</span>
            </div>
        </div>
    </div>
    `;

    // <div id="score"><span class="bar-text score" style="font-size: 6px; margin-top:4px">SCORE: ${state.score.toFixed(0)}</span></div>

    // Add click handler to the symbol element
    const symbolElement = card.querySelector(".ticker-symbol");
    symbolElement.onclick = (e) => {
        e.stopPropagation();
        try {
            navigator.clipboard.writeText(hero);
            console.log(`📋 Copied ${hero} to clipboard`);
            if (window.activeAPI && window.activeAPI.setActiveTicker) {
                window.activeAPI.setActiveTicker(hero);
                console.log(`🎯 Set ${hero} as active ticker`);
            }
            lastClickedSymbol = hero;
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

////////////////////////////////////////////////////// Calculations
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
    if (debug && debugSamples < debugLimitSamples) console.log(`📜 LV: ${hero.lv || 0} | Price: ${hero.price} | Score: ${currentScore.toFixed(2)} | HP: ${hero.hp || 0} | DP: ${hero.dp || 0}`);
    if (debug && debugSamples < debugLimitSamples) console.log("━ ".repeat(25));

    let baseScore = 0;
    const logStep = (emoji, message, value) => console.log(`${emoji} ${message.padEnd(30)} ${(Number(value) || 0).toFixed(2)}`);

    try {
        // If it's an "up" event (hp > 0)
        if (event.hp > 0 && isSurging(hero, { slice: 5, minUps: 2 })) {
            baseScore += event.hp * 10;
            if (debug && debugSamples < debugLimitSamples) logStep("💖", "Base HP Added", baseScore);

            // 💪 Add bonus score per level (100 points per level) only if surging

            // 🧠 Evaluate surge once
            const surging = isSurging(hero);

            if (surging) {
                // 💪 Base level boost
                const level = hero.lv || 1;
                const levelBoost = level * 100;
                baseScore += levelBoost;

                if (debug && debugSamples < debugLimitSamples) {
                    logStep("⚡", `Surge Detected! Level Boost (LV ${level})`, levelBoost);
                }

                // 🧪 Rookie tier bonus (amplify surge for LV 1–3)
                if (level <= 3) {
                    const tierBoostMultiplier = 1.5 - (level - 1) * 0.1;
                    const boostedScore = baseScore * tierBoostMultiplier;

                    if (debug && debugSamples < debugLimitSamples) {
                        logStep("🧪", `Tier Surge Bonus (x${tierBoostMultiplier.toFixed(2)})`, boostedScore - baseScore);
                    }

                    baseScore = boostedScore;
                }
            } else if (debug && debugSamples < debugLimitSamples) {
                logStep("💤", "No surge — Level Boost skipped", 0);
            }

            // Apply Float score
            // const floatBuff = getHeroBuff(hero, "float");
            // const floatScore = floatBuff?.score ?? 0;
            // baseScore += floatScore;

            // if (debug && debugSamples < debugLimitSamples) {
            //     const label = floatBuff?.key === "floatCorrupt" ? "🧨" : "🏷️";
            //     const formattedFloat = abbreviatedValues(hero.floatValue) || "N/A";
            //     logStep(label, `Float Score (${formattedFloat})`, floatScore);
            // }

            // Apply Volume score from precomputed buff
            const volumeBuff = getHeroBuff(hero, "volume");
            const volScore = volumeBuff?.score ?? 0;
            baseScore += volScore;

            if (debug && debugSamples < debugLimitSamples) {
                const volUsed = event.strength || 0;
                const volMsg = volumeBuff?.message ?? `No volume buff (${abbreviatedValues(volUsed)})`;
                logStep("📢", volMsg, volScore);
            }
            // Clamp total baseScore to positive only (no negative scoring on "up" events)
            baseScore = Math.max(0, baseScore);
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

function getHeroBuff(hero, key) {
    return hero?.buffs?.[key] ?? {};
}

function getFloatScore(floatValue) {
    if (!floatValue || !Number.isFinite(floatValue)) return 1;

    const floatBuff = window.buffs
        .filter((b) => b.key?.startsWith("float") && "threshold" in b)
        .sort((a, b) => a.threshold - b.threshold)
        .find((b) => floatValue < b.threshold);

    return floatBuff?.score ?? 0;
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

function isSurging(hero, { slice = 4, minUps = 3, direction = "hp" } = {}) {
    if (!hero?.history?.length) return false;

    const recent = hero.history.slice(-slice);
    const active = recent.filter((e) => e[direction] > 0);

    return active.length >= minUps;
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

////////////////////////////////////// State
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

async function loadState() {
    if (freshStart) {
        console.log("🧪 loadState() overridden for testing — skipping restore");
        return false;
    }

    const saved = localStorage.getItem("focusState");
    if (!saved) return false;

    try {
        const parsed = JSON.parse(saved);
        const today = getMarketDateString();

        if (parsed.date === today) {
            if (debug) console.log("🔄 Restored focus state from earlier session.");
            return parsed.state;
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
