// Local arrays for view processing (if needed)
let tickersDaily = [];
let tickersSessions = [];

/**
 * Updates the tickers table dynamically.
 */
function updateTickersTable(tickers, tableId) {
    const tableBody = document.querySelector(`#${tableId} tbody`);
    tableBody.innerHTML = "";
    tickers.forEach((item) => {
        const row = document.createElement("tr");
        Object.values(item).forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });
        tableBody.appendChild(row);
    });
}

/**
 * Clears session tickers at the start of each whole and half-hour.
 */
function clearSessionList() {
    if ([0, 30].includes(new Date().getMinutes())) {
        tickersSessions = [];
        updateTickersTable(tickersSessions, "tickers-session");
        console.log("✅ Ticker session cleared at:", new Date());
    }
}
setInterval(clearSessionList, 60000);

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
 * (Handled in the view so that the view can decide which tickers are "top".)
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
 * Sorts tickers in descending order based on score.
 */
function sortTickersByScore() {
    tickersDaily.sort((a, b) => b.score - a.score);
    tickersSessions.sort((a, b) => b.score - a.score);
}

/**
 * Processes ticker data fetched from the store.
 * Here, we simply copy the data into our local arrays.
 */
function processTickerData(data) {
    // For simplicity, we assign the same data to both arrays.
    tickersDaily = data.slice();
    tickersSessions = data.slice();

    // Update score for each ticker using our local calculation.
    tickersDaily.forEach((ticker) => {
        ticker.score = calculateScore(ticker);
    });
    tickersSessions.forEach((ticker) => {
        ticker.score = calculateScore(ticker);
    });
}

/**
 * Fetches tickers from the centralized store and updates the UI.
 */
async function fetchAndUpdateTickers() {
    try {
        const data = await window.electronAPI.getTickers();
        processTickerData(data);
        sortTickersByScore();
        updateTickersTable(tickersSessions, "tickers-session");
        updateTickersTable(tickersDaily, "tickers-daily");
    } catch (error) {
        console.error("Error fetching tickers:", error);
    }
}

// Fetch tickers when the document loads
document.addEventListener("DOMContentLoaded", () => {
    fetchAndUpdateTickers();
});

// Listen for update notifications and refresh the UI
window.electronAPI.onTickerUpdate(() => {
    console.log("🔔 Ticker update received, fetching latest data...");
    fetchAndUpdateTickers();
});
