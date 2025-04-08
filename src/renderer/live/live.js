let tickers = {}; // symbol -> full ticker object
let state = {}; // symbol -> { decay, lastPrice }
let prevTickersSessions = {}; // Initialize prevTickersSessions

let filters = {};
let maxVisible = 10;

const floatOneMillionHigh = 2_000_000;
const floatFiveMillion = 7_500_000;
const floatTenMillion = 13_000_000;
const floatFiftyMillion = 65_000_000;
const floatHundredMillion = 125_000_000;
const floatTwoHundredMillion = 250_000_000;
const floatFiveHundredMillion = 600_000_000;

const symbolColors = {};

let lastTopSymbol = null;
let debounceTimer = null;

let topTickers = ["", "", "", ""];

isLongBiased = true;

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Loading live Window...");

    await applySavedFilters();
    await fetchAndUpdateTickers();

    window.sessionAPI.onTickerUpdate(() => {
        console.log("🔔 Lists update received, fetching latest data...");
        fetchAndUpdateTickers();
    });

    window.sessionAPI.onNewsUpdate(({ ticker, newsItems }) => {
        console.log(`📰 Received ${newsItems.length} new articles for ${ticker}`);
        fetchAndUpdateTickers();
    });

    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);
        window.settings = updatedSettings;

        await applySavedFilters();
        await fetchAndUpdateTickers();
    });
});

async function fetchAndUpdateTickers() {
    try {
        const sessionData = await window.sessionAPI.getTickers("session");
        console.log(sessionData)
        const filters = {
            minPrice: window.settings.top?.minPrice ?? 0,
            maxPrice: window.settings.top?.maxPrice ?? 0,
            minFloat: window.settings.top?.minFloat ?? 0,
            maxFloat: window.settings.top?.maxFloat ?? 0,
            minScore: window.settings.top?.minScore ?? 0,
            maxScore: window.settings.top?.maxScore ?? 0,
            minVolume: window.settings.top?.minVolume ?? 0,
            maxVolume: window.settings.top?.maxVolume ?? 0,
        };

        const maxVisible = window.settings.top.liveListLength ?? 10;

        // Update store
        const changed = updateTickers(sessionData, filters, maxVisible);

        if (changed) {
            renderTickers("tickers-live");
        }
    } catch (error) {
        console.error("❌ Error fetching tickers:", error);
    }
}

function getVisibleTickers(limit = maxVisible) {
    return Object.values(tickers).filter(passesFilter).sort(scoreSort).slice(0, limit);
}

function passesFilter(t) {
    const price = t.Price || 0;
    const float = parseHumanNumber(t.statistics?.floatShares) || 0;
    const score = t.Score || 0;
    const volume = parseVolumeValue(t.fiveMinVolume) || 0;

    return (
        price >= filters.minPrice &&
        (filters.maxPrice === 0 || price <= filters.maxPrice) &&
        float >= filters.minFloat &&
        (filters.maxFloat === 0 || float <= filters.maxFloat) &&
        score >= filters.minScore &&
        (filters.maxScore === 0 || score <= filters.maxScore) &&
        volume >= filters.minVolume &&
        (filters.maxVolume === 0 || volume <= filters.maxVolume)
    );
}

async function applySavedFilters() {
    const settings = await window.settingsAPI.get(); // Fetch the saved settings
    window.settings = settings; // Sync settings globally

    // Apply the relevant filters based on the settings
    window.minPrice = settings.top.minPrice ?? 0; // Set minimum price filter
    window.maxPrice = settings.top.maxPrice ?? 1000; // Set maximum price filter
    window.minFloat = settings.top.minFloat ?? 0; // Set minimum float filter
    window.maxFloat = settings.top.maxFloat ?? 0; // Set maximum float filter
    window.minScore = settings.top.minScore ?? 0; // Set minimum score filter
    window.maxScore = settings.top.maxScore ?? 0; // Set maximum score filter
    window.minVolume = settings.top.minVolume ?? 0; // Set minimum volume filter
    window.maxVolume = settings.top.maxVolume ?? 0; // Set maximum volume filter

    console.log("✅ Applied saved filters:", {
        minPrice: window.minPrice,
        maxPrice: window.maxPrice,
        minFloat: window.minFloat,
        maxFloat: window.maxFloat,
        minScore: window.minScore,
        maxScore: window.maxScore,
        minVolume: window.minVolume,
        maxVolume: window.maxVolume,
    });
}

