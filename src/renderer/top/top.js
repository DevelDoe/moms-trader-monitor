
// ./renderer/docker/top.js

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
setInterval(clearSessionList, 60000); // Run every minute

/**
 * Parses a float string (e.g., '4.5M', '1B') and converts to a numeric value.
 */
function parseFloatValue(floatStr) {
    if (!floatStr) return 0;
    let sanitized = floatStr.replace(/[^0-9.]/g, ""); // Remove non-numeric characters
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
    if (ticker.HighOfDay) score += 3;

    let floatValue = parseFloatValue(ticker.Float);
    if (floatValue < 1) score += 5;
    else if (floatValue < 10) score += 4;
    else if (floatValue < 50) score += 3;
    else if (floatValue < 100) score += 2;

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
 * Updates a ticker list by either updating an existing entry or adding a new one.
 */
function updateTickerList(tickerList, item) {
    let existingTicker = tickerList.find((ticker) => ticker.Symbol === item.Symbol);

    if (existingTicker) {
        existingTicker.count += 1;
        existingTicker.Price = item.Price;
        existingTicker.ChangePercent = item.ChangePercent;
        existingTicker.FiveM = item.FiveM;
        existingTicker.Float = item.Float;
        existingTicker.Volume = item.Volume;
        existingTicker.SprPercent = item.SprPercent;
        existingTicker.Time = item.Time;

        if (existingTicker.HighOfDay !== item.HighOfDay) {
            existingTicker.HighOfDay = item.HighOfDay;
            existingTicker.score = calculateScore(existingTicker);
        } else {
            existingTicker.score += 1;
        }
    } else {
        tickerList.push({
            Symbol: item.Symbol,
            count: 1,
            score: calculateScore({
                count: 1,
                HighOfDay: item.HighOfDay,
                Float: item.Float,
            }),
            Price: item.Price,
            ChangePercent: item.ChangePercent,
            FiveM: item.FiveM,
            Float: item.Float,
            Volume: item.Volume,
            SprPercent: item.SprPercent,
            Time: item.Time,
            HighOfDay: item.HighOfDay,
        });
    }
}

/**
 * Processes and updates tickers based on received WebSocket data.
 */
window.electronTop.onWebSocketMessage((data) => { // ✅ Use `electronTop`
    console.log("📩 Received WebSocket data:", data);
    const parsedData = Array.isArray(data) ? data : [data];

    parsedData.forEach((item) => {
        updateTickerList(tickersDaily, item);
        updateTickerList(tickersSessions, item);
    });

    sortTickersByScore();
    updateTickersTable(tickersSessions, "tickers-session");
    updateTickersTable(tickersDaily, "tickers-daily");
});

