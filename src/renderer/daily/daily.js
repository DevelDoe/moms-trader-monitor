// Local arrays for UI processing
let tickersDaily = [];

// Store previous tickers for comparison
let prevTickersDaily = {};

// define floats
const floatOneMillionHigh = 2_000_000;
const floatFiveMillion = 7_500_000;
const floatTenMillion = 13_000_000;
const floatFiftyMillion = 65_000_000;
const floatHundredMillion = 125_000_000;
const floatTwoHundredMillion = 250_000_000;
const floatFiveHundredMillion = 600_000_000;

const symbolColors = {};

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Loading Daily Window...");

    await applySavedFilters(); // settingsAPI.get(); -> .invoke("get-settings") -> return appSettings;
    await fetchAndUpdateTickers(); // getTickers("daily"); -> .invoke("get-tickers", listType) ->  return tickerStore.getAllTickers(listType);

    // ✅ Listen for ticker updates
    window.dailyAPI.onTickerUpdate(() => {
        console.log("🔔 Lists updates received, fetching latest data...");
        fetchAndUpdateTickers(); // getTickers("daily"); -> .invoke("get-tickers", listType) ->  return tickerStore.getAllTickers(listType);
    });

    // ✅ Listen for news updates (new articles)
    window.dailyAPI.onNewsUpdate(({ ticker, newsItems }) => {
        console.log(`📰 Received ${newsItems.length} new articles for ${ticker}`); //
        fetchAndUpdateTickers(); // getTickers("daily"); -> .invoke("get-tickers", listType) ->  return tickerStore.getAllTickers(listType);
    });

    // ✅ Listen for settings updates globally
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);

        // ✅ Sync new settings globally
        window.settings = updatedSettings;

        // ✅ Re-apply filters & update UI
        await applySavedFilters(); // settingsAPI.get(); -> .invoke("get-settings") -> return appSettings;
        await fetchAndUpdateTickers(); // getTickers("daily"); -> .invoke("get-tickers", listType) ->  return tickerStore.getAllTickers(listType);
    });
});

async function fetchAndUpdateTickers() {
    try {
        console.log("Fetching updated tickers...");

        // ✅ Fetch tickers from API
        const dailyData = await window.dailyAPI.getTickers("daily");
        console.log("📊 Daily Data:", dailyData);

        // ✅ Store previous state for comparison
        let oldTickersDaily = { ...prevTickersDaily };

        // ✅ Extract filters from settings
        const minPrice = window.settings.top?.minPrice ?? 0;
        const maxPrice = window.settings.top?.maxPrice ?? 0;
        const minFloat = window.settings.top?.minFloat ?? 0;
        const maxFloat = window.settings.top?.maxFloat ?? 0;
        const minScore = window.settings.top?.minScore ?? 0;
        const maxScore = window.settings.top?.maxScore ?? 0;
        const minVolume = window.settings.top?.minVolume ?? 0;
        const maxVolume = window.settings.top?.maxVolume ?? 0;
        const maxDailyLength = window.settings.top.dailyListLength ?? 10;

        console.log("Applying filters:", {
            minPrice,
            maxPrice,
            minFloat,
            maxFloat,
            minScore,
            maxScore,
            minVolume,
            maxVolume,
        });

        // ✅ Apply filters to each dataset
        const applyFilters = (data) =>
            data
                .map((ticker) => ({
                    ...ticker,
                    Score: calculateScore(ticker),
                    Float: ticker.Float !== undefined ? parseHumanNumber(ticker.Float) : null, // ✅ Ensure Float is handled
                    Volume: ticker.Volume !== undefined ? parseVolumeValue(ticker.Volume) : null, // ✅ Ensure Volume is handled
                }))
                .filter(
                    (ticker) =>
                        (minPrice === 0 || ticker.Price >= minPrice) &&
                        (maxPrice === 0 || ticker.Price <= maxPrice) &&
                        (minFloat === 0 || (ticker.statistics.floatShares !== null && ticker.statistics.floatShares >= minFloat)) && // ✅ Only check if Float exists
                        (maxFloat === 0 || (ticker.statistics.floatShares !== null && ticker.statistics.floatShares <= maxFloat)) && // ✅ Only check if Float exists
                        (minScore === 0 || ticker.Score >= minScore) &&
                        (maxScore === 0 || ticker.Score <= maxScore) &&
                        (minVolume === 0 || (ticker.Volume !== null && ticker.Volume >= minVolume)) && // ✅ Only check if Volume exists
                        (maxVolume === 0 || (ticker.Volume !== null && ticker.Volume <= maxVolume)) // ✅ Only check if Volume exists
                )
                .sort((a, b) => b.Score - a.Score);

        const filteredDaily = applyFilters(dailyData);
        console.log("✅ Filtered Daily Data:", filteredDaily);

        // ✅ Limit number of displayed entries
        tickersDaily = filteredDaily.slice(0, maxDailyLength);
        console.log("✅ Final Daily List after max length:", tickersDaily);

        // ✅ Update previous ticker states
        prevTickersDaily = Object.fromEntries(tickersDaily.map((t) => [t.Symbol, t]));

        // 🔄 Fetch the latest settings before updating
        const latestSettings = await window.settingsAPI.get();
        if (!latestSettings || !latestSettings.news) {
            console.error("❌ Failed to fetch latest settings. Skipping update.");
            return;
        }

        // ✅ Extract new filtered tickers
        const newFilteredTickers = filteredDaily.map((t) => t.Symbol);
        const prevFilteredTickers = latestSettings.news.filteredTickers || [];

        // ✅ Check if filtered tickers have changed (better comparison)
        const hasChanges = newFilteredTickers.length !== prevFilteredTickers.length || newFilteredTickers.some((ticker, i) => ticker !== prevFilteredTickers[i]);

        if (hasChanges) {
            console.log("🔄 Updating UI with new filtered tickers...");

            // ✅ Update UI only (no settings update)
            updateTickersList(tickersDaily, "tickers-daily", prevTickersDaily);
        } else {
            console.log("✅ No changes in filtered tickers, skipping update.");
        }

        console.log("✅ UI Updated Successfully!");
    } catch (error) {
        console.error("❌ Error fetching tickers:", error);
    }
}

async function applySavedFilters() {
    const settings = await window.settingsAPI.get();
    window.settings = settings; // ✅ Ensure settings are globally updated

    window.minPrice = settings.top.minPrice ?? 0;
    window.maxPrice = settings.top.maxPrice ?? 1000;

    console.log("✅ Applied saved filters:", { minPrice: window.minPrice, maxPrice: window.maxPrice });

    // ✅ Clear existing data before applying new filters
    tickersDaily = [];
}

