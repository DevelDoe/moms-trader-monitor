const DECAY_INTERVAL_MS = 6000;
const XP_DECAY_PER_TICK = 0.2; // Base decay per tick (you might lower this for longer duration)
const SCORE_NORMALIZATION = 5; // Increase this value to reduce the impact of score on decay

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

let eventsPaused = false;

const { isDev } = window.appFlags;

const freshStart = isDev;
const debug = isDev;
const debugScoreCalc = isDev;

console.log("🎯 Fresh start mode:", freshStart);
console.log("🐛 Debug mode:", debug);

const debugLimitSamples = 1500;
let debugSamples = 0;

let buffs = [];

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Hero window loaded");

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

    container = document.getElementById("focus");

    try {
        // Load settings and symbols in parallel
        const [settings, storeSymbols, restored] = await Promise.all([
            window.settingsAPI.get(),
            window.focusAPI.getSymbols(),
            loadState(), // Make loadState async (see below)
        ]);

        window.settings = settings;
        if (debug) console.log("Loaded settings: ", window.settings);

        // Initialize focus state (only if not restored)
        if (!restored) {
            storeSymbols.forEach((symbolData) => {
                // Skip if already exists (just in case)
                if (!focusState[symbolData.symbol]) {
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
                        floatValue: symbolData.statistics?.floatShares || 0, // Added optional chaining
                        buffs: getBuffsForHero(symbolData),
                        highestPrice: symbolData.price || 1,
                    };
                }
            });
        }

        // Set up event listeners AFTER initialization
        window.settingsAPI.onUpdate(async (updatedSettings) => {
            if (debug) console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);
            window.settings = updatedSettings;
            renderAll();
        });

        window.focusAPI.onFocusEvents((events) => {
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

        renderAll();
        startScoreDecay();
    } catch (error) {
        console.error("Initialization failed:", error);
        // Fallback or error handling here
    }
});

function getBuffsForHero(symbolData) {
    const buffs = {};

    const floatBuff = getFloatBuff(symbolData);
    if (floatBuff) buffs.float = floatBuff;

    const newsBuff = getNewsBuff(symbolData);
    if (newsBuff) buffs.news = newsBuff;

    const ownershipBuff = getOwnershipBuff(symbolData);
    if (ownershipBuff) buffs.ownership = ownershipBuff;

    const industryBuff = getIndustryBuff(symbolData);
    if (industryBuff) buffs.industry = industryBuff;

    const countryBuff = getCountryBuff(symbolData);
    if (countryBuff) buffs.country = countryBuff;

    const shortBuff = getShortInterestBuff(symbolData);
    if (shortBuff) buffs.highShort = shortBuff;

    const netLossBuff = getNetLossBuff(symbolData);
    if (netLossBuff) buffs.netLoss = netLossBuff;

    const s3Buff = getS3FilingBuff(symbolData);
    if (s3Buff) buffs.hasS3 = s3Buff;

    const dilutionBuff = getDilutionRiskBuff(symbolData);
    if (dilutionBuff) buffs.dilutionRisk = dilutionBuff;

    return buffs;
}

function getFloatBuff(symbolData) {
    const float = symbolData.statistics?.floatShares;
    const shares = symbolData.statistics?.sharesOutstanding;

    const isCorrupt = !float || !shares || float <= 0 || shares <= 0 || float > 1e9 || shares > 5e9 || float / shares > 1.2 || float / shares < 0.01;

    if (isCorrupt) {
        return {
            key: "floatCorrupt",
            icon: "⚠️",
            desc: "Corrupted float data",
            multiplier: 1,
            score: 0,
            isBuff: false,
        };
    }

    const floatBuffs = (window.buffs || [])
        .filter((b) => b.key?.startsWith("float") && b.threshold != null)
        .map((b) => ({
            ...b,
            threshold: Number(b.threshold),
        }))
        .filter((b) => !isNaN(b.threshold))
        .sort((a, b) => a.threshold - b.threshold);

    const selected = floatBuffs.find((b) => float < b.threshold);

    return selected
        ? {
              key: selected.key,
              icon: selected.icon,
              desc: selected.desc,
              multiplier: selected.multiplier,
              score: selected.score,
              isBuff: selected.isBuff ?? selected.score >= 0,
          }
        : {
              key: "floatUnranked",
              icon: "❔",
              desc: "Float does not match any buff",
              multiplier: 1,
              score: 0,
              isBuff: false,
          };
}

