// Local arrays for UI processing
let tickersSessions = [];

// Store previous tickers for comparison
let prevTickersSessions = {};

// define floats
const floatOneMillionHigh = 2_000_000;
const floatFiveMillion = 7_500_000;
const floatTenMillion = 13_000_000;
const floatFiftyMillion = 65_000_000;
const floatHundredMillion = 125_000_000;
const floatTwoHundredMillion = 250_000_000;
const floatFiveHundredMillion = 600_000_000;

const symbolColors = {};

let sessionClearTriggered = false;
let lastTriggeredHour = null;

setInterval(() => {
    const now = new Date();
    const minute = now.getMinutes();
    const hour = now.getHours(); // Track the hour to prevent retriggers

    // If it's the 28th or 58th minute and we haven't triggered it yet this hour
    if ((minute === 28 || minute === 58) && (!sessionClearTriggered || lastTriggeredHour !== hour)) {
        clearSessionList();
        sessionClearTriggered = true;
        lastTriggeredHour = hour; // Prevent retriggers within the same hour
    }

    // Reset flag after leaving the 28th or 58th minute
    if (minute !== 28 && minute !== 58) {
        sessionClearTriggered = false;
    }
}, 1000);

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Loading Session Window...");

    await applySavedFilters(); // ✅ Apply saved settings before fetching data
    await fetchAndUpdateTickers(); // ✅ Fetch tickers immediately on load

    // ✅ Listen for ticker updates
    window.sessionAPI.onTickerUpdate(() => {
        console.log("🔔 Lists update received, fetching latest data...");
        fetchAndUpdateTickers();
    });

    // ✅ Listen for news updates (new articles)
    window.sessionAPI.onNewsUpdate(({ ticker, newsItems }) => {
        console.log(`📰 Received ${newsItems.length} new articles for ${ticker}`);
        fetchAndUpdateTickers(); // ✅ Refresh tickers after receiving news
    });

    // ✅ Listen for settings updates globally
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);

        // ✅ Sync new settings globally
        window.settings = updatedSettings;

        // ✅ Re-apply filters & update UI
        await applySavedFilters();
        await fetchAndUpdateTickers();
    });
});

async function fetchAndUpdateTickers() {
    try {
        console.log("Fetching updated tickers...");

        // ✅ Fetch tickers from API
        const sessionData = await window.sessionAPI.getTickers("session");
        console.log("📊 Session Data:", sessionData);

        // ✅ Store previous state for comparison
        let oldTickersSessions = { ...prevTickersSessions };

        // ✅ Extract filters from settings
        const minPrice = window.settings.top?.minPrice ?? 0;
        const maxPrice = window.settings.top?.maxPrice ?? 0;
        const minFloat = window.settings.top?.minFloat ?? 0;
        const maxFloat = window.settings.top?.maxFloat ?? 0;
        const minScore = window.settings.top?.minScore ?? 0;
        const maxScore = window.settings.top?.maxScore ?? 0;
        const minVolume = window.settings.top?.minVolume ?? 0;
        const maxVolume = window.settings.top?.maxVolume ?? 0;
        const maxSessionLength = window.settings.top.sessionListLength ?? 10;

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
                        (minFloat === 0 || (ticker.Float !== null && ticker.Float >= minFloat)) && // ✅ Only check if Float exists
                        (maxFloat === 0 || (ticker.Float !== null && ticker.Float <= maxFloat)) && // ✅ Only check if Float exists
                        (minScore === 0 || ticker.Score >= minScore) &&
                        (maxScore === 0 || ticker.Score <= maxScore) &&
                        (minVolume === 0 || (ticker.Volume !== null && ticker.Volume >= minVolume)) && // ✅ Only check if Volume exists
                        (maxVolume === 0 || (ticker.Volume !== null && ticker.Volume <= maxVolume)) // ✅ Only check if Volume exists
                )
                .sort((a, b) => b.Score - a.Score);

        const filteredSession = applyFilters(sessionData);
        console.log("✅ Filtered Session Data:", filteredSession);

        // ✅ Limit number of displayed entries
        tickersSessions = filteredSession.slice(0, maxSessionLength);
        console.log("✅ Final Session List after max length:", tickersSessions);

        // ✅ Update previous ticker states
        prevTickersSessions = Object.fromEntries(tickersSessions.map((t) => [t.Symbol, t]));

        // 🔄 Fetch the latest settings before updating
        const latestSettings = await window.settingsAPI.get();
        if (!latestSettings || !latestSettings.news) {
            console.error("❌ Failed to fetch latest settings. Skipping update.");
            return;
        }

        // Extract new filtered tickers from filteredSession
        const newFilteredTickers = filteredSession.map((t) => t.Symbol);

        // Check if filtered tickers have changed
        const prevTickersArray = Object.keys(prevTickersSessions);
        const hasChanges = newFilteredTickers.length !== prevTickersArray.length || newFilteredTickers.some((ticker, i) => ticker !== prevTickersArray[i]);

        if (hasChanges) {
            console.log("🔄 Filtered tickers have changed. Updating UI...");

            // Update previous tickers to reflect the new state
            prevTickersSessions = Object.fromEntries(filteredSession.map((t) => [t.Symbol, t]));

            // Update the UI only (no settings update)
            updateTickersList(tickersSessions, "tickers-session", prevTickersSessions);
        }

        // ✅ Update UI
        updateTickersList(tickersSessions, "tickers-session", oldTickersSessions);

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
    tickersSessions = [];
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
    const listType = "session";
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

function clearSessionList() {
    console.log("🧹 Clear session button clicked! ✅ SENDING CLEAR EVENT...");

    // ✅ Ensure tickersSessions is an empty array instead of undefined
    tickersSessions = [];
    updateTickersList(tickersSessions ?? [], "tickers-session"); // ✅ Prevent null/undefined

    // ✅ Ask main process to clear session data
    window.sessionAPI.clearSession();

    // ✅ Delay fetch to ensure data clears before refreshing
    setTimeout(() => {
        fetchAndUpdateTickers();
    }, 1000);
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
    Score -= Math.floor(ticker.cumulativeDownChange || 0);

    const floatValue = parseHumanNumber(ticker.statistics?.floatShares);
    const volumeValue = ticker.Volume !== undefined ? parseVolumeValue(ticker.Volume) : 0;
    const fiveMinVolume = parseVolumeValue(ticker.fiveMinVolume);

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
        Score = Score * 1.5;
    }

    // New high
    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        Score = Score * 1.5;
    }

    // Float
    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        Score = Score * 1.2;
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        Score = Score * 1.15;
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

    // 5 min vol
    if (fiveMinVolume < 100_000) {
        Score = Score * 0.01;
    } else if (fiveMinVolume > 300_000) {
        Score = Score * 1.5;
    }

    // total volume
    if (volumeValue > 0) {
        // Score += Math.floor(volumeValue / 1_000_000) * 2;
    }

    return Math.floor(Score);
}

function getScoreBreakdown(ticker) {
    let breakdown = [];
    let Score = Math.floor(ticker.cumulativeUpChange || 0) - Math.floor(ticker.cumulativeDownChange || 0);
    Score -= Math.floor(ticker.cumulativeDownChange || 0);

    console.log(ticker)

    const floatValue = parseHumanNumber(ticker.statistics?.floatShares);
    const volumeValue = parseVolumeValue(ticker.Volume);
    const fiveMinVolume = parseVolumeValue(ticker.fiveMinVolume);

    // Add base up change to breakdown
    breakdown.push(`Base Up Change: ${ticker.cumulativeUpChange || 0}`);
    breakdown.push(`---------------------`);

    // Apply news multiplier if there is relevant news
    const blockList = window.settings.news?.blockList || [];
    const filteredNews = Array.isArray(ticker.News)
        ? ticker.News.filter((newsItem) => {
              const headline = newsItem.headline || "";
              return !blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
          })
        : [];

    if (filteredNews.length > 0) {
        Score *= 1.5;
        breakdown.push(`Has News: 1.5x multiplier`);
    }

    // Apply multiplier if the price is at the high of the day
    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        Score *= 1.5;
        breakdown.push("HOD: High of Day 1.5x multiplier");
    }

    // Apply float-based multipliers
    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        Score *= 1.2;
        breakdown.push(`Float <2M: 1.2x multiplier`);
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        Score *= 1.15;
        breakdown.push(`Float 2M-7.5M: 1.15x multiplier`);
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        Score *= 1.1;
        breakdown.push(`Float 7.5M-13M: 1.1x multiplier`);
    } else if (floatValue >= floatFiftyMillion && floatValue < floatHundredMillion) {
        Score *= 0.8;
        breakdown.push(`Float 65M-125M: 0.8x multiplier`);
    } else if (floatValue >= floatHundredMillion && floatValue < floatTwoHundredMillion) {
        Score *= 0.6;
        breakdown.push(`Float 125M-250M: 0.6x multiplier`);
    } else if (floatValue >= floatTwoHundredMillion && floatValue < floatFiveHundredMillion) {
        Score *= 0.4;
        breakdown.push(`Float 250M-600M: 0.4x multiplier`);
    } else if (floatValue >= floatFiveHundredMillion) {
        Score *= 0.1;
        breakdown.push(`Float 600M+: 0.1x multiplier`);
    }

    // Apply 5-minute volume-based multipliers
    if (fiveMinVolume < 100_000) {
        Score *= 0.01;
        breakdown.push(`Low volume: 0.01x multiplier`);
    } else if (fiveMinVolume > 300_000) {
        Score *= 1.5;
        breakdown.push(`High volume: 1.5x multiplier`);
    }

    // Optionally adjust Score based on total volume (currently commented out)
    if (volumeValue > 0) {
        // Score += Math.floor(volumeValue / 1_000_000) * 2;
    }

    // Add final Score to breakdown
    breakdown.push(`---------------------`);
    breakdown.push(`Final Score: ${Score}`);

    return breakdown.join("\n");
}

function getBonusesHTML(ticker) {
    let bonuses = [];
    let tooltipText = [];

    const floatValue = parseHumanNumber(ticker.statistics.floatShares);
    const volumeValue = parseVolumeValue(ticker.Volume);
    const fiveMinVolume = parseVolumeValue(ticker.fiveMinVolume);

    let blockList = window.settings.news?.blockList || [];
    let filteredNews = [];
    console.log("bonus checking ticke:", ticker);
    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = newsItem.headline || ""; // Ensure headline is a string
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
            return !isBlocked; // Keep only non-blocked headlines
        });
    }

    if (filteredNews.length > 0) {
        bonuses.push(`<span class="bonus news no-drag">📡</span>`);
        tooltipText.push(`📡: Has News`);
    }

    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        bonuses.push('<span class="bonus high no-drag">📈</span>');
        tooltipText.push("HOD: High of Day");
    }

    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        bonuses.push('<span class="bonus gold-float no-drag">1M</span>');
        tooltipText.push("2M: Float less than 2M");
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        bonuses.push('<span class="bonus silver-float no-drag">5M</span>');
        tooltipText.push("5M: Float between 2M-7.5M");
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        bonuses.push('<span class="bonus bronze-float no-drag">10M</span>');
        tooltipText.push("10M: Float between 7.5M-13M");
    } else if (floatValue >= floatFiftyMillion && floatValue < floatHundredMillion) {
        bonuses.push('<span class="bonus high-float no-drag">100M</span>');
        tooltipText.push("100M: Float between 65M-125M");
    } else if (floatValue >= floatHundredMillion && floatValue < floatTwoHundredMillion) {
        bonuses.push('<span class="bonus high-float no-drag">200M</span>');
        tooltipText.push("200M: Float between 125M-250M");
    } else if (floatValue >= floatTwoHundredMillion && floatValue < floatFiveHundredMillion) {
        bonuses.push('<span class="bonus high-float no-drag">500M</span>');
        tooltipText.push("500M: Float between 250M-500M");
    } else if (floatValue >= floatFiveHundredMillion) {
        bonuses.push('<span class="bonus high-float no-drag">B</span>');
        tooltipText.push("500M: Float more than 500M");
    }

    if (fiveMinVolume < 100_000) {
        bonuses.push('<span class="bonus low-volume no-drag">💤</span>');
        tooltipText.push("💤: Low Volume");
    } else if (fiveMinVolume > 300_000) {
        bonuses.push(`<span class="bonus high-volume no-drag">🔥</span>`);
        tooltipText.push("🔥: High Volume");
    }

    if (ticker.Industry && ticker.Industry === "Biotechnology") {
        bonuses.push('<span class="bonus bio no-drag">BIO</span>');
        tooltipText.push("BIO: Biotechnology stock");
    } else if (ticker.About && ticker.About.toLowerCase().includes("cannabis")) {
        bonuses.push('<span class="bonus cannabis no-drag">CAN</span>');
        tooltipText.push("CAN: Cannabis stock");
    }

    if (ticker.meta?.profile?.country && (ticker.meta.profile.country === "China" || ticker.meta.profile.country === "CN")) {
        bonuses.push('<span class="bonus cn no-drag">🇨🇳</span>');
        tooltipText.push("CN: Chinese based company");
    }

    if (ticker.meta?.profile?.country && (ticker.meta.profile.country === "HK" || ticker.meta.profile.country === "hk")) {
        bonuses.push('<span class="bonus hk no-drag">🇭🇰</span>');
        tooltipText.push("🇭🇰: Hong Kong based company");
    }

    console.log("ticker: ", ticker);

    if (bonuses.length === 0) {
        return ""; // No bonuses
    }

    return `<span class="bonus-container" title="${tooltipText.join("\n")}">${bonuses.join(" ")}</span>`;
}
