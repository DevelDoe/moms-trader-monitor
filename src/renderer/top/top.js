// Local arrays for UI processing
let tickersDaily = [];
let tickersSessions = [];
let tickersAll = [];

// Store previous tickers for comparison
let prevTickersSessions = {};
let prevTickersDaily = {};

// define floats
const floatOneMillionHigh = 2_000_000;
const floatFiveMillion = 7_500_000;
const floatTenMillion = 13_000_000;
const floatFiftyMillion = 65_000_000;
const floatHundredMillion = 125_000_000;
const floatTwoHundredMillion = 250_000_000;
const floatFiveHundredMillion = 600_000_000;

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Loading Top Window...");

    await applySavedFilters(); // ✅ Apply saved settings before fetching data
    await fetchAndUpdateTickers(); // ✅ Fetch tickers immediately on load

    const btn = document.createElement("button");
    btn.id = "clear-session-btn";
    btn.textContent = "New Session 🧹";
    btn.className = "no-drag";
    btn.addEventListener("click", clearSessionList);

    // ✅ Insert the button before session tickers table
    const sessionTable = document.getElementById("tickers-session");
    sessionTable.parentNode.insertBefore(btn, sessionTable);

    // ✅ Listen for ticker updates
    window.topAPI.onTickerUpdate(() => {
        console.log("🔔 Ticker update received, fetching latest data...");
        fetchAndUpdateTickers();
    });

    // ✅ Listen for news updates (new articles)
    window.topAPI.onNewsUpdate(({ ticker, newsItems }) => {
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
        const sessionData = await window.topAPI.getTickers("session");
        const dailyData = await window.topAPI.getTickers("daily");
        const allData = await window.topAPI.getTickers("all");

        console.log("📊 Session Data:", sessionData);
        console.log("📊 Daily Data:", dailyData);
        console.log("📊 All Data:", allData);

        // ✅ Store previous state for comparison
        let oldTickersSessions = { ...prevTickersSessions };
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
        const maxSessionLength = window.settings.top?.lists?.session?.length ?? 10;
        const maxDailyLength = window.settings.top?.lists?.daily?.length ?? 10;

        console.log("Applying filters:", { minPrice, maxPrice, minFloat, maxFloat, minScore, maxScore, minVolume, maxVolume });

        // ✅ Apply filters to each dataset
        const applyFilters = (data) =>
            data
                .map((ticker) => ({ ...ticker, Score: calculateScore(ticker) }))
                .filter(
                    (ticker) =>
                        (minPrice === 0 || ticker.Price >= minPrice) &&
                        (maxPrice === 0 || ticker.Price <= maxPrice) &&
                        (minFloat === 0 || parseFloatValue(ticker.Float) >= minFloat) &&
                        (maxFloat === 0 || parseFloatValue(ticker.Float) <= maxFloat) &&
                        (minScore === 0 || ticker.Score >= minScore) &&
                        (maxScore === 0 || ticker.Score <= maxScore) &&
                        (minVolume === 0 || parseVolumeValue(ticker.Volume) >= minVolume) &&
                        (maxVolume === 0 || parseVolumeValue(ticker.Volume) <= maxVolume)
                )
                .sort((a, b) => b.Score - a.Score);

        const filteredSession = applyFilters(sessionData);
        const filteredDaily = applyFilters(dailyData);
        const filteredAll = applyFilters(allData);

        console.log("✅ Filtered Session Data:", filteredSession);
        console.log("✅ Filtered Daily Data:", filteredDaily);

        // ✅ Limit number of displayed entries
        tickersSessions = filteredSession.slice(0, maxSessionLength);
        tickersDaily = filteredDaily.slice(0, maxDailyLength);

        console.log("✅ Final Session List:", tickersSessions);
        console.log("✅ Final Daily List:", tickersDaily);

        // ✅ Update previous ticker states
        prevTickersSessions = Object.fromEntries(tickersSessions.map((t) => [t.Symbol, t]));
        prevTickersDaily = Object.fromEntries(tickersDaily.map((t) => [t.Symbol, t]));

        // 🔄 Fetch the latest settings before updating
        const latestSettings = await window.settingsAPI.get();
        if (!latestSettings || !latestSettings.news) {
            console.error("❌ Failed to fetch latest settings. Skipping update.");
            return;
        }

        // ✅ Extract new filtered tickers
        const newFilteredTickers = filteredAll.map((t) => t.Symbol);

        // ✅ Check if filtered tickers have changed
        if (JSON.stringify(newFilteredTickers) !== JSON.stringify(latestSettings.news.filteredTickers)) {
            console.log("🔄 Updating filtered tickers in settings...");

            // ✅ Preserve other settings, only update `filteredTickers`
            const updatedSettings = {
                ...latestSettings,
                news: {
                    ...latestSettings.news,
                    filteredTickers: newFilteredTickers,
                },
            };

            // ✅ Save updated settings
            await window.settingsAPI.update(updatedSettings);

            // ✅ Keep local settings in sync
            window.settings = updatedSettings;
            console.log("✅ Saved filtered tickers to settings.news.filteredTickers:", updatedSettings.news.filteredTickers);
        }

        // ✅ Update UI
        updateTickersTable(tickersSessions, "tickers-session", oldTickersSessions);
        updateTickersTable(tickersDaily, "tickers-daily", oldTickersDaily);
        updateTickersTable(filteredAll, "tickers-all", {}); // ✅ No need to compare previous state

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
    tickersDaily = [];
}

function updateTickersTable(tickers, tableId, prevTickers) {
    const table = document.getElementById(tableId);
    const tableHead = table.querySelector("thead");
    const tableBody = table.querySelector("tbody");

    // ✅ Ensure tickers array is not empty before calling Object.keys
    if (tickers.length === 0) {
        console.warn(`⚠️ No tickers available for ${tableId}`);

        tableHead.innerHTML = "<tr><th>No Data Available</th></tr>";
        tableBody.innerHTML = ""; // ✅ Clear existing rows

        return;
    }

    // 🔄 **Clear table before updating**
    tableBody.innerHTML = ""; // ✅ Prevent duplicates when filtering

    // ✅ Determine which columns should be displayed
    const listType = tableId.includes("session") ? "session" : "daily";
    const enabledColumns = window.settings.top.lists?.[listType] || {};

    const allColumns =
        tableId === "tickers-all"
            ? [...new Set(tickers.flatMap((t) => Object.keys(t)))].filter((key) => key !== "Bonuses" && key !== "Time")
            : [...new Set([...Object.keys(tickers[0]), "Bonuses"])].filter((key) => enabledColumns[key] || key === "Symbol");

    // ✅ Generate the header dynamically
    // tableHead.innerHTML = "<tr>" + allColumns.map((col) => `<th>${col}</th>`).join("") + "</tr>";

    // ✅ Populate table rows
    tickers.forEach((ticker) => {
        const row = document.createElement("tr");

        // 🔍 **Detect new or updated tickers**
        const prevTicker = prevTickers[ticker.Symbol];

        let isNew = !prevTicker; // Not found in previous state
        let isUpdated = prevTicker && (prevTicker.Price !== ticker.Price || prevTicker.Count !== ticker.Count || prevTicker.Score !== ticker.Score);

        if (isNew) {
            row.classList.add("highlight-new"); // 🟢 Apply new ticker highlight
        } else if (isUpdated) {
            row.classList.add("highlight-updated"); // 🟠 Apply update highlight
        }

        allColumns.forEach((key) => {
            const cell = document.createElement("td");

            if (key === "Symbol") {
                cell.textContent = ticker[key];
                cell.style.cursor = "pointer";
                cell.className = "symbol no-drag";
                cell.title = "A ticker symbol is a short, unique identifier for a publicly traded company.";
                cell.addEventListener("click", () => {
                    navigator.clipboard.writeText(ticker[key]);
                    console.log(`📋 Copied ${ticker[key]} to clipboard!`);
                    console.log("setting active ticker:", ticker.Symbol)
                    window.activeAPI.setActiveTicker(ticker.Symbol);
                });
            } else if (key === "Score") {
                const ScoreBreakdown = getScoreBreakdown(ticker);
                cell.textContent = ticker[key];
                cell.className = "Score-tooltip no-drag";
                cell.setAttribute("title", ScoreBreakdown);
            } else if (key === "Bonuses") {
                // ✅ Insert dynamically styled bonus symbols
                cell.innerHTML = getBonusesHTML(ticker);
            } else if (key === "News") {
                let value = ticker[key];
                let blockList = window.settings.news?.blockList || [];
                let filteredNews = [];

                if (value.length > 0) {
                    filteredNews = value.filter((newsItem) => {
                        const headline = newsItem.headline || ""; // Ensure headline is a string
                        const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
                        return !isBlocked; // Keep only non-blocked headlines
                    });
                }

                if (filteredNews.length > 0) {
                    filteredNews = `📰`;
                } else {
                    filteredNews = "-"; // ✅ Show dash for missing values
                }

                cell.textContent = filteredNews;
            } else {
                cell.textContent = ticker[key];
            }


        });

        tableBody.appendChild(row);
    });

    console.log(`✅ Finished updating table: ${tableId}`);
}

function clearSessionList() {
    console.log("🧹 Clear session button clicked! ✅ SENDING CLEAR EVENT...");

    // ✅ Ensure tickersSessions is an empty array instead of undefined
    tickersSessions = [];
    updateTickersTable(tickersSessions ?? [], "tickers-session"); // ✅ Prevent null/undefined

    // ✅ Ask main process to clear session data
    window.topAPI.clearSession();

    // ✅ Delay fetch to ensure data clears before refreshing
    setTimeout(() => {
        fetchAndUpdateTickers();
    }, 1000);
}

function parseFloatValue(floatStr) {
    if (floatStr == null) return 0; // ✅ Ensure null/undefined returns 0
    let str = String(floatStr).trim(); // ✅ Convert to string and remove spaces
    let sanitized = str.replace(/[^0-9.]/g, ""); // ✅ Remove all non-numeric characters
    let value = parseFloat(sanitized) || 0;

    if (str.toUpperCase().includes("B")) value *= 1_000_000_000; // ✅ Convert "B" to billions
    if (str.toUpperCase().includes("M")) value *= 1_000_000; // ✅ Convert "M" to millions
    if (str.toUpperCase().includes("K")) value *= 1_000; // ✅ Convert "K" to thousands

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
    let Score = ticker.Count || 0; // ✅ Ensure Count is always a number
    const floatValue = parseFloatValue(ticker.Float); // ✅ Convert Float to a real number
    const volumeValue = parseVolumeValue(ticker.Volume); // ✅ Convert Volume to a real number

    if (ticker.HighOfDay) Score += 20;

    let blockList = window.settings.news?.blockList || [];
    let filteredNews = [];
    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = newsItem.headline || ""; // Ensure headline is a string
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
            return !isBlocked; // Keep only non-blocked headlines
        });
    }

    // ✅ Add score only if there are valid (non-blocked) news items
    if (filteredNews.length > 0) {
        Score += 40;
    }

    // ✅ Float Size Bonuses & Penalties
    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        Score += 20; // 🔥 Strong bonus for ultra-low float
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        Score += 15;
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        Score += 10;
    } else if (floatValue >= floatTenMillion && floatValue < floatFiftyMillion) {
        Score += 0; // No change
    } else if (floatValue >= floatFiftyMillion && floatValue < floatHundredMillion) {
        Score -= 10; // Small penalty for large float
    } else if (floatValue >= floatHundredMillion && floatValue < floatTwoHundredMillion) {
        Score -= 20;
    } else if (floatValue >= floatTwoHundredMillion && floatValue < floatFiveHundredMillion) {
        Score -= 30;
    } else if (floatValue >= floatFiveHundredMillion) {
        Score -= 100; // 🚨 Heavy penalty for massive float
    }

    // ✅ Volume Adjustment
    if (volumeValue < 300_000) {
        Score -= 20; // 🛑 Low volume is a bad sign
    }

    // ✅ Bonus: 5 points per million in volume
    Score += Math.floor(volumeValue / 1_000_000) * 2;

    return Score;
}