function scoreSort(a, b) {
    const volA = parseVolumeValue(a.fiveMinVolume);
    const volB = parseVolumeValue(b.fiveMinVolume);

    const tier = (v) => (v > 300_000 ? 0 : v >= 100_000 ? 1 : 2);
    const tierA = tier(volA);
    const tierB = tier(volB);

    if (tierA !== tierB) return tierA - tierB;

    const decayA = state[a.Symbol]?.decay ?? 0;
    const decayB = state[b.Symbol]?.decay ?? 0;

    // More decayed = lower priority
    if (decayA !== decayB) return decayA - decayB;

    return b.Score - a.Score;
}

function updateTickers(rawTickers, newFilters, newMaxVisible = 10) {
    let changed = false;
    filters = newFilters;
    maxVisible = newMaxVisible;

    rawTickers.forEach((t) => {
        const symbol = t.Symbol;
        const prev = tickers[symbol];

        // Update decay
        const last = state[symbol] || { decay: 0, lastPrice: null };
        const priceUnchanged = last.lastPrice === t.Price;
        last.decay = priceUnchanged ? last.decay + 1 : 0;
        last.lastPrice = t.Price;
        state[symbol] = last;

        t._decayed = last.decay;
        t.Score = calculateScoreWithDecay(t, last.decay);

        // Detect changes
        if (!prev || prev.Price !== t.Price || prev.Score !== t.Score || prev.Count !== t.Count) {
            changed = true;
        }

        tickers[symbol] = t;
    });

    return changed;
}

function calculateScoreWithDecay(ticker, decay) {
    const baseScore = calculateScore(ticker); // from live.js
    const decayMultiplier = Math.pow(0.95, decay);
    return applyMultiplier(baseScore, decay > 0 ? decayMultiplier : 1);
}

// Global multiplier adjustment factor
let multiplierScaleFactor = 0.25;  // 1/4th of the original multiplier

// Adjusted multiplier function
function adjustMultiplier(originalMultiplier) {
    return originalMultiplier * multiplierScaleFactor + 1;
}

function calculateScore(ticker) {
    const up = Math.floor(ticker.cumulativeUpChange || 0);
    const down = Math.floor(ticker.cumulativeDownChange || 0);
    const fiveMinVolume = formatLargeNumber(ticker.fiveMinVolume);
    const floatValue = ticker.statistics?.floatShares != undefined ? parseHumanNumber(ticker.statistics?.floatShares) : 0;

    // 1. Base score is just the up leg
    let Score = up;

    // 2. If it's recovering (down was greater, but up is now increasing), apply a recovery boost
    if (down > up && up > 0) {
        const recoveryRatio = up / down;
        const recoveryBoost = Math.min(recoveryRatio, 1) * 2; // Max 2x boost

        // Apply dynamic boost based on trader's bias
        if (isLongBiased) {
            Score = applyMultiplier(Score, 1 + adjustMultiplier(recoveryBoost)); // Long-biased: Recovery boost
        } else {
            Score = applyMultiplier(Score, 1 - adjustMultiplier(recoveryBoost)); // Short-biased: Recovery penalty (if recovery ratio is positive)
        }
    }

    // 3. If it's still mostly going down, apply a penalty
    if (down > up && up === 0) {
        let penalty = Math.min(down / (up + down), 0.8); // Maximum of 80% penalty

        // Apply dynamic penalty or boost based on trader's bias
        if (isLongBiased) {
            Score = applyMultiplier(Score, 1 - adjustMultiplier(penalty)); // Long-biased: Apply penalty
        } else {
            Score = applyMultiplier(Score, 1 + adjustMultiplier(penalty)); // Short-biased: Apply boost (to capitalize on the downtrend)
        }
    }

    // 4. Score floor
    Score = Math.max(0, Math.floor(Score));

    // 5. Volume impact - reversed logic for short-biased traders
    if (fiveMinVolume < 80_000) {
        Score = applyMultiplier(Score, adjustMultiplier(0.01));
    } else if (fiveMinVolume < 120_000) {
        Score = applyMultiplier(Score, adjustMultiplier(0.8));
    } else if (fiveMinVolume < 240_000) {
        Score = applyMultiplier(Score, adjustMultiplier(1));
    } else {
        if (isLongBiased) {
            Score = applyMultiplier(Score, adjustMultiplier(1.5)); // Long-biased: Positive effect for high volume
        } else {
            Score = applyMultiplier(Score, adjustMultiplier(0.8)); // Short-biased: Negative effect for high volume
        }
    }

    let blockList = window.settings?.news?.blockList || [];
    let filteredNews = [];

    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = sanitize(newsItem.headline || "");
            const isBlocked = blockList.some((b) => headline.includes(sanitize(b)));
            return !isBlocked;
        });
    }

    if (filteredNews.length > 0) {
        Score = applyMultiplier(Score, adjustMultiplier(1.9));
    }

    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        Score = applyMultiplier(Score, adjustMultiplier(1.5));
    }

    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        Score = applyMultiplier(Score, adjustMultiplier(1.5));
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        Score = applyMultiplier(Score, adjustMultiplier(1.25));
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        Score = applyMultiplier(Score, adjustMultiplier(1.1));
    } else if (floatValue >= floatFiftyMillion && floatValue < floatHundredMillion) {
        Score = applyMultiplier(Score, adjustMultiplier(0.8));
    } else if (floatValue >= floatHundredMillion && floatValue < floatTwoHundredMillion) {
        Score = applyMultiplier(Score, adjustMultiplier(0.6));
    } else if (floatValue >= floatTwoHundredMillion && floatValue < floatFiveHundredMillion) {
        Score = applyMultiplier(Score, adjustMultiplier(0.4));
    } else if (floatValue >= floatFiveHundredMillion) {
        Score = applyMultiplier(Score, adjustMultiplier(0.1));
    }

    if (ticker.profile?.industry === "Biotechnology") {
        Score = applyMultiplier(Score, adjustMultiplier(1.4));
    } else if (ticker.profile?.longBusinessSummary?.toLowerCase().includes("cannabis")) {
        Score = applyMultiplier(Score, adjustMultiplier(1.2));
    }

    const floatShares = ticker.statistics?.floatShares || 0;
    const insidersPercentHeld = ticker.ownership?.insidersPercentHeld || 0;
    const institutionsPercentHeld = ticker.ownership?.institutionsPercentHeld || 0;
    const sharesOutstanding = ticker.statistics?.sharesOutstanding || 0;
    const sharesShort = ticker.statistics?.sharesShort || 0;

    const insiderShares = Math.round(sharesOutstanding * insidersPercentHeld);
    const institutionalShares = Math.round(sharesOutstanding * institutionsPercentHeld);
    const remainingShares = Math.max(sharesOutstanding - (floatShares + insiderShares + institutionalShares), 0);

    if (insiderShares + institutionalShares + remainingShares > 0.5 * sharesOutstanding) {
        Score = applyMultiplier(Score, adjustMultiplier(0.5));
    }

    if (sharesShort > 0.2 * floatShares) {
        Score = applyMultiplier(Score, adjustMultiplier(1.5));
    }

    const netIncome = ticker.financials?.cashflowStatement?.netIncome;
    const hasNegativeIncome = typeof netIncome === "number" && netIncome < 0;
    const hasS3Filing = !!ticker.offReg;

    if (hasNegativeIncome && hasS3Filing) {
        Score = applyMultiplier(Score, adjustMultiplier(0.7));
    }

    return Math.floor(Score);
}

function getScoreBreakdown(ticker) {
    let breakdown = [];
    let Score = Math.floor(ticker.cumulativeUpChange || 0) - Math.floor(ticker.cumulativeDownChange || 0);

    const floatValue = ticker.statistics?.floatShares != undefined ? parseHumanNumber(ticker.statistics?.floatShares) : 0;
    const fiveMinVolume = parseVolumeValue(ticker.fiveMinVolume);

    let blockList = window.settings?.news?.blockList || [];
    let filteredNews = [];

    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = sanitize(newsItem.headline || "");
            const isBlocked = blockList.some((b) => headline.includes(sanitize(b)));
            return !isBlocked;
        });
    }

    const floatShares = ticker.statistics?.floatShares || 0;
    const insidersPercentHeld = ticker.ownership?.insidersPercentHeld || 0;
    const institutionsPercentHeld = ticker.ownership?.institutionsPercentHeld || 0;
    const sharesOutstanding = ticker.statistics?.sharesOutstanding || 0;
    const sharesShort = ticker.statistics?.sharesShort || 0;

    const insiderShares = Math.round(sharesOutstanding * insidersPercentHeld);
    const institutionalShares = Math.round(sharesOutstanding * institutionsPercentHeld);
    const remainingShares = Math.max(sharesOutstanding - (floatShares + insiderShares + institutionalShares), 0);

    breakdown.push(`Up: ${ticker.cumulativeUpChange || 0}% - down change: ${ticker.cumulativeDownChange || 0}%`);
    breakdown.push(`---------------------`);

    // Float
    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        Score = applyMultiplier(Score, 1.5);
        breakdown.push(`1️⃣ Float less than 2M: 1.5x multiplier`);
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        Score = applyMultiplier(Score, 1.25);
        breakdown.push(`5️⃣ Float 2M-7.5M: 1.25x multiplier`);
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        Score = applyMultiplier(Score, 1.1);
        breakdown.push(`🔟 Float 7.5M-13M: 1.1x multiplier`);
    }

    if (insiderShares + institutionalShares + remainingShares > 0.5 * sharesOutstanding) {
        Score = applyMultiplier(Score, 0.5);
        breakdown.push("💼 High percentage of shares held by insiders and institutions: 0.5x multiplier");
    }

    if (filteredNews.length > 0) {
        Score = applyMultiplier(Score, 1.9);
        breakdown.push(`😼 Has News: 1.9x multiplier`);
    }

    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        Score = applyMultiplier(Score, 1.5);
        breakdown.push("📈 New High: 1.5x multiplier");
    }

    // Industry & keywords
    const profile = ticker.profile || {};
    const summary = profile.longBusinessSummary?.toLowerCase() || "";
    const companyName = profile.companyName?.toLowerCase() || "";
    const isBiotech = profile.industry === "Biotechnology" || companyName.includes("biopharma") || summary.includes("biotech") || summary.includes("biotechnology");
    const isCannabis = summary.includes("cannabis");
    const isSpace = summary.includes("space");

    if (isBiotech) {
        Score = applyMultiplier(Score, 1.5);
        breakdown.push("🧬 Biotechnology stock: 1.5x multiplier");
    } else if (isCannabis) {
        Score = applyMultiplier(Score, 0.8);
        breakdown.push("🌿 Cannabis: 0.8x multiplier");
    } else if (isSpace) {
        Score = applyMultiplier(Score, 1.2);
        breakdown.push("🌌 Space: 1.2x multiplier");
    }

    if (sharesShort > 0.2 * floatShares) {
        Score = applyMultiplier(Score, 1.5);
        breakdown.push("🩳 High percentage of shares are shorted: 1.5x multiplier");
    }

    const netIncome = ticker.financials?.cashflowStatement?.netIncome;
    const hasNegativeIncome = typeof netIncome === "number" && netIncome < 0;
    const hasS3Filing = !!ticker.offReg;

    if (hasNegativeIncome && hasS3Filing) {
        Score = applyMultiplier(Score, 0.7);
        breakdown.push(`🚨 Registered S-3 & Net loss: 0.7x multiplier`);
    }

    breakdown.push(`---------------------`);
    breakdown.push(`Final Score: ${Score}`);

    return breakdown.join("\n");
}

function getBonusesHTML(ticker) {
    let bonuses = [];
    let tooltipText = [];

    const floatValue = ticker.statistics?.floatShares != undefined ? parseHumanNumber(ticker.statistics?.floatShares) : 0;
    const fiveMinVolume = formatLargeNumber(ticker.fiveMinVolume);

    // News
    let blockList = window.settings?.news?.blockList || [];
    let filteredNews = [];

    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = sanitize(newsItem.headline || "");
            const isBlocked = blockList.some((b) => headline.includes(sanitize(b)));
            return !isBlocked;
        });
    }

    // Ownership
    const floatShares = ticker.statistics?.floatShares || 0;
    const insidersPercentHeld = ticker.ownership?.insidersPercentHeld || 0;
    const institutionsPercentHeld = ticker.ownership?.institutionsPercentHeld || 0;
    const sharesOutstanding = ticker.statistics?.sharesOutstanding || 0;
    const sharesShort = ticker.statistics?.sharesShort || 0;

    // ✅ Calculate actual shares held
    const insiderShares = Math.round(sharesOutstanding * insidersPercentHeld);
    const institutionalShares = Math.round(sharesOutstanding * institutionsPercentHeld);
    const remainingShares = Math.max(sharesOutstanding - (floatShares + insiderShares + institutionalShares), 0); // Ensure no negatives

    if (ticker.fiveMinVolume < 80_000) {
        bonuses.push('<span class="bonus low-volume no-drag">💀</span>');
        tooltipText.push(`💀 Volume too low: ${fiveMinVolume}`);
    } else if (ticker.fiveMinVolume < 120_000) {
        bonuses.push('<span class="bonus low-volume no-drag">💤</span>');
        tooltipText.push(`💤 Low Volume: ${fiveMinVolume}`);
    } else if (ticker.fiveMinVolume < 240_000) {
        bonuses.push('<span class="bonus normal-volume no-drag">🚛</span>');
        tooltipText.push(`🚛 Medium Volume: ${fiveMinVolume}`);
    } else {
        bonuses.push('<span class="bonus high-volume no-drag">🔥</span>');
        tooltipText.push(`🔥 High Volume: ${fiveMinVolume}`);
    }

    // FLOAT
    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        bonuses.push('<span class="bonus gold-float no-drag">1️⃣</span>');
        tooltipText.push("1️⃣ Float less than 2M");
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        bonuses.push('<span class="bonus silver-float no-drag">5️⃣</span>');
        tooltipText.push("5️⃣ Float between 2M-7.5M");
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        bonuses.push('<span class="bonus bronze-float no-drag">🔟</span>');
        tooltipText.push("🔟 Float between 7.5M-13M");
    }

    // ✅ Check if (Insiders + Institutions + Remaining) > 50% of total shares
    if (insiderShares + institutionalShares + remainingShares > 0.5 * sharesOutstanding) {
        bonuses.push('<span class="bonus owners no-drag">💼</span>');
        tooltipText.push("💼 High percentage of shares held by insiders and institutions");
    }

    if (filteredNews.length > 0) {
        bonuses.push(`<span class="bonus news no-drag">😼</span>`);
        tooltipText.push(`😼 Has News`);
    }

    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        bonuses.push('<span class="bonus high no-drag">📈</span>');
        tooltipText.push("📈 New High");
    }

    // Industry & keywords
    const profile = ticker.profile || {};
    const summary = profile.longBusinessSummary?.toLowerCase() || "";
    const companyName = profile.companyName?.toLowerCase() || "";
    const isBiotech = profile.industry === "Biotechnology" || companyName.includes("biopharma") || summary.includes("biotech") || summary.includes("biotechnology");
    const isCannabis = summary.includes("cannabis");
    const isSpace = summary.includes("space");

    if (isBiotech) {
        bonuses.push('<span class="bonus bio no-drag">🧬</span>');
        tooltipText.push("🧬 Biotechnology stock");
    } else if (isCannabis) {
        bonuses.push('<span class="bonus cannabis no-drag">🌿</span>');
        tooltipText.push("🌿 Cannabis stock");
    } else if (isSpace) {
        bonuses.push('<span class="bonus space no-drag">🌌</span>');
        tooltipText.push("🌌 Space stock");
    }

    if (ticker.profile?.country && (ticker.profile.country === "China" || ticker.profile.country === "CN")) {
        bonuses.push('<span class="bonus cn no-drag">🇨🇳</span>');
        tooltipText.push("CN: Chinese based company");
    }

    if (ticker.profile?.country && (ticker.profile.country === "HK" || ticker.profile.country === "hk")) {
        bonuses.push('<span class="bonus hk no-drag">🇭🇰</span>');
        tooltipText.push("🇭🇰: Hong Kong based company");
    }

    // Check if short shares exceed 10% of the total float
    if (sharesShort > 0.2 * floatShares) {
        bonuses.push('<span class="bonus shorts no-drag">🩳</span>');
        tooltipText.push("🩳 High percentage of shares are shorted");
    }

    // Check safely if net income is negative:
    const netIncome = ticker.financials?.cashflowStatement?.netIncome;
    const hasNegativeIncome = typeof netIncome === "number" && netIncome < 0;
    const hasS3Filing = !!ticker.offReg; // Ensure it's treated as a boolean

    // Clear bonuses & tooltips if both conditions are met
    if (hasNegativeIncome && hasS3Filing) {
        bonuses.push('<span class="bonus alert no-drag">🚨</span>');
        tooltipText.push(`🚨 Registered S-3 filing dated ${ticker.offReg} & Running at net loss`);
    } else {
        if (hasNegativeIncome) {
            bonuses.push('<span class="bonus net no-drag">🥅</span>');
            tooltipText.push("🥅 Company currently operating at a net loss");
        }

        if (hasS3Filing) {
            bonuses.push('<span class="bonus offReg no-drag">📂</span>');
            tooltipText.push(`📂 The company has a registered S-3 filing dated ${ticker.offReg}`);
        }
    }

    // recover
    const up = Math.floor(ticker.cumulativeUpChange || 0);
    const down = Math.floor(ticker.cumulativeDownChange || 0);

    if (down > up && up > 0) {
        bonuses.push('<span class="bonus recovering no-drag">🔁</span>');
        tooltipText.push("🔁 Recovering: Uptrend forming after earlier drop");
    }

    if (bonuses.length === 0) {
        return ""; // No bonuses
    }

    return `<span class="bonus-container" title="${tooltipText.join("\n")}">${bonuses.join(" ")}</span>`;
}

