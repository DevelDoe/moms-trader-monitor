const focusState = {};
let container;

const symbolColors = {};

let maxXP = 100;
let maxHP = 100;

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ DOMContentLoaded event fired!");

    container = document.body;

    // 1. Get symbols from preload store
    const storeSymbols = await window.focusAPI.getSymbols();

    // window.sessionAPI.onTickerUpdate(async () => {
    //     console.log("🔔 Lists update received, fetching latest data...");
    //     storeSymbols = await window.focusAPI.getSymbols();
    // });

    // window.sessionAPI.onNewsUpdate(async ({ ticker, newsItems }) => {
    //     console.log(`📰 Received ${newsItems.length} new articles for ${ticker}`);
    //     storeSymbols = await window.focusAPI.getSymbols();
    // });

    // 2. Create initial focus state
    storeSymbols.forEach((symbolData) => {
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
            
        };
    });

    renderAll();

    // 3. Listen for incoming alerts
    window.focusAPI.onFocusEvents((events) => {
        events.forEach(updateFocusStateFromEvent);
    });
});

function updateFocusStateFromEvent(event) {
    console.log("Received event:", event);
    const hero = focusState[event.hero];
    if (!hero) return;
    console.log("Focus state for hero:", hero);

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
        renderAll();  // Re-render all cards if global limits have been exceeded
    } else {
        updateCardDOM(event.hero);  // Pass hero to update specific card
    }
}


function calculateXp(xp) {
    return xp
}

const buffs = [
    { key: "veryLowVol", icon: "💀", desc: "Very Low Volume (less than 80k last 5min)", modifier: -20, veryLowVol: false },
    { key: "lowVol", icon: "💤", desc: "Low Volume (80k to 120k last 5min)", modifier: -10, lowVol: false },
    { key: "mediumVol", icon: "🚛", desc: "Medium Volume (120k to 240k last 5min)", modifier: 0, mediumVol: false },
    { key: "highVol", icon: "🔥", desc: "High Volume (more than 240k last 5min)", modifier: 20, highVol: false },

    { key: "float1m", icon: "1️⃣", desc: "Float around 1M", modifier: 20, float1m: false },
    { key: "float5m", icon: "5️⃣", desc: "Float around 5M", modifier: 10, float5m: false },
    { key: "float10m", icon: "🔟", desc: "Float around 10M", modifier: 0, float10m: false },

    { key: "lockedShares", icon: "💼", desc: "High insider/institutional/locked shares holders", modifier: 10, lockedShares: false },

    { key: "hasNews", icon: "😼", desc: "Has news", modifier: 15, hasNews: false },
    { key: "newHigh", icon: "📈", desc: "New high", modifier: 10, newHigh: false },
    { key: "bounceBack", icon: "🔁", desc: "Recovering — stock is bouncing back after a downtrend", modifier: 5, bounceBack: false },

    { key: "bio", icon: "🧬", desc: "Biotechnology stock", modifier: 5, bio: false },
    { key: "weed", icon: "🌿", desc: "Cannabis stock", modifier: 5, weed: false },
    { key: "space", icon: "🌌", desc: "Space industry stock", modifier: 5, space: false },
    { key: "china", icon: "🇨🇳/🇭🇰", desc: "China/Hong Kong-based company", modifier: -5, china: false },

    { key: "highShort", icon: "🩳", desc: "High short interest (more than 20% of float)", modifier: 10, highShort: false },
    { key: "netLoss", icon: "🥅", desc: "Company is currently running at a net loss", modifier: -5, netLoss: false },
    { key: "hasS3", icon: "📂", desc: "Registered S-3 filing", modifier: -10, hasS3: false },
    { key: "dilutionRisk", icon: "🚨", desc: "High dilution risk: Net loss + Registered S-3", modifier: -20, dilutionRisk: false },
];


function renderAll() {
    console.log("Rendering all cards...");

    // Clear previous content
    container.innerHTML = "";

    // Ensure focusState has the necessary data
    console.log("Focus state:", focusState);

    // Render all cards
    Object.values(focusState).forEach((symbolData) => {
        const card = renderCard(symbolData);
        console.log("Rendering card:", card); // Log to confirm card creation
        container.appendChild(card);
    });
}


function updateCardDOM(hero) {
    console.log("Updating card for hero:", hero);
    const s = focusState[hero];
    if (!s) return;

    console.log("focusState for hero:", s);

    const oldCard = document.querySelector(`.ticker-card[data-symbol="${hero}"]`);
    if (oldCard) {
        oldCard.replaceWith(renderCard(s));
    } else {
        container.appendChild(renderCard(s));
    }
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

    console.log("Rendering card with state:", state);

    const change = state.lastEvent.hp ? `+${state.lastEvent.hp.toFixed(2)}%` : state.lastEvent.dp ? `-${state.lastEvent.dp.toFixed(2)}%` : "";
    const changeClass = state.lastEvent.hp ? "hp-boost" : state.lastEvent.dp ? "dp-damage" : "";
    const row = getSpriteRowFromState(state);
    const yOffset = row * 100;

    card.innerHTML = `
    <div class="sprite" style="background-position: 0 -${yOffset}px;"></div>
    <div class="ticker-info">
        <div class="ticker-symbol" style="color:${getSymbolColor(hero)}">$${hero}</div>
        <div class="ticker-price">
            $<span class="price">${price.toFixed(2)}</span>
            ${change ? `<span class="${changeClass}">${change}</span>` : ""}
        </div>
        <div class="bars">
            <div class="bar">
                <div class="bar-fill xp" style="width: ${Math.min((state.xp / maxXP) * 100, 100)}%">
                    <span class="bar-text">XP: ${state.xp.toFixed(0)}</span>
                </div>
            </div>
            <div class="bar">
                <div class="bar-fill hp" style="width: ${Math.min((state.hp / maxHP) * 100, 100)}%">
                    <span class="bar-text">HP: ${state.hp.toFixed(0)}</span>
                </div>
            </div>
            <div class="bar">
                <div class="bar-fill strength" style="width: ${Math.min(strength / 5000, 100)}%">
                    <span class="bar-text">VOLUME: ${Math.floor(strength / 1000)}k</span>
                </div>
            </div>
        </div>
    </div>`;

    return card;
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

function getSpriteRowFromState({ hp, strength, lastEvent }) {
    if (hp <= 0) return 6; // Die
    if (lastEvent.dp > 0) return 5; // Taking damage
    if (lastEvent.hp > 0) return 2 + Math.floor(Math.random() * 3); // Random attack (2, 3, or 4)
    if (strength >= 200000) return 1; // Running
    return 0; // Idle
}