function getScoreBreakdown(ticker) {
    let breakdown = [];
    let Score = ticker.Count || 0; // ✅ Ensure Count is always a number
    const floatValue = parseFloatValue(ticker.Float); // ✅ Convert Float to real number
    const volumeValue = parseVolumeValue(ticker.Volume); // ✅ Convert Volume to real number

    breakdown.push(`Base Count: ${ticker.Count}`);
    breakdown.push(`---------------------`);

    if (ticker.HighOfDay) {
        Score += 20;
        breakdown.push(`High of Day: +20`);
    }

    let blockList = window.settings.news?.blockList || [];
    let filteredNews = [];
    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = newsItem.headline || ""; // Ensure headline is a string
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
            return !isBlocked; // Keep only non-blocked headlines
        });
    }

    if (filteredNews.length > 0) {
        Score += 40;
        breakdown.push(`Has News: +40`);
    }

    if (volumeValue < 300_000) {
        Score -= 20;
        breakdown.push(`Volume < 300K: -20`);
    }

    // ✅ Bonus: 5 points per million in volume
    const volumeBonus = Math.floor(volumeValue / 1_000_000) * 2;
    if (volumeBonus > 0) {
        Score += volumeBonus;
        breakdown.push(`Volume Bonus (${Math.floor(volumeValue / 1_000_000)}M): +${volumeBonus}`);
    }

    // ✅ Float Size Bonuses & Penalties
    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        Score += 20;
        breakdown.push(`Float <2M: +20`);
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        Score += 15;
        breakdown.push(`Float 2M-7.5M: +15`);
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        Score += 10;
        breakdown.push(`Float 7.5M-13M: +10`);
    } else if (floatValue >= floatFiftyMillion && floatValue < floatHundredMillion) {
        Score -= 10;
        breakdown.push(`Float 65M-125M: -10`);
    } else if (floatValue >= floatHundredMillion && floatValue < floatTwoHundredMillion) {
        Score -= 20;
        breakdown.push(`Float 125M-250M: -20`);
    } else if (floatValue >= floatTwoHundredMillion && floatValue < floatFiveHundredMillion) {
        Score -= 30;
        breakdown.push(`Float 250M-600M: -30`);
    } else if (floatValue >= floatFiveHundredMillion) {
        Score -= 100;
        breakdown.push(`Float 600M+: -100`);
    }

    breakdown.push(`---------------------`);
    breakdown.push(`Final Score: ${Score}`);

    return breakdown.join("\n");
}