function triggerGlobalAnimation() {
    const wrapper = document.getElementById("tickers-wrapper");

    if (wrapper) {
        wrapper.classList.remove("animate-update");
        void wrapper.offsetWidth; // force reflow

        wrapper.classList.add("animate-update");

        // 🔁 Remove the class after animation completes (300ms)
        setTimeout(() => {
            wrapper.classList.remove("animate-update");
        }, 1300);
    }
}

let currentMaxScore = 0; // Variable to track the max score globally

function renderTickers(listId = "tickers-live") {
    const container = document.getElementById(listId);
    const allTickers = getVisibleTickers(100);

    console.log(allTickers);

    const isValidScore = (t) => typeof t.Score === "number" && t.Score > 10;
    const sorted = allTickers.filter(isValidScore).sort((a, b) => b.Score - a.Score);

    console.log("🎯 liveListLength:", window.settings.top.liveListLength);
    console.log("📦 Total sorted tickers:", sorted.length);

    // 👇 Slice for UI rendering (from settings)
    const listLength = window.settings.top.liveListLength ?? 10;
    const uiTickers = sorted.slice(0, listLength);

    // 👇 Always track top 4 for traderview windows
    const newTopTickers = sorted.slice(0, 4).map((t) => t.Symbol);
    const hasChanged = newTopTickers.some((s, i) => s !== topTickers[i]);

    if (hasChanged) {
        topTickers = newTopTickers;
        window.traderviewAPI.setTopTickers(topTickers);
    }

    // 👇 Debounce active ticker switch
    const topSymbol = sorted[0]?.Symbol;
    if (topSymbol && topSymbol !== lastTopSymbol) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            lastTopSymbol = topSymbol;
            window.activeAPI.setActiveTicker(topSymbol);
        }, 10_000);
    }

    // 👇 Setup UI table
    const table = document.createElement("table");
    table.className = "ticker-table";
    container.innerHTML = "";
    container.appendChild(table);

    if (!uiTickers.length) {
        container.innerHTML = "<tr><td>No tickers available</td></tr>";
        return;
    }

    uiTickers.forEach((ticker) => {
        // Update currentMaxScore if the current ticker's score is higher
        if (ticker.Score > currentMaxScore) {
            currentMaxScore = ticker.Score;
        }

        // Create the rows for the symbol and the two rows for the second column
        const row1 = document.createElement("tr");
        const row2 = document.createElement("tr");

        // Apply styles for decay effect (opacity and grayscale)
        const decay = state[ticker.Symbol]?.decay ?? 0;
        const opacity = Math.max(0.75, 1 - decay * 0.01);
        const grayscale = Math.min(0.4, decay * 0.01);

        // Row 1: Ticker data row
        row1.style.opacity = opacity;
        row1.style.filter = `grayscale(${grayscale})`;
        

        // Column 1: Symbol cell (spans 2 rows)
        const symbolCell = document.createElement("td");
        symbolCell.rowSpan = 2; // Symbol spans both rows
        symbolCell.className = "symbol-cell no-drag"; // Add style for symbol
        symbolCell.style.cursor = "pointer"; // Ensure symbol is clickable

        // Create the span to hold the symbol text
        const symbolSpan = document.createElement("span");
        symbolSpan.textContent = ticker.Symbol; // Set symbol text
        symbolSpan.style.backgroundColor = getSymbolColor(ticker.Symbol); // Apply color to the symbol text

        // Attach the onclick event to make the symbol active
        symbolSpan.onclick = () => {
            navigator.clipboard.writeText(ticker.Symbol);
            window.activeAPI.setActiveTicker(ticker.Symbol);
            lastClickedSymbol = ticker.Symbol;
        };

        // Append the span to the symbol cell
        symbolCell.appendChild(symbolSpan);

        // Append the symbol cell to the row
        row1.appendChild(symbolCell);

        // Column 2: Data (Price, Volume, Score, etc.)
        const dataColumn = document.createElement("td");
        dataColumn.className = "data-column"; // Style for the second column

        const enabledColumns = window.settings.top.lists?.["live"] || {};
        const allColumns = [...new Set([...Object.keys(ticker), "Bonuses"])].filter((key) => enabledColumns[key] || key === "Symbol");

        allColumns.forEach((key) => {
            const td = document.createElement("td");
            td.className = "ticker-data"; // Style for data cells

            // Handle specific columns
            if (key === "Price") {
                td.textContent = formatPrice(ticker[key]);
                td.title = "Last price update";
            } else if (key === "alertChangePercent") {
                td.textContent = ticker[key] + "%";
                td.title = "Last change update";
                td.classList.add(ticker.Direction === "UP" ? "up" : "down");
            } else if (key === "cumulativeUpChange") {
                td.textContent = ticker[key] + "%";
                td.title = "Cumulative up change";
                td.classList.add("up");
            } else if (key === "cumulativeDownChange") {
                td.textContent = ticker[key] + "%";
                td.title = "Cumulative down change";
                td.classList.add("down");
            } else if (key === "fiveMinVolume") {
                td.textContent = formatVolume(ticker[key]);
                td.title = "Volume last 5 minutes";
                const volume = parseVolumeValue(ticker[key]);
                if (volume > 300_000) td.classList.add("high-volume");
                else if (volume < 100_000) td.classList.add("low-volume");
                else td.classList.add("mid-volume");
            } else if (key === "Score") {
                td.textContent = ticker[key].toFixed(0);
                td.title = getScoreBreakdown(ticker);
            } else if (key === "Bonuses") {
                td.innerHTML = getBonusesHTML(ticker);
            }

            dataColumn.appendChild(td);
        });

        row1.appendChild(dataColumn); // Append the data column in the first row

        // Row 2: Mana Bar
        const manaTd = document.createElement("td");
        manaTd.colSpan = allColumns.length;

        const manaBar = document.createElement("div");
        manaBar.className = "mana-bar";

        const manaFill = document.createElement("div");
        manaFill.className = "mana-fill";
        const scoreNormalized = Math.max(minScore, ticker.Score); // Ensure score is at least minScore
        const scorePercentage = Math.min(100, (scoreNormalized / currentMaxScore) * 100);
        manaFill.style.width = scorePercentage + "%"; // Adjust width based on normalized score

        manaBar.appendChild(manaFill);
        manaTd.appendChild(manaBar);
        row2.appendChild(manaTd); // Append the mana bar in the second row

        // Append both rows to the table
        table.appendChild(row1);
        table.appendChild(row2);

        // Store the previous ticker state
        prevTickersSessions[ticker.Symbol] = { ...ticker };
    });
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
applyMultiplier;

