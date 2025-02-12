// Local arrays for UI processing
let tickersDaily = [];
let tickersSessions = [];

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Loading Top Window...");

    await applySavedFilters(); // ✅ Apply saved settings before fetching tickers
    await fetchAndUpdateTickers(); // ✅ Fetch tickers after applying filters

    addClearSessionButton();

    // ✅ Listen for updates
    window.topAPI.onTickerUpdate(() => {
        console.log("🔔 Ticker update received, fetching latest data...");
        fetchAndUpdateTickers();
    });

    // ✅ Listen for filter updates from settings
    window.topAPI.onFilterUpdate(async () => {
        console.log("🎯 Filter settings updated, applying new filters...");

        await applySavedFilters(); // ✅ Update settings and clear lists
        await fetchAndUpdateTickers(); // ✅ Immediately re-fetch tickers with new filters
    });
});

async function fetchAndUpdateTickers() {
    try {
        console.log("Fetching updated tickers...");

        // ✅ Fetch tickers from API
        const sessionData = await window.topAPI.getTickers("session");
        const dailyData = await window.topAPI.getTickers("daily");

        console.log("Session Data:", sessionData);
        console.log("📊 Daily Data:", dailyData);

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

        // ✅ Limit number of displayed entries
        tickersSessions = tickersSessions.slice(0, maxSessionLength);
        tickersDaily = tickersDaily.slice(0, maxDailyLength);

        console.log("✅ Final Session List:", tickersSessions);
        console.log("✅ Final Daily List:", tickersDaily);

        updateTickersTable(tickersSessions, "tickers-session");
        updateTickersTable(tickersDaily, "tickers-daily");

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

function updateTickersTable(tickers, tableId) {
    const table = document.getElementById(tableId);
    const tableHead = table.querySelector("thead");
    const tableBody = table.querySelector("tbody");

    tableBody.innerHTML = ""; // ✅ Clear the table first

    // ✅ Determine which columns should be displayed
    const listType = tableId.includes("session") ? "session" : "daily";
    const enabledColumns = window.settings.top.lists?.[listType] || {};

    console.log(`🟢 Enabled Columns for ${listType}:`, enabledColumns);

    if (tickers.length === 0) {
        console.warn(`No data available for ${listType}!`);
        return;
    }

    // ✅ Get the keys from the first ticker, ensuring "Symbol", "Count", and "Score" are **always included**
    const allColumns = Object.keys(tickers[0]).filter((key) => enabledColumns[key] || key === "Symbol" || key === "score");

    console.log(`📌 Final Columns for ${tableId}:`, allColumns);

    // ✅ Generate the header dynamically
    tableHead.innerHTML = "<tr>" + allColumns.map((col) => `<th>${col}</th>`).join("") + "</tr>";

    // ✅ Populate table rows
    tickers.forEach((ticker) => {
        const row = document.createElement("tr");

        allColumns.forEach((key) => {
            const cell = document.createElement("td");

            // ✅ Make "Symbol" Clickable (Copy to Clipboard)
            if (key === "Symbol") {
                cell.textContent = ticker[key];
                cell.style.cursor = "pointer";
                cell.className = "symbol"
                cell.addEventListener("click", () => {
                    navigator.clipboard.writeText(ticker[key]);
                    console.log(`📋 Copied ${ticker[key]} to clipboard!`);
                });
            } else if (key === "score") {
                // ✅ Add tooltip with score breakdown
                const scoreBreakdown = getScoreBreakdown(ticker);
                cell.textContent = ticker[key];
                cell.className = "score-tooltip";
                cell.setAttribute("title", scoreBreakdown);
            } else {
                cell.textContent = ticker[key];
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
    btn.textContent = "🧹 Clear Session";
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
    let floatValue = parseFloatValue(ticker.Float);
    if (floatValue < 1) score += 30;
    else if (floatValue > 1 && floatValue < 5) score += 20;
    else if (floatValue > 5 && floatValue < 10) score += 10;
    else if (floatValue > 10 && floatValue < 50) score += 0;
    else if (floatValue > 50 && floatValue < 100) score -= 10;
    else if (floatValue > 100 && floatValue < 500) score -= 20;
    else if (floatValue > 500) score -= 30;
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

    let floatValue = parseFloatValue(ticker.Float);
    if (floatValue < 1) {
        score += 30;
        breakdown.push(`+30 (Float < 1M)`);
    } else if (floatValue > 1 && floatValue < 5) {
        score += 20;
        breakdown.push(`+20 (Float 1M - 5M)`);
    } else if (floatValue > 5 && floatValue < 10) {
        score += 10;
        breakdown.push(`+10 (Float 5M - 10M)`);
    } else if (floatValue > 10 && floatValue < 50) {
        breakdown.push(`+0 (Float 10M - 50M)`);
    } else if (floatValue > 50 && floatValue < 100) {
        score -= 10;
        breakdown.push(`-10 (Float 50M - 100M)`);
    } else if (floatValue > 100 && floatValue < 500) {
        score -= 20;
        breakdown.push(`-20 (Float 100M - 500M)`);
    } else if (floatValue > 500) {
        score -= 30;
        breakdown.push(`-30 (Float > 500M)`);
    }

    breakdown.push(`Final Score: ${score}`);
    return breakdown.join("\n"); // ✅ Creates a tooltip with newlines for readability
}