/** Generates HTML bonus indicators and tooltips for a stock ticker based on various criteria.
 *
 * @param {Object} ticker - The stock ticker object containing financial/metadata properties
 * @param {string} ticker.Float - Market float (e.g., "2.5M")
 * @param {number|string} ticker.Volume - Trading volume
 * @param {Array} ticker.News - Array of news items
 * @param {boolean} ticker.HighOfDay - Indicates if at daily high
 * @param {Object} [ticker.meta] - Optional metadata object
 * @returns {string} HTML string containing bonus indicators or "-" if no bonuses
 *
 * @example
 * // Returns HTML with HOD and BIO badges
 * getBonusesHTML({
 *   Float: "1.8M",
 *   Volume: "450000",
 *   HighOfDay: true,
 *   meta: { Industry: "Biotechnology" }
 * });
 *
 * Key Features:
 * - News Filtering: Excludes blocked headlines from settings.news.blockList
 * - Float Bonuses: Categorizes by market float size (1M-500M+)
 * - Volume Indicators: Low volume (<300K) and volume-based bonuses
 * - Special Categories: Biotech industry and Chinese stock markers
 * - Real-time Signals: High-of-day indicator
 *
 * Visual Elements:
 * - Color-coded badges (gold-float, silver-float, bio, cn, etc.)
 * - Multi-line tooltips explaining badge meanings
 * - Non-draggable elements for better UX
 *
 * Dependencies:
 * - parseFloatValue() - Converts formatted strings to numeric values
 * - parseVolumeValue() - Normalizes volume input
 * - window.settings.news.blockList - User-configured news filters
 */