function updateTickersList(tickers, listId, prevTickers) {
    const ul = document.getElementById(listId);

    // ✅ Ensure tickers array is not empty before calling Object.keys
    if (!tickers.length) {
        console.warn(`⚠️ No tickers available for ${listId}`);
        ul.innerHTML = "<li>No tickers available</li>"; // ✅ Clear existing list and show message
        return;
    }

    // 🔄 **Clear list before updating**
    ul.innerHTML = ""; // ✅ Prevent duplicates

    // ✅ Determine which columns should be displayed
    const listType = "daily";
    const enabledColumns = window.settings.top.lists?.[listType] || {};

    const allColumns = [...new Set([...Object.keys(tickers[0]), "Bonuses"])].filter((key) => enabledColumns[key] || key === "Symbol");

    // ✅ Populate list items
    tickers.forEach((ticker) => {
        const li = document.createElement("li");
        li.classList.add("ticker-item");

        // 🔍 **Detect new or updated tickers**
        const prevTicker = prevTickers[ticker.Symbol];

        let isNew = !prevTicker;
        let isUpdated = prevTicker && (prevTicker.Price !== ticker.Price || prevTicker.Count !== ticker.Count || prevTicker.Score !== ticker.Score);

        if (isNew) {
            li.classList.add("highlight-new"); // 🟢 Apply new ticker highlight
        } else if (isUpdated) {
            li.classList.add("highlight-updated"); // 🟠 Apply update highlight
        }

        // ✅ Construct ticker row
        allColumns.forEach((key) => {
            const span = document.createElement("span");
            span.className = "ticker-data";

            if (key === "Symbol") {
                span.textContent = ticker[key];
                span.classList.add("symbol");
                span.classList.add("no-drag");
                span.style.cursor = "pointer";
                span.style.backgroundColor = getSymbolColor(ticker[key]);
                span.title = "A ticker symbol is a short, unique identifier for a publicly traded company.";
                span.addEventListener("click", () => {
                    navigator.clipboard.writeText(ticker[key]);
                    console.log(`📋 Copied ${ticker[key]} to clipboard!`);
                    window.activeAPI.setActiveTicker(ticker.Symbol);
                });
            } else if (key === "Price") {
                span.textContent = formatPrice(ticker[key]);
                span.title = "Last price update";
            } else if (key === "alertChangePercent") {
                span.textContent = ticker[key] + "%";
                span.title = "Last change update";
                if (ticker.Direction === "UP") {
                    span.classList.add("up");
                } else if (ticker.Direction === "DOWN") {
                    span.classList.add("down");
                }
            } else if (key === "cumulativeUpChange") {
                span.textContent = ticker[key] + "%";
                span.title = "Cumulative up change";
                span.classList.add("up");
            } else if (key === "cumulativeDownChange") {
                span.textContent = ticker[key] + "%";
                span.title = "Cumulative down change";
                span.classList.add("down");
            } else if (key === "fiveMinVolume") {
                span.textContent = formatVolume(ticker[key]);
                span.title = "Volume last 5 minutes";
            } else if (key === "Score") {
                span.textContent = ticker[key];
                span.classList.add("Score-tooltip");
                span.classList.add("no-drag");
                span.title = getScoreBreakdown(ticker);
            } else if (key === "Bonuses") {
                span.innerHTML = getBonusesHTML(ticker);
            } else {
                span.textContent = ticker[key];
            }

            li.appendChild(span);
        });

        ul.appendChild(li);
    });

    console.log(`✅ Finished updating list: ${listId}`);
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

function formatPrice(price) {
    if (typeof price !== "number" || isNaN(price)) return "$0.00";
    return `$${price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

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

function parseHumanNumber(str) {
    if (!str) return 0; // ✅ Ensure null/undefined returns 0
    let sanitized = String(str)
        .trim()
        .replace(/[^0-9.]/g, ""); // ✅ Remove non-numeric characters
    let value = parseFloat(sanitized) || 0;

    if (/B/i.test(str)) value *= 1_000_000_000; // ✅ Convert "B" to billions
    if (/M/i.test(str)) value *= 1_000_000; // ✅ Convert "M" to millions
    if (/K/i.test(str)) value *= 1_000; // ✅ Convert "K" to thousands

    return value;
}

function parseVolumeValue(floatStr) {
    if (floatStr == null) return 0; // ✅ Ensure null/undefined returns 0
    let str = String(floatStr); // ✅ Convert to string
    let sanitized = str.replace(/[^0-9.]/g, "");
    let value = parseFloat(sanitized) || 0;

    if (str.toUpperCase().includes("K")) value *= 1_000; // Thousands
    if (str.toUpperCase().includes("M")) value *= 1_000_000; // Millions
    if (str.toUpperCase().includes("B")) value *= 1_000_000_000; // Billions

    return value;
}

function truncateString(str, maxLength) {
    if (str.length > maxLength) {
        return str.slice(0, maxLength) + "..."; // Adds ellipsis at the end
    }
    return str;
}

function formatLargeNumber(value) {
    if (!value || isNaN(value)) return "-";
    const num = Number(value);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
    return num.toLocaleString();
}

function calculateScore(ticker) {
    let Score = Math.floor(ticker.cumulativeUpChange || 0);

    const floatValue = ticker.statistics?.floatShares != undefined ? parseHumanNumber(ticker.statistics?.floatShares) : 0;
    const volumeValue = ticker.Volume !== undefined ? parseVolumeValue(ticker.Volume) : 0;

    let blockList = window.settings.news?.blockList || [];
    let filteredNews = [];
    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = newsItem.headline || "";
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
            return !isBlocked;
        });
    }

    // news
    if (filteredNews.length > 0) {
        Score = Score * 1.9;
    }

    // New high
    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        Score = Score * 1.5;
    }

    // Float
    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        Score = Score * 1.5;
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        Score = Score * 1.25;
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        Score = Score * 1.1;
    } else if (floatValue >= floatTenMillion && floatValue < floatFiftyMillion) {
    } else if (floatValue >= floatFiftyMillion && floatValue < floatHundredMillion) {
        Score = Score * 0.8;
    } else if (floatValue >= floatHundredMillion && floatValue < floatTwoHundredMillion) {
        Score = Score * 0.6;
    } else if (floatValue >= floatTwoHundredMillion && floatValue < floatFiveHundredMillion) {
        Score = Score * 0.4;
    } else if (floatValue >= floatFiveHundredMillion) {
        Score = Score * 0.1;
    }

    if (ticker.profile.industry && ticker.profile.industry === "Biotechnology") {
        Score *= 1.4;
    } else if (ticker.profile.longBusinessSummary && ticker.profile.longBusinessSummary.toLowerCase().includes("cannabis")) {
        Score *= 1.2;
    }

    // total volume
    if (volumeValue > 0) {
        // Score += Math.floor(volumeValue / 1_000_000) * 2;
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

    // ✅ Check if (Insiders + Institutions + Remaining) > 50% of total shares
    if (insiderShares + institutionalShares + remainingShares > 0.5 * sharesOutstanding) {
        Score *= 0.5;
    }

    // Check if short shares exceed 10% of the total float
    if (sharesShort > 0.2 * floatShares) {
        Score *= 1.5;
    }

    // Check safely if net income is negative:
    const netIncome = ticker.financials?.cashflowStatement?.netIncome;
    const hasNegativeIncome = typeof netIncome === "number" && netIncome < 0;
    const hasS3Filing = !!ticker.offReg; // Ensure it's treated as a boolean

    // Clear bonuses & tooltips if both conditions are met
    if (hasNegativeIncome && hasS3Filing) {
        Score = Score * 0.7;
    } else {
        if (hasNegativeIncome) {
            // Score = Score * 0.9;
        }

        if (hasS3Filing) {
            // Score = Score * 0.9;
        }
    }

    return Math.floor(Score);
}

function getScoreBreakdown(ticker) {
    let breakdown = [];
    let Score = Math.floor(ticker.cumulativeUpChange || 0);

    const floatValue = ticker.statistics?.floatShares != undefined ? parseHumanNumber(ticker.statistics?.floatShares) : 0;

    // News
    const blockList = window.settings.news?.blockList || [];
    const filteredNews = Array.isArray(ticker.News)
        ? ticker.News.filter((newsItem) => {
              const headline = newsItem.headline || "";
              return !blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
          })
        : [];

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

    // Add base up change to breakdown
    breakdown.push(`Cumulative Up Change: ${ticker.cumulativeUpChange || 0}`);
    breakdown.push(`---------------------`);

    // Float
    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        Score *= 1.5;
        breakdown.push(`1️⃣ Float less than 2M: 1.5x multiplier`);
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        Score *= 1.25;
        breakdown.push(`5️⃣ Float 2M-7.5M: 1.25x multiplier`);
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        Score *= 1.1;
        breakdown.push(`🔟 Float 7.5M-13M: 1.1x multiplier`);
    } 

    if (filteredNews.length > 0) {
        Score *= 1.9;
        breakdown.push(`😼 Has News: 1.9x multiplier`);
    }

    // New High
    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        Score *= 1.5;
        breakdown.push("📈 New High: 1.5x multiplier");
    }

    // Industry & keywords
    const summary = ticker.profile.longBusinessSummary?.toLowerCase() || "";
    const isBiotech = ticker.profile.industry === "Biotechnology" || summary.includes("biotech") || summary.includes("biotechnology");
    const isCannabis = summary.includes("cannabis");
    const isSpace = summary.includes("space");

    if (isBiotech) {
        Score *= 1.5;
        breakdown.push("🧬 Biotechnology stock: 1.5x multiplier");
    } else if (isCannabis) {
        Score *= 0.8;
        breakdown.push("🌿 Cannabis: 0.8x multiplier");
    } else if (isSpace) {
        Score *= 1.2;
        breakdown.push("🌌 Space: 1.2x multiplier");
    }

    // ✅ Check if (Insiders + Institutions + Remaining) > 50% of total shares
    if (insiderShares + institutionalShares + remainingShares > 0.5 * sharesOutstanding) {
        Score = Score * 0.5;
        breakdown.push("💼 High percentage of shares held by insiders and institutions: 0.5x multiplier");
    }

    // Check if short shares exceed 20% of the total float
    if (sharesShort > 0.2 * floatShares) {
        Score = Score * 1.5;
        breakdown.push("🩳 High percentage of shares are shorted: 1.5x multiplier");
    }

    // Finances
    const netIncome = ticker.financials?.cashflowStatement?.netIncome;
    const hasNegativeIncome = typeof netIncome === "number" && netIncome < 0;
    const hasS3Filing = !!ticker.offReg;

    // Clear bonuses & tooltips if both conditions are met
    if (hasNegativeIncome && hasS3Filing) {
        Score = Score * 0.7;
        breakdown.push(`🚨 Registered S-3 & Net loss: 0.7x multiplier`);
    } else {
        if (hasNegativeIncome) {
            // Score = Score * 0.9;
            // breakdown.push("Running at net loss 0.9x multiplier");
        }

        if (hasS3Filing) {
            // Score = Score * 0.9;
            // breakdown.push("Registered offering 0.9x multiplier");
        }
    }

    // Add final Score to breakdown
    breakdown.push(`---------------------`);
    breakdown.push(`Final Score: ${Math.floor(Score)}`);

    return breakdown.join("\n");
}

function getBonusesHTML(ticker) {
    let bonuses = [];
    let tooltipText = [];

    const floatValue = ticker.statistics?.floatShares != undefined ? parseHumanNumber(ticker.statistics?.floatShares) : 0;
    const fiveMinVolume = formatLargeNumber(ticker.fiveMinVolume);
    
    // News
    let blockList = window.settings.news?.blockList || [];
    let filteredNews = [];
    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = newsItem.headline || ""; // Ensure headline is a string
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
            return !isBlocked; // Keep only non-blocked headlines
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

    if (ticker.fiveMinVolume < 100_000) {
        bonuses.push('<span class="bonus low-volume no-drag">💤</span>');
        tooltipText.push(`💤 Low Volume: ${fiveMinVolume}`);
    } else if (ticker.fiveMinVolume > 300_000) {
        bonuses.push(`<span class="bonus high-volume no-drag">🔥</span>`);
        tooltipText.push(`🔥 High Volume: ${fiveMinVolume}`);
    } else {
        bonuses.push(`<span class="bonus normal-volume no-drag">🚛</span>`);
        tooltipText.push(`🚛 Medium Volume: ${fiveMinVolume}`);
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

    // Insiders and institutions
    if (insiderShares + institutionalShares + remainingShares > 0.5 * sharesOutstanding) {
        bonuses.push('<span class="bonus owners no-drag">💼</span>');
        tooltipText.push("💼 High percentage of shares are held by insiders and institutions");
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
    const summary = ticker.profile.longBusinessSummary?.toLowerCase() || "";
    const isBiotech = ticker.profile.industry === "Biotechnology" || summary.includes("biotech") || summary.includes("biotechnology");
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
        tooltipText.push(`🚨 Registered S-3 filing dated ${ticker.offReg} & Running at a net loss`);
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

    if (bonuses.length === 0) {
        return ""; // No bonuses
    }

    return `<span class="bonus-container" title="${tooltipText.join("\n")}">${bonuses.join(" ")}</span>`;
}
