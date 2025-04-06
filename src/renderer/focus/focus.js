const focusState = {};
let container;

const symbolColors = {};

let maxXP = 300;
let maxHP = 300;



document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ DOMContentLoaded event fired!");

    container = document.getElementById("focus"); // Focus div is where the cards will be injected

    // 1. Get symbols from preload store
    const storeSymbols = await window.focusAPI.getSymbols();
    window.settings = await window.settingsAPI.get();

    // ✅ Listen for settings updates globally
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);

        // ✅ Sync new settings globally
        window.settings = updatedSettings;
        renderAll();
    });

    // 2. Create initial focus state
    storeSymbols.forEach((symbolData) => {
        // Changed parameter name from 's' to 'symbolData'
        focusState[symbolData.symbol] = {
            hero: symbolData.symbol,
            price: symbolData.price || 1,
            hp: 0,
            dp: 0,
            strength: 0,
            xp: 0,
            lastEvent: {
                hp: 0,
                dp: 0,
                xp: 0,
            },
            buffs,
        };
    });

    renderAll();

    // 3. Listen for incoming alerts
    window.focusAPI.onFocusEvents((events) => {
        events.forEach(updateFocusStateFromEvent);
    });
});

function updateFocusStateFromEvent(event) {
    if (eventsPaused) return; // Skip event processing if paused

    const hero = focusState[event.hero]; // Use 'hero' instead of 'symbol'
    if (!hero) return;

    hero.price = event.price;
    hero.lastEvent = { hp: 0, dp: 0, xp: 0 };

    if (event.hp > 0) {
        hero.hp += event.hp;
        hero.xp = hero.hp; // For now, XP = HP
        hero.lastEvent.hp = event.hp;
    }

    if (event.dp > 0) {
        hero.hp = Math.max(hero.hp - event.dp, 0);
        hero.xp = hero.hp; // XP follows HP here too
        hero.lastEvent.dp = event.dp;
    }

    hero.strength = event.strength;

    // Check for XP and HP updates and trigger re-render if necessary
    calculateXp(hero.xp);

    let needsFullRender = false;
    if (hero.hp > maxHP) {
        maxHP = hero.hp;
        needsFullRender = true;
    }

    if (hero.xp > maxXP) {
        maxXP = hero.xp;
        needsFullRender = true;
    }

    if (needsFullRender) {
        renderAll(); // Re-render all cards if global limits have been exceeded
    } else {
        updateCardDOM(event.hero); // Use hero instead of symbol
    }
}

function calculateXp(xp) {
    return xp;
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

// ⛏️ Render all cards
function renderAll() {
    container.innerHTML = "";

    Object.values(focusState)
        .sort((a, b) => b.xp - a.xp) // ⬅️ Sort descending by XP
        .slice(0, window.settings?.top?.focusListLength ?? 1) // ✅ Limit by setting or fallback to 10
        .forEach(renderCard); // ✅ Don't forget to actually render!
}

// 🎯 Update just one card's values in the DOM
function updateCardDOM(hero) {
    const s = focusState[hero];
    if (!s) return;

    const topN = window.settings?.top?.focusListLength ?? 10;

    // ✂️ If this symbol isn't in the current top N XP list, skip update
    const topHeroes = Object.values(focusState)
        .sort((a, b) => b.xp - a.xp)
        .slice(0, topN)
        .map(s => s.hero);

    if (!topHeroes.includes(hero)) {
        // If it's outside the top list, remove it if it exists
        const existing = document.querySelector(`.ticker-card[data-symbol="${hero}"]`);
        if (existing) existing.remove();
        return;
    }

    const oldCard = document.querySelector(`.ticker-card[data-symbol="${hero}"]`);
    if (oldCard) {
        oldCard.replaceWith(renderCard(s));
    } else {
        container.appendChild(renderCard(s));
    }
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

    const topPosition = 100; // Change this value dynamically based on your needs (e.g., based on the card's position)

    card.innerHTML = `

    <div class="ticker-header">
        <!-- Sprite and Change -->
        <div class="sprite-container">
            <div class="sprite" style="background-position: 0 -${yOffset}px;"></div>
        </div>
        <div class="ticker-info">
            <div class="ticker-symbol" style="background-color:${getSymbolColor(hero)}">$${hero}</div>
            <div class="ticker-price">
                $<span class="price">${price.toFixed(2)}</span>
                
            </div>
            ${change ? `<div class="${changeClass}" style="top: 0 + ${topPosition}px;">${change}</div>` : ""}
        </div>
    </div>
    <div class="bars">
        <div class="bar">
            <div class="bar-fill xp" style="width: ${Math.min((state.xp / maxXP) * 100, 100)}%">
                <span class="bar-text">SCORE: ${state.xp.toFixed(0)}</span>
            </div>
        </div>
        <div class="bar">
            <div class="bar-fill hp" style="width: ${Math.min((state.hp / maxHP) * 100, 100)}%">
                <span class="bar-text">CHANGE: ${state.hp.toFixed(0)}</span>
            </div>
        </div>
        <div class="bar">
            <div class="bar-fill strength" style="width: ${Math.min(strength / 5000, 100)}%">
                <span class="bar-text">VOLUME: ${Math.floor(strength / 1000)}k</span>
            </div>
        </div>
    </div>

    `;
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



let eventsPaused = false;

// Attach to the global window object
window.pauseEvents = () => {
    eventsPaused = true;
    console.log("Events are now paused");
};

window.resumeEvents = () => {
    eventsPaused = false;
    console.log("Events are now resumed");
};