function parseHumanNumber(str) {
    if (!str) return 0; // Ensure null or undefined returns 0
    let sanitized = String(str)
        .trim()
        .replace(/[^0-9.]/g, ""); // Remove non-numeric characters (letters, symbols)
    let value = parseFloat(sanitized) || 0;

    // If the string contains "B", convert to billions
    if (/B/i.test(str)) value *= 1_000_000_000;
    // If the string contains "M", convert to millions
    if (/M/i.test(str)) value *= 1_000_000;
    // If the string contains "K", convert to thousands
    if (/K/i.test(str)) value *= 1_000;

    return value;
}

function parseVolumeValue(str) {
    if (!str) return 0;
    let value = parseFloat(String(str).replace(/[^0-9.]/g, "")) || 0;

    if (/B/i.test(str)) value *= 1_000_000_000;
    else if (/M/i.test(str)) value *= 1_000_000;
    else if (/K/i.test(str)) value *= 1_000;

    return value;
}

function formatLargeNumber(value) {
    if (!value || isNaN(value)) return "-";
    const num = Number(value);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
    return num.toLocaleString(); // For values smaller than 1,000
}

// Apply multiplier to score
function applyMultiplier(score, multiplier) {
    return score > 0 ? score * multiplier : score / multiplier;
}

// Format price as currency
function formatPrice(price) {
    if (typeof price !== "number" || isNaN(price)) return "$0.00";
    return `$${price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

// Format volume into human-readable format
function formatVolume(volume) {
    if (volume >= 1_000_000_000) {
        return (volume / 1_000_000_000).toFixed(1) + "B"; // Billions
    } else if (volume >= 1_000_000) {
        return (volume / 1_000_000).toFixed(1) + "M"; // Millions
    } else if (volume >= 1_000) {
        return (volume / 1_000).toFixed(1) + "K"; // Thousands
    }
    return volume.toString(); // If less than 1K, return as is
}

// Sanitize string (remove non-alphanumeric characters)
function sanitize(str) {
    return (str || "")
        .toLowerCase()
        .replace(/[^\w\s]/gi, "") // removes symbols
        .replace(/\s+/g, " ") // normalize whitespace
        .trim();
}
