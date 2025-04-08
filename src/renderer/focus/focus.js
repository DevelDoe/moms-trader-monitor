const DECAY_INTERVAL_MS = 6000; 
const TOTAL_DECAY_DURATION = 450_000; 
const XP_DECAY_PER_TICK = 880 / (TOTAL_DECAY_DURATION / DECAY_INTERVAL_MS); 

const focusState = {};
let container;

const symbolColors = {};

let maxXP = 100;
let maxHP = 300;

let lastTopHeroes = [];

isLongBiased = true;

let eventsPaused = false;

window.pauseEvents = () => {
    eventsPaused = true;
    console.log("Events are now paused");
};

window.resumeEvents = () => {
    eventsPaused = false;
    console.log("Events are now resumed");
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
                console.log("🧼 Overwriting old session from", parsed.date);
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
    console.log("💾 Saved focus state:", sessionDate);
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
            console.log("🔄 Restored focus state from earlier session.");
            return true;
        } else {
            console.log("🧼 Session from previous day. Skipping restore.");
            localStorage.removeItem("focusState");
            return false;
        }
    } catch (err) {
        console.warn("⚠️ Could not parse focus state. Clearing.");
        localStorage.removeItem("focusState");
        return false;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ DOMContentLoaded event fired!");

    const restored = loadState(); // ✅ returns true if valid state loadedloadState();

    console.log();

    container = document.getElementById("focus"); // Focus div is where the cards will be injected

    // 1. Get symbols from preload store
    const storeSymbols = await window.focusAPI.getSymbols();
    window.settings = await window.settingsAPI.get();

    // ✅ Listen for settings updates globally
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);
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
                buffs,
            };
        });
    }

    renderAll();

    // 3. Listen for incoming alerts
    window.focusAPI.onFocusEvents((events) => {
        events.forEach(updateFocusStateFromEvent);
        // console.log("⚡ Received focus events:", events);
        // console.log("Hero:", events[0].hero);
        // console.log("Price:", events[0].price);
        // console.log("HP:", events[0].hp);
        // console.log("DP:", events[0].dp);
        // console.log("Strength:", events[0].strength);
    });

    startScoreDecay();
});

function updateFocusStateFromEvent(event) {
    if (eventsPaused) return; // Skip event processing if paused

    let hero = focusState[event.hero];

    const wasDead = hero.hp === 0 && event.hp > 0;
    if (wasDead) {
        hero.score += 50; // ⚡ Give a comeback boost
    }

    hero.price = event.price;

    // 🧠 Apply alert changes
    if (event.hp > 0) hero.hp += event.hp;
    if (event.dp > 0) hero.hp = Math.max(hero.hp - event.dp, 0);

    // 🧠 Update event log
    hero.lastEvent = {
        hp: event.hp || 0,
        dp: event.dp || 0,
        xp: 0,
    };

    // 🎯 Modularized scoring
    const delta = calculateScore(hero, event);
    hero.score = Math.max(0, hero.score + delta);

    hero.lastEvent = {
        hp: event.hp || 0,
        dp: event.dp || 0,
        xp: 0, // you can keep or remove this if unused
    };

    hero.strength = event.strength;

    calculateXp(hero);

    let needsFullRender = false;
    if (hero.hp > maxHP) {
        maxHP = hero.hp;
        needsFullRender = true;
    }

    if (hero.xp > maxXP) {
        maxXP = hero.xp;
        needsFullRender = true;
    }

    const topN = window.settings?.top?.focusListLength ?? 10;
    const currentTopHeroes = Object.values(focusState)
        .filter((s) => s.score > 100)
        .sort((a, b) => b.lv - a.lv || b.score - a.score)
        .slice(0, topN)
        .map((s) => s.hero);

    // If layout changed or full render required, redraw everything
    if (needsFullRender || currentTopHeroes.join(",") !== lastTopHeroes.join(",")) {
        lastTopHeroes = currentTopHeroes;
        renderAll();
    } else {
        updateCardDOM(event.hero);
    }
    saveState();
}