function getNewsBuff(symbolData) {
    const blockList = window.settings?.news?.blockList || [];
    const news = symbolData.News || [];

    if (!Array.isArray(news) || news.length === 0) return null;

    const hasGoodNews = news.some((item) => {
        const headline = sanitize(item.headline || "");
        return !blockList.some((b) => headline.includes(sanitize(b)));
    });

    if (!hasGoodNews) return null;

    return {
        key: "news",
        icon: "😼",
        desc: "Has positive/unblocked news",
        score: 150, // Up to you if you want to affect score
        multiplier: 1.1, // Optional if you plan on scoring via buffs
        isBuff: true,
    };
}

function getOwnershipBuff(symbolData) {
    const stats = symbolData.statistics || {};
    const ownership = symbolData.ownership || {};

    const floatShares = stats.floatShares || 0;
    const sharesOutstanding = stats.sharesOutstanding || 0;
    const insidersPercentHeld = ownership.insidersPercentHeld || 0;
    const institutionsPercentHeld = ownership.institutionsPercentHeld || 0;

    if (!sharesOutstanding) return null;

    const insiderShares = Math.round(sharesOutstanding * insidersPercentHeld);
    const institutionalShares = Math.round(sharesOutstanding * institutionsPercentHeld);
    const remainingShares = Math.max(sharesOutstanding - (floatShares + insiderShares + institutionalShares), 0);

    const totalHeld = insiderShares + institutionalShares + remainingShares;

    if (totalHeld > 0.5 * sharesOutstanding) {
        // Load matching buff from global list by key to retain proper flags
        const defined = (window.buffsArray || []).find((b) => b.key === "lockedShares");
        return (
            defined || {
                key: "lockedShares",
                icon: "💼",
                desc: "High insider/institutional/locked shares holders",
                score: 10,
                isBuff: false, // explicitly false
            }
        );
    }

    return null;
}

function getNewHighBuff(hero) {
    const price = hero.price ?? 0;
    const highest = hero.highestPrice ?? 0;

    if (price > highest) {
        return {
            key: "newHigh",
            icon: "📈",
            desc: "New high",
            score: 10,
            isBuff: true,
        };
    }

    return null;
}

function getIndustryBuff(symbolData) {
    const profile = symbolData.profile || {};
    const summary = profile.longBusinessSummary?.toLowerCase() || "";
    const companyName = profile.companyName?.toLowerCase() || "";
    const industry = profile.industry || "";

    if (industry === "Biotechnology" || summary.includes("biotech") || summary.includes("biotechnology") || companyName.includes("biopharma")) {
        return {
            key: "bio",
            icon: "🧬",
            desc: "Biotechnology stock",
            score: 5,
            isBuff: true,
        };
    }

    if (summary.includes("cannabis")) {
        return {
            key: "weed",
            icon: "🌿",
            desc: "Cannabis stock",
            score: 5,
            isBuff: true,
        };
    }

    if (summary.includes("space")) {
        return {
            key: "space",
            icon: "🌌",
            desc: "Space industry stock",
            score: 5,
            isBuff: true,
        };
    }

    return null;
}

function getBounceBackBuff(hero, event) {
    if (hero.lastEvent.dp > 0 && event.hp > 0) {
        return {
            key: "bounceBack",
            icon: "🔁",
            desc: "Recovering — stock is bouncing back after a downtrend",
            score: 5,
            isBuff: true,
        };
    }
    return null;
}

function getCountryBuff(symbolData) {
    const country = symbolData.profile?.country?.toLowerCase();

    if (country === "china" || country === "cn" || country === "hk" || country === "hong kong") {
        return {
            key: "china",
            icon: "🇨🇳",
            desc: "China/Hong Kong-based company",
            score: 0,
            isBuff: false,
        };
    }

    return null;
}

function getNetLossBuff(symbolData) {
    const netIncome = symbolData.financials?.cashflowStatement?.netIncome;

    if (typeof netIncome === "number" && netIncome < 0) {
        return {
            key: "netLoss",
            icon: "🥅",
            desc: "Company is currently running at a net loss",
            score: -5,
            isBuff: false,
        };
    }

    return null;
}

function getShortInterestBuff(symbolData) {
    const floatShares = symbolData.statistics?.floatShares || 0;
    const sharesShort = symbolData.statistics?.sharesShort || 0;

    if (!floatShares || floatShares <= 0) return null;

    const shortRatio = sharesShort / floatShares;

    if (shortRatio > 0.2) {
        return {
            key: "highShort",
            icon: "🩳",
            desc: "High short interest (more than 20% of float)",
            score: 10,
            isBuff: true,
        };
    }

    return null;
}

function getS3FilingBuff(symbolData) {
    if (symbolData.offReg) {
        return {
            key: "hasS3",
            icon: "📂",
            desc: `Registered S-3 filing (${symbolData.offReg})`,
            score: -10,
            isBuff: false,
        };
    }

    return null;
}

function getDilutionRiskBuff(symbolData) {
    const hasS3 = !!symbolData.offReg;
    const netIncome = symbolData.financials?.cashflowStatement?.netIncome;
    const isNetNegative = typeof netIncome === "number" && netIncome < 0;

    if (hasS3 && isNetNegative) {
        return {
            key: "dilutionRisk",
            icon: "🚨",
            desc: "High dilution risk: Net loss + Registered S-3",
            score: -20,
            isBuff: false,
        };
    }

    return null;
}

