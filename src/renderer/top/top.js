// Local arrays for UI processing
let tickersDaily = [];
let tickersSessions = [];

/**
 * Updates the tickers table dynamically.
 */
function updateTickersTable(tickers, tableId) {
    const tableBody = document.querySelector(`#${tableId} tbody`);
    tableBody.innerHTML = "";
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
        // ✅ Fetch both session and daily tickers separately
        const sessionData = await window.topAPI.getTickers("session");
        const dailyData = await window.topAPI.getTickers("daily");

        // ✅ Process session tickers
        tickersSessions = sessionData.map((ticker) => ({
            ...ticker,
            score: calculateScore(ticker),
        }));

        // ✅ Process daily tickers
        tickersDaily = dailyData.map((ticker) => ({
            ...ticker,
            score: calculateScore(ticker),
        }));

        // ✅ Sort by score
        tickersSessions.sort((a, b) => b.score - a.score);
        tickersDaily.sort((a, b) => b.score - a.score);

        // ✅ Update UI
        updateTickersTable(tickersSessions, "tickers-session");
        updateTickersTable(tickersDaily, "tickers-daily");
    } catch (error) {
        console.error("❌ Error fetching tickers:", error);
    }
}

/**
 * Clears session tickers via IPC event (instead of local reset).
 */
function clearSessionList() {
    if ([0, 30].includes(new Date().getMinutes())) {
        window.topAPI.clearSession(); // ✅ Ask main process to clear session data
        console.log("🧹 Session data clear request sent at:", new Date());
    }
}

// ✅ Check every minute
setInterval(clearSessionList, 60000);

// ✅ Fetch tickers on page load
document.addEventListener("DOMContentLoaded", fetchAndUpdateTickers);

// ✅ Listen for updates
window.topAPI.onTickerUpdate(() => {
    console.log("🔔 Ticker update received, fetching latest data...");
    fetchAndUpdateTickers();
});
