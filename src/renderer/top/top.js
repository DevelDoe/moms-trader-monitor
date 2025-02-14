// Local arrays for UI processing
let tickersDaily = [];
let tickersSessions = [];
let tickersAll = [];

// Store previous tickers for comparison
let prevTickersSessions = {};
let prevTickersDaily = {};

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Loading Top Window...");

    await applySavedFilters();
    await fetchAndUpdateTickers();

    addClearSessionButton();

    // ✅ Listen for ticker updates
    window.topAPI.onTickerUpdate(() => {
        console.log("🔔 Ticker update received, fetching latest data...");
        fetchAndUpdateTickers();
    });

    // ✅ Listen for settings updates
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);

        // ✅ Update `window.settings`
        window.settings = updatedSettings;

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
        const allData = await window.topAPI.getTickers("all"); // ✅ Fetch all tickers

        console.log("📊 Session Data:", sessionData);
        console.log("📊 Daily Data:", dailyData);
        console.log("📊 All Data:", dailyData);

        // ✅ Store previous state for comparison
        let oldTickersSessions = { ...prevTickersSessions };
        let oldTickersDaily = { ...prevTickersDaily };

        // ✅ Ensure filters are applied correctly
        const minPrice = window.settings.top?.minPrice ?? 0;
        const maxPrice = window.settings.top?.maxPrice ?? 1000;
        const maxSessionLength = window.settings.top?.lists?.session?.length ?? 10;
        const maxDailyLength = window.settings.top?.lists?.daily?.length ?? 10;

        console.log("Applying price filter:", { minPrice, maxPrice });
        console.log("Applying list limits:", { session: maxSessionLength, daily: maxDailyLength });

        // ✅ Apply price filtering
        const filteredSession = sessionData.filter((ticker) => ticker.Price >= minPrice && ticker.Price <= maxPrice);
        const filteredDaily = dailyData.filter((ticker) => ticker.Price >= minPrice && ticker.Price <= maxPrice);
        const filteredAll = allData.filter((ticker) => ticker.Price >= minPrice && ticker.Price <= maxPrice);

        // ✅ Calculate scores and sort tickers
        tickersSessions = filteredSession
            .map((ticker) => ({
                ...ticker,
                score: calculateScore(ticker),
            }))
            .sort((a, b) => b.score - a.score); // Sort descending by score

        tickersDaily = filteredDaily
            .map((ticker) => ({
                ...ticker,
                score: calculateScore(ticker),
            }))
            .sort((a, b) => b.score - a.score);
        tickersAll = filteredAll
            .map((ticker) => ({
                ...ticker,
                score: calculateScore(ticker),
            }))
            .sort((a, b) => b.score - a.score); // ✅ Sorting all tickers by score

        // ✅ Limit number of displayed entries
        tickersSessions = tickersSessions.slice(0, maxSessionLength);
        tickersDaily = tickersDaily.slice(0, maxDailyLength);

        console.log("✅ Final Session List:", tickersSessions);
        console.log("✅ Final Daily List:", tickersDaily);

        // ✅ Update previous ticker states
        prevTickersSessions = Object.fromEntries(tickersSessions.map((t) => [t.Symbol, t]));
        prevTickersDaily = Object.fromEntries(tickersDaily.map((t) => [t.Symbol, t]));

        // ✅ Update UI
        updateTickersTable(tickersSessions, "tickers-session", oldTickersSessions);
        updateTickersTable(tickersDaily, "tickers-daily", oldTickersDaily);
        updateTickersTable(tickersAll, "tickers-all", {}); // ✅ No need to compare previous state

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

    tableBody.innerHTML = ""; // ✅ Clear the table first

    // ✅ Determine which columns should be displayed
    const listType = tableId.includes("session") ? "session" : "daily";
    const enabledColumns = window.settings.top.lists?.[listType] || {};

    if (tickers.length === 0) {
        console.warn(`No data available for ${listType}!`);
        return;
    }

    const allColumns =
        tableId === "tickers-all"
            ? [...new Set(tickers.flatMap((t) => Object.keys(t)).concat("Bonuses"))] // ✅ Allow all attributes
            : [...new Set([...Object.keys(tickers[0]), "Bonuses"])].filter((key) => enabledColumns[key] || key === "Symbol" || key === "score" || key === "Bonuses");

    // ✅ Generate the header dynamically
    tableHead.innerHTML = "<tr>" + allColumns.map((col) => `<th>${col}</th>`).join("") + "</tr>";

    // ✅ Populate table rows
    tickers.forEach((ticker) => {
        const row = document.createElement("tr");

        // 🔍 **Detect new or updated tickers**
        const prevTicker = prevTickers[ticker.Symbol];

        let isNew = !prevTicker; // Not found in previous state
        let isUpdated = prevTicker && (prevTicker.Price !== ticker.Price || prevTicker.Count !== ticker.Count || prevTicker.score !== ticker.score);

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
                cell.className = "symbol";
                cell.addEventListener("click", () => {
                    navigator.clipboard.writeText(ticker[key]);
                    console.log(`📋 Copied ${ticker[key]} to clipboard!`);
                    updateActiveTicker(ticker); // ✅ UPDATED: Set clicked ticker as active
                });
            } else if (key === "score") {
                const scoreBreakdown = getScoreBreakdown(ticker);
                cell.textContent = ticker[key];
                cell.className = "score-tooltip";
                cell.setAttribute("title", scoreBreakdown);
            } else if (key === "Bonuses") {
                // ✅ Insert dynamically styled bonus symbols
                cell.innerHTML = getBonusesHTML(ticker);
            } else {
                cell.textContent = ticker[key] ?? "-"; // ✅ Handle missing data gracefully
            }

            row.appendChild(cell);
        });

        tableBody.appendChild(row);
    });

    console.log(`✅ Finished updating table: ${tableId}`);
}

