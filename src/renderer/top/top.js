// Local arrays for UI processing
let tickersDaily = [];
let tickersSessions = [];

/**
 * Updates the tickers table dynamically.
 */
function updateTickersTable(tickers, tableId) {
    const tableBody = document.querySelector(`#${tableId} tbody`);
    tableBody.innerHTML = ""; // ✅ Clear the table first
    tickers.forEach((ticker) => {
        const row = document.createElement("tr");

        Object.entries(ticker).forEach(([key, value]) => {
            const cell = document.createElement("td");

            // ✅ Make Symbol Clickable (Copy to Clipboard)
            if (key === "Symbol") {
                cell.textContent = value;
                cell.style.cursor = "pointer";
                cell.style.textDecoration = "underline";
                cell.addEventListener("click", () => {
                    navigator.clipboard.writeText(value);
                    console.log(`📋 Copied ${value} to clipboard!`);
                });
            } else {
                cell.textContent = value;
            }

            row.appendChild(cell);
        });

        tableBody.appendChild(row);
    });
}

/**
 * Parses a float string (e.g., '4.5M', '1B') and converts to a numeric value.
 */
function parseFloatValue(floatStr) {
    if (!floatStr) return 0;
    let sanitized = floatStr.replace(/[^0-9.]/g, "");
    let value = parseFloat(sanitized) || 0;
    if (floatStr.includes("B")) value *= 1000;
    if (floatStr.includes("K")) value /= 1000;
    return value;
}

/**
 * Calculates ticker score based on count, float, and HOD status.
 */
function calculateScore(ticker) {
    let score = ticker.count;
    if (ticker.HighOfDay) score += 20;
    let floatValue = parseFloatValue(ticker.Float);
    if (floatValue < 1) score += 20;
    else if (floatValue < 10) score += 10;
    else if (floatValue < 50) score += 5;
    else if (floatValue < 100) score += 0;
    else if (floatValue > 100) score -= 10;
    else if (floatValue > 500) score -= 20;
    return score;
}

/**
 * Fetches tickers separately for session and daily.
 */
async function fetchAndUpdateTickers() {
    try {
        console.log("Fetching updated tickers...");

        // ✅ Fetch tickers from API
        const sessionData = await window.topAPI.getTickers("session");
        const dailyData = await window.topAPI.getTickers("daily");

        console.log("Session Data:", sessionData);
        console.log("📊 Daily Data:", dailyData);

        // ✅ Apply price filter
        const filteredSession = sessionData.filter((ticker) => ticker.Price >= window.minPrice && ticker.Price <= window.maxPrice);
        const filteredDaily = dailyData.filter((ticker) => ticker.Price >= window.minPrice && ticker.Price <= window.maxPrice);

        console.log("Filtered Session:", filteredSession);
        console.log("Filtered Daily:", filteredDaily);

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
    window.minPrice = settings.top.minPrice ?? 0;
    window.maxPrice = settings.top.maxPrice ?? 1000;

    console.log("✅ Applied saved filters:", { minPrice: window.minPrice, maxPrice: window.maxPrice });

    // ✅ Clear existing data before applying new filters
    tickersSessions = [];
    tickersDaily = [];
}

/**
 * Clears session tickers via IPC event and refreshes the UI.
 */
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

/**
 * Adds "Clear Session" button dynamically.
 */
function addClearSessionButton() {
    const btn = document.createElement("button");
    btn.id = "clear-session-btn";
    btn.textContent = "🧹 Clear Session";
    btn.addEventListener("click", clearSessionList);

    // ✅ Insert the button before session tickers table
    const sessionTable = document.getElementById("tickers-session");
    sessionTable.parentNode.insertBefore(btn, sessionTable);
}

/**
 * Run on window load
 */
document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Loading Top Window...");

    await applySavedFilters(); // ✅ Apply saved settings before fetching tickers
    await fetchAndUpdateTickers(); // ✅ Fetch tickers after applying filters

    addClearSessionButton(); // ✅ Ensure the button is added!

    // ✅ Listen for updates
    window.topAPI.onTickerUpdate(() => {
        console.log("🔔 Ticker update received, fetching latest data...");
        fetchAndUpdateTickers();
    });

    // ✅ Listen for filter updates from settings
    window.topAPI.onFilterUpdate(async () => {
        console.log("🎯 Filter settings updated, applying new filters...");
        await applySavedFilters(); // ✅ Clear lists and apply new settings
        fetchAndUpdateTickers(); // ✅ Refresh tickers with new filters
    });
});
