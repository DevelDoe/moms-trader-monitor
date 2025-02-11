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

        console.log("Applying price filter:", { minPrice, maxPrice });

        // ✅ Apply price filtering AFTER fetching
        const filteredSession = sessionData.filter((ticker) => ticker.Price >= minPrice && ticker.Price <= maxPrice);
        const filteredDaily = dailyData.filter((ticker) => ticker.Price >= minPrice && ticker.Price <= maxPrice);

        // ✅ Clear and update lists
        tickersSessions = filteredSession.map((ticker) => ({
            ...ticker,
            score: calculateScore(ticker),
        }));

        tickersDaily = filteredDaily.map((ticker) => ({
            ...ticker,
            score: calculateScore(ticker),
        }));

        // ✅ Sort and update UI
        tickersSessions.sort((a, b) => b.score - a.score);
        tickersDaily.sort((a, b) => b.score - a.score);

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
    const enabledColumns = window.settings.top.cells?.[listType] || {};

    console.log(`🟢 Enabled Columns for ${listType}:`, enabledColumns);

    if (tickers.length === 0) {
        console.warn(`No data available for ${listType}!`);
        return;
    }

    // ✅ Get the keys from the first ticker, ensuring "Symbol", "Count", and "Score" are **always included**
    const allColumns = Object.keys(tickers[0]).filter(
        (key) => enabledColumns[key] || key === "Symbol" || key === "count" || key === "score"
    );

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
                cell.style.textDecoration = "underline";
                cell.addEventListener("click", () => {
                    navigator.clipboard.writeText(ticker[key]);
                    console.log(`📋 Copied ${ticker[key]} to clipboard!`);
                });
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
    if (floatValue < 1) score += 20;
    else if (floatValue < 5) score += 15;
    else if (floatValue < 10) score += 10;
    else if (floatValue < 50) score += 5;
    else if (floatValue < 100) score += 0;
    else if (floatValue > 100) score -= 10;
    else if (floatValue > 500) score -= 20;
    return score;
}