// Clear session
function clearSessionList() {
    console.log("🧹 Clear session button clicked!");

    // ✅ Clear UI immediately
    tickersSessions = [];
    updateTickersTable(tickersSessions, "tickers-session");

    // ✅ Ask main process to clear session data
    window.topAPI.clearSession();

    setTimeout(() => {
        fetchAndUpdateTickers(); // ✅ Refresh tickers AFTER clearing session
    }, 1000);
}
function addClearSessionButton() {
    const btn = document.createElement("button");
    btn.id = "clear-session-btn";
    btn.textContent = "🧹 New Session";
    btn.addEventListener("click", clearSessionList);

    // ✅ Insert the button before session tickers table
    const sessionTable = document.getElementById("tickers-session");
    sessionTable.parentNode.insertBefore(btn, sessionTable);
}

// Scoring System
function parseFloatValue(floatStr) {
    if (!floatStr) return 0;
    let sanitized = floatStr.replace(/[^0-9.]/g, "");
    let value = parseFloat(sanitized) || 0;
    if (floatStr.includes("B")) value *= 1000;
    if (floatStr.includes("K")) value /= 1000;
    return value;
}
function calculateScore(ticker) {
    let score = ticker.count;

    if (ticker.HighOfDay) score += 20;

    if (ticker.hasNews) score += 30;

    let floatValue = parseFloatValue(ticker.Float);

    if (floatValue > 0 && floatValue < 1) score += 20;
    else if (floatValue > 1 && floatValue < 5) score += 15;
    else if (floatValue > 5 && floatValue < 10) score += 10;
    else if (floatValue > 10 && floatValue < 50) score += 0;
    else if (floatValue > 50 && floatValue < 100) score -= 10;
    else if (floatValue > 100 && floatValue < 200) score -= 20;
    else if (floatValue > 200 && floatValue < 500) score -= 30;
    else if (floatValue > 500) score -= 50;
    return score;
}

function getScoreBreakdown(ticker) {
    let breakdown = [];
    let score = ticker.count;

    breakdown.push(`Base Score (Count): ${ticker.count}`);

    if (ticker.HighOfDay) {
        score += 20;
        breakdown.push(`+20 (High of Day)`);
    }

    if (ticker.hasNews) {
        score += 40;
        breakdown.push(`+40 (High of Day)`);
    }

    let floatValue = parseFloatValue(ticker.Float);
    if (floatValue > 0 && floatValue < 1) {
        score += 20;
        breakdown.push(`+20 (Float < 1M)`);
    } else if (floatValue > 1 && floatValue < 5) {
        score += 15;
        breakdown.push(`+15 (Float 1M - 5M)`);
    } else if (floatValue > 5 && floatValue < 10) {
        score += 10;
        breakdown.push(`+10 (Float 5M - 10M)`);
    } else if (floatValue > 10 && floatValue < 50) {
        breakdown.push(`+0 (Float 10M - 50M)`);
    } else if (floatValue > 50 && floatValue < 100) {
        score -= 10;
        breakdown.push(`-10 (Float 50M - 100M)`);
    } else if (floatValue > 100 && floatValue < 200) {
        score -= 20;
        breakdown.push(`-20 (Float 100M - 500M)`);
    } else if (floatValue > 200 && floatValue < 500) {
        score -= 30;
        breakdown.push(`-30 (Float 200M - 500M)`);
    } else if (floatValue > 500) {
        score -= 50;
        breakdown.push(`-50 (Float > 500M)`);
    }

    breakdown.push(`Final Score: ${score}`);
    return breakdown.join("\n"); // ✅ Creates a tooltip with newlines for readability
}

// ✅ Find the ticker from tickersDaily only (ensures all attributes exist)
function findTickerBySymbol(symbol) {
    const foundTicker = tickersDaily.find((ticker) => ticker.Symbol === symbol);

    if (!foundTicker) {
        console.warn(`❌ Ticker ${symbol} not found in tickersDaily!`);
    }

    return foundTicker;
}

// ✅ Update the Active Ticker Display
function updateActiveTicker(ticker) {
    const row = document.getElementById("active-ticker-row");
    if (!row) return;

    row.innerHTML = `
        <td>${ticker.Symbol}</td>
        <td>${ticker.Price}</td>
        <td>${ticker.ChangePercent}</td>
        <td>${ticker.FiveM}</td>
        <td>${ticker.Float}</td>
        <td>${ticker.Volume}</td>
        <td>${ticker.SprPercent}</td>
        <td>${ticker.Time}</td>
        <td>${ticker.HighOfDay}</td>
        <td>${ticker.count}</td>
        <td>${ticker.hasNews}</td>
        <td>${ticker.score}</td>
    `;

    row.style.background = "rgba(34, 139, 34, 0.4)"; // ✅ Highlight change
    setTimeout(() => {
        row.style.background = "rgba(34, 139, 34, 0.2)"; // ✅ Fade back
    }, 1000);
}

function getBonusesHTML(ticker) {
    let bonuses = [];
    let tooltipText = [];

    if (ticker.hasNews) {
        bonuses.push('<span class="bonus news">N</span>');
        tooltipText.push("N: Has News"); // Tooltip text
    }
    if (ticker.HighOfDay) {
        bonuses.push('<span class="bonus high">H</span>');
        tooltipText.push("H: High of Day");
    }
    if (parseFloatValue(ticker.Float) > 0 && parseFloatValue(ticker.Float) < 1) {
        bonuses.push('<span class="bonus gold-float">1M</span>');
        tooltipText.push("L: Float less than 1M");
    } else if (parseFloatValue(ticker.Float) > 1 && parseFloatValue(ticker.Float) < 5) {
        bonuses.push('<span class="bonus silver-float">5M</span>');
        tooltipText.push("L: Float less than 5M");
    } else if (parseFloatValue(ticker.Float) > 5 && parseFloatValue(ticker.Float) < 10) {
        bonuses.push('<span class="bonus bronse-float">10M</span>');
        tooltipText.push("L: less than 10M");
    }
    if (parseFloatValue(ticker.Volume) > 10) {
        bonuses.push('<span class="bonus volume">V</span>');
        tooltipText.push("V: High Volume");
    }

    if (bonuses.length === 0) {
        return "-"; // No bonuses
    }

    return `<span class="bonus-container" title="${tooltipText.join("\n")}">
                ${bonuses.join(" ")}
            </span>`;
}