function getBonusesHTML(ticker) {
    let bonuses = [];
    let tooltipText = [];

    const floatValue = parseFloatValue(ticker.Float); // ✅ Convert "2.5M" -> 2,500,000
    const volumeValue = parseVolumeValue(ticker.Volume); // ✅ Ensure Volume is converted

    let blockList = window.settings.news?.blockList || [];
    let filteredNews = [];
    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = newsItem.headline || ""; // Ensure headline is a string
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
            return !isBlocked; // Keep only non-blocked headlines
        });
    }

    if (filteredNews.length > 0) {
        bonuses.push(`<span class="bonus news no-drag">CAT</span>`);
        tooltipText.push(`CAT: Has News`);
    }

    if (ticker.HighOfDay) {
        bonuses.push('<span class="bonus high no-drag">HOD</span>');
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

    if (volumeValue < 300_000) {
        bonuses.push('<span class="bonus low-volume no-drag">V-</span>');
        tooltipText.push("V: Low Volume (<300K)");
    }

    const volumeBonus = Math.floor(volumeValue / 1_000_000) * 2;
    if (volumeBonus > 0) {
        bonuses.push(`<span class="bonus high-volume no-drag">V${Math.floor(volumeValue / 1_000_000)}</span>`);
        tooltipText.push(`V${Math.floor(volumeValue / 1_000_000)}: Volume Bonus (${Math.floor(volumeValue / 1_000_000)}M)`);
    }

    if (ticker.meta) {
        if (ticker.meta.Industry === "Biotechnology") {
            bonuses.push('<span class="bonus bio no-drag">BIO</span>');
            tooltipText.push("BIO: Biotechnology stock");
        }
        if (ticker.meta.Country === "China" || ticker.meta.Country === "CN") {
            bonuses.push('<span class="bonus cn no-drag">CN</span>');
            tooltipText.push("CN: Chinese Stock");
        }
    }

    if (bonuses.length === 0) {
        return "-"; // No bonuses
    }

    return `<span class="bonus-container" title="${tooltipText.join("\n")}">
                ${bonuses.join(" ")}
            </span>`;
}