let lastTickerSetAt = 0;
const MIN_UPDATE_INTERVAL = 5000; // 3 seconds

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

    // 🔁 Update volume buff dynamically based on current event
    const volumeBuff = calculateVolumeImpact(event.strength || 0, event.price || 1);
    hero.buffs.volume = volumeBuff;

    // Evaluate bounce back condition
    const bounceBuff = getBounceBackBuff(hero, event);
    if (bounceBuff) {
        hero.buffs.bounceBack = bounceBuff;
    } else {
        delete hero.buffs.bounceBack;
    }

    const newHighBuff = getNewHighBuff(hero);
    if (newHighBuff) {
        hero.buffs.newHigh = newHighBuff;
    } else {
        delete hero.buffs.newHigh;
    }

    if (!hero.highestPrice || event.price > hero.highestPrice) {
        hero.highestPrice = event.price;
    }

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

    // 6. Animate out, then replace card in DOM
    existing.classList.add("fade-out");

    setTimeout(() => {
        existing.replaceWith(newCard);

        // 7. Animate to final values (moved inside here)
        requestAnimationFrame(() => {
            const state = focusState[hero];
            const strengthCap = state.price < 1.5 ? 800000 : 400000;

            newCard.querySelector(".bar-fill.xp").style.width = `${Math.min((state.xp / ((state.lv + 1) * 100)) * 100, 100)}%`;
            newCard.querySelector(".bar-fill.hp").style.width = `${Math.min((state.hp / maxHP) * 100, 100)}%`;
            newCard.querySelector(".bar-fill.strength").style.width = `${Math.min((state.strength / strengthCap) * 100, 100)}%`;
        });
    }, 200); // Match animation duration
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

    const topPosition = 200;
    const requiredXp = (state.lv + 1) * 100;
    const xpProgress = Math.min((state.xp / requiredXp) * 100, 100);
    const strengthCap = price < 1.5 ? 800000 : 400000;

    // Store initial values for animation
    const initialValues = {
        xp: state.xp,
        hp: state.hp,
        strength: strength,
    };

    console.log(state.buffs);

    // Buffs
    // Define sort order across both positive and negative buffs
    const sortOrder = ["float", "volume", "news", "bio", "weed", "space", "newHigh", "bounceBack", "highShort", "netLoss", "hasS3", "dilutionRisk", "china", "lockedShares"];

    // Sort helper
    const sortBuffs = (arr) =>
        arr.sort((a, b) => {
            const aIndex = sortOrder.indexOf(a.key);
            const bIndex = sortOrder.indexOf(b.key);
            return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        });

    // Extract buffs
    const buffsArray = Object.values(state.buffs || {});
    const positiveBuffs = sortBuffs(buffsArray.filter((b) => b.isBuff === true));
    const negativeBuffs = sortBuffs(buffsArray.filter((b) => b.isBuff === false));

    // Render
    const buffHtml = `
<div class="buff-container">
    <div class="buff-row positive">
        ${positiveBuffs.map((buff) => `<span class="buff-icon" title="${buff.desc}">${buff.icon}</span>`).join("")}
    </div>
    <div class="buff-row negative">
        ${negativeBuffs.map((buff) => `<span class="buff-icon" title="${buff.desc}">${buff.icon}</span>`).join("")}
    </div>
</div>
`;

    card.innerHTML = `
    <div class="ticker-header-grid">
        <div class="ticker-info">
            <div class="ticker-symbol" style="background-color:${getSymbolColor(hero)}">
                $${hero} <span class="lv">LV${state.lv}</span>
            </div>
            <div class="ticker-price">$<span class="price">${price.toFixed(2)}</span></div>
            <div id="change" style="top: 0 + ${topPosition}px;">${change ? `<div class="${changeClass}" >${change}</div>` : ""}</div>
            
            <div id="score"><span class="bar-text score" style="font-size: 6px; margin-top:4px">SCORE: ${state.score.toFixed(0)}</span></div>
        </div>
    
        ${buffHtml}
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

    const scoreEl = card.querySelector(".bar-text.score");

    if (scoreEl) {
        const prevScore = state.prevScore || 0;
        const currentScore = state.score;

        if (currentScore > prevScore) {
            scoreEl.classList.add("score-flash-up");
        } else if (currentScore < prevScore) {
            scoreEl.classList.add("score-flash-down");
        }

        setTimeout(() => {
            scoreEl.classList.remove("score-flash-up", "score-flash-down");
        }, 500); // same as animation duration

        state.prevScore = currentScore; // store for next tick
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
        if (event.hp > 0) {
            baseScore += event.hp * 10;
            if (debug && debugSamples < debugLimitSamples) logStep("💖", "Base HP Added", baseScore);

            // 💪 Add bonus score per level (100 points per level)
            const levelBoost = (hero.level || 0) * 100;
            baseScore += levelBoost;
            if (debug && debugSamples < debugLimitSamples) {
                logStep("🎖️", `Level Boost (LV ${hero.level || 0})`, levelBoost);
            }

            // Apply Float score
            const floatBuff = getHeroBuff(hero, "float");
            const floatScore = floatBuff?.score ?? 0;
            baseScore += floatScore;

            if (debug && debugSamples < debugLimitSamples) {
                const label = floatBuff?.key === "floatCorrupt" ? "🧨" : "🏷️";
                const formattedFloat = humanReadableNumbers(hero.floatValue) || "N/A";
                logStep(label, `Float Score (${formattedFloat})`, floatScore);
            }

            // Apply Volume score from precomputed buff
            const volumeBuff = getHeroBuff(hero, "volume");
            const volScore = volumeBuff?.score ?? 0;
            baseScore += volScore;

            if (debug && debugSamples < debugLimitSamples) {
                const volUsed = event.strength || 0;
                const volMsg = volumeBuff?.message ?? `No volume buff (${humanReadableNumbers(volUsed)})`;
                logStep("📢", volMsg, volScore);
            }
            // Clamp total baseScore to positive only (no negative scoring on "up" events)
            baseScore = Math.max(0, baseScore);
        }

        if (event.dp > 0) {
            baseScore -= event.dp * 10;

            const volumeBuff = getHeroBuff(hero, "volume");
            const volPenalty = volumeBuff?.score ?? 0;

            // Only apply negative volume scores for down events
            if (volPenalty < 0) {
                baseScore += volPenalty; // subtract more
                if (debug && debugSamples < debugLimitSamples) {
                    logStep("📉", `Volume Penalty (${humanReadableNumbers(event.strength || 0)})`, volPenalty);
                }
            }

            if (debug && debugSamples < debugLimitSamples) logStep("💥", "Base DP Deducted", event.dp * 10);
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
                const scale = 1 + hero.score / SCORE_NORMALIZATION;
                const cling = 0.5;
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

function getColorForStage(stageKey) {
    const colors = {
        lowVol: "#cccccc",
        mediumVol: "#4caf50",
        highVol: "#ff9800",
        parabolicVol: "#f44336",
    };
    return colors[stageKey] || "#cccccc";
}

function humanReadableNumbers(value) {
    if (!value || isNaN(value)) return "-";
    const num = Number(value);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
    return num.toLocaleString(); // For values smaller than 1,000
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
            Object.assign(focusState, parsed.state);
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

window.clearState = () => {
    localStorage.removeItem("focusState");
    for (const key in focusState) {
        delete focusState[key];
    }
    if (debug) console.log("🧹 Cleared saved and in-memory focus state.");
};