// ⛏️ Render all cards
function renderAll() {
    container.innerHTML = "";

    Object.values(focusState)
        .filter((s) => s.score > 100)
        .sort((a, b) => b.lv - a.lv || b.score - a.score)
        .slice(0, window.settings?.top?.focusListLength ?? 3)
        .forEach((data) => {
            const card = renderCard(data);
            container.appendChild(card); // ✅ Append created card
        });

    // ✅ After rendering all top heroes, remove any zombie cards
    const topSymbols = Object.values(focusState)
        .filter((s) => s.score > 100)
        .sort((a, b) => b.lv - a.lv || b.score - a.score)
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

// 🎯 Update just one card's values in the DOM
function updateCardDOM(hero) {
    // Do nothing if not in the top list
    const topN = window.settings?.top?.focusListLength ?? 10;
    const topHeroes = Object.values(focusState)
        .filter((s) => s.score > 100)
        .sort((a, b) => b.lv - a.lv || b.score - a.score)
        .slice(0, topN)
        .map((s) => s.hero);

    if (!topHeroes.includes(hero)) return;

    // Only update the DOM *visually*, not with full append
    const existing = document.querySelector(`.ticker-card[data-symbol="${hero}"]`);
    if (!existing) return;

    const newCard = renderCard(focusState[hero]);
    existing.replaceWith(newCard);
}

// 🔁 Create a ticker card and bind it to DOM
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

    // const showSprite = state.lastEvent.hp > 0 || state.lastEvent.dp > 0;
    // const spriteClass = showSprite ? "sprite sprite-active" : "sprite";

    const topPosition = 100;

    const requiredXp = (state.lv + 1) * 100;
    const xpProgress = Math.min((state.xp / requiredXp) * 100, 100);

    const strengthCap = price < 1.5 ? 800000 : 400000;

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
                $<span class="price">${price.toFixed(2)}</span>
            </div>
            ${change ? `<div class="${changeClass}" style="top: 0 + ${topPosition}px;">${change}</div>` : ""}
            <div id="score"><span class="bar-text">SCORE: ${state.score.toFixed(0)}</span></div>
        </div>
    </div>
    <div class="bars">
        <div class="bar">
            <div class="bar-fill xp" style="width: ${xpProgress}%">
                <span class="bar-text">XP: ${Math.floor(state.xp)} / ${requiredXp}</span>
            </div>
        </div>
        <div class="bar">
            <div class="bar-fill hp" style="width: ${Math.min((state.hp / maxHP) * 100, 100)}%">
                <span class="bar-text">CHANGE: ${state.hp.toFixed(0)}</span>
            </div>
        </div>
        <div class="bar">
            <div class="bar-fill strength" style="width: ${Math.min((strength / strengthCap) * 100, 100)}%">
    <span class="bar-text">VOLUME: ${Math.floor(strength / 1000)}k</span>
</div>
        </div>
    </div>
    `;

    const spriteEl = card.querySelector(".sprite");
    if (state.lastEvent.hp > 0 || state.lastEvent.dp > 0) {
        spriteEl.classList.add("sprite-active");
        setTimeout(() => {
            spriteEl.classList.remove("sprite-active");
        }, 900); // ⏱️ Match animation length
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

function applyMultiplier(score, multiplier) {
    return score * multiplier;
}

function adjustMultiplier(multiplier) {
    return Math.max(0.01, Math.min(multiplier, 3)); // Limit to 3x max multiplier
}

function calculateScore(hero, event, floatValue = hero.float || 0) {
    let baseScore = 0;

    // 🧠 Apply alert changes
    if (event.hp > 0) {
        baseScore += 100 + event.hp * 10;

        // Boost if it's a new ticker or if it just reversed
        if (hero.hp === 0) {
            // Initial boost for first-time positive events
            baseScore += 50; // Boost can be adjusted as needed
        } else if (hero.lastEvent.dp > 0 && event.hp > 0) {
            // Additional boost if it's a reversal after damage (down followed by up)
            baseScore += 20;
        }

        // Apply float and volume multipliers
        baseScore = applyFloatMultiplier(baseScore, floatValue);
        baseScore = applyVolumeMultiplier(baseScore, event.strength || 0, event.price || hero.price || 1);
    }

    if (event.dp > 0) {
        baseScore -= event.dp;
    }

    return Math.max(0, baseScore);
}

function applyVolumeMultiplier(score, volume, price = 1, isLongBiased = true) {
    let multiplier = 1;

    const isPenny = price < 1.5;

    // Adjust thresholds for penny stocks
    if (isPenny) {
        if (volume < 60_000) {
            multiplier = adjustMultiplier(0.01);
        } else if (volume < 240_000) {
            multiplier = adjustMultiplier(0.8);
        } else if (volume < 500_000) {
            multiplier = adjustMultiplier(1);
        } else {
            multiplier = adjustMultiplier(1.25);
        }
    } else {
        if (volume < 30_000) {
            multiplier = adjustMultiplier(0.01);
        } else if (volume < 120_000) {
            multiplier = adjustMultiplier(0.8);
        } else if (volume < 240_000) {
            multiplier = adjustMultiplier(1);
        } else {
            multiplier = adjustMultiplier(1.25);
        }
    }

    return applyMultiplier(score, multiplier);
}

function applyFloatMultiplier(score, floatValue) {
    const floatOneMillionHigh = 1_200_000;
    const floatFiveMillion = 5_000_000;
    const floatTenMillion = 10_000_000;
    const floatFiftyMillion = 50_000_000;
    const floatHundredMillion = 100_000_000;
    const floatTwoHundredMillion = 200_000_000;
    const floatFiveHundredMillion = 500_000_000;

    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        return applyMultiplier(score, adjustMultiplier(1.25));
    } else if (floatValue < floatFiveMillion) {
        return applyMultiplier(score, adjustMultiplier(1.15));
    } else if (floatValue < floatTenMillion) {
        return applyMultiplier(score, adjustMultiplier(1.05));
    } else if (floatValue < floatHundredMillion) {
        return applyMultiplier(score, adjustMultiplier(0.8));
    } else if (floatValue < floatTwoHundredMillion) {
        return applyMultiplier(score, adjustMultiplier(0.6));
    } else if (floatValue < floatFiveHundredMillion) {
        return applyMultiplier(score, adjustMultiplier(0.4));
    } else {
        return applyMultiplier(score, adjustMultiplier(0.1));
    }
}

function calculateXp(hero) {
    hero.xp += hero.lastEvent.hp || 0; // Only gain XP from HP events

    const requiredXp = (hero.lv + 1) * 100;

    while (hero.xp >= requiredXp) {
        hero.xp -= requiredXp;
        hero.lv += 1;

        // 🪄 Optional: Trigger "Level Up!" animation
        console.log(`✨ ${hero.hero} leveled up to LV ${hero.lv}!`);
    }
}

function startScoreDecay() {
    setInterval(() => {
        let changed = false;

        Object.values(focusState).forEach((hero) => {
            if (hero.score > 0) {
                const newScore = Math.max(0, hero.score - XP_DECAY_PER_TICK);
                if (hero.score !== newScore) {
                    hero.score = newScore;

                    // 🚫 Clear change indicators to prevent animation from triggering on decay
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

const buffs = [
    { key: "veryLowVol", icon: "💀", desc: "Very Low Volume (less than 80k last 5min)", modifier: -20 },
    { key: "lowVol", icon: "💤", desc: "Low Volume (80k to 120k last 5min)", modifier: -10 },
    { key: "mediumVol", icon: "🚛", desc: "Medium Volume (120k to 240k last 5min)", modifier: 0 },
    { key: "highVol", icon: "🔥", desc: "High Volume (more than 240k last 5min)", modifier: 20 },

    { key: "float1m", icon: "1️⃣", desc: "Float around 1M", modifier: 20 },
    { key: "float5m", icon: "5️⃣", desc: "Float around 5M", modifier: 10 },
    { key: "float10m", icon: "🔟", desc: "Float around 10M", modifier: 0 },

    { key: "lockedShares", icon: "💼", desc: "High insider/institutional/locked shares holders", modifier: 10 },

    { key: "hasNews", icon: "😼", desc: "Has news", modifier: 15 },
    { key: "newHigh", icon: "📈", desc: "New high", modifier: 10 },
    { key: "bounceBack", icon: "🔁", desc: "Recovering — stock is bouncing back after a downtrend", modifier: 5 },

    { key: "bio", icon: "🧬", desc: "Biotechnology stock", modifier: 5 },
    { key: "weed", icon: "🌿", desc: "Cannabis stock", modifier: 5 },
    { key: "space", icon: "🌌", desc: "Space industry stock", modifier: 5 },
    { key: "china", icon: "🇨🇳/🇭🇰", desc: "China/Hong Kong-based company", modifier: -5 },

    { key: "highShort", icon: "🩳", desc: "High short interest (more than 20% of float)", modifier: 10 },
    { key: "netLoss", icon: "🥅", desc: "Company is currently running at a net loss", modifier: -5 },
    { key: "hasS3", icon: "📂", desc: "Registered S-3 filing", modifier: -10 },
    { key: "dilutionRisk", icon: "🚨", desc: "High dilution risk: Net loss + Registered S-3", modifier: -20 },
];
