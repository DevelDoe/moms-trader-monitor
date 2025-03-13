document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ DOMContentLoaded event fired!");

    try {
        // Listen for active ticker updates and update UI accordingly
        window.activeAPI.onActiveTickerUpdate(async (symbol) => {
            console.log(`🔄 Active ticker updated: ${symbol}`);
            const symbolData = await window.activeAPI.getSymbol(symbol);

            if (symbolData) {
                updateUI(symbolData);
            } else {
                console.warn(`[active.js] No data found for symbol: ${symbol}`);
            }
        });

        // Set initial UI with default active ticker if available
        const defaultTab = document.querySelector(".tablinks.active");
        if (defaultTab) {
            openTab(null, defaultTab.getAttribute("onclick").match(/'(\w+)'/)[1]);
        } else {
            const firstTab = document.querySelector(".tablinks");
            if (firstTab) openTab(null, firstTab.getAttribute("onclick").match(/'(\w+)'/)[1]);
        }
    } catch (error) {
        console.error("❌ Initialization error:", error);
    }
});

/**
 * Updates UI with symbol data.
 * @param {Object} symbolData - Symbol data object
 */
/**
 * The function `updateUI` updates the user interface with data related to a specific stock symbol.
 * @param symbolData - The `updateUI` function takes in `symbolData` as a parameter, which is an object
 * containing various data related to a financial symbol. The function updates the user interface (UI)
 * with information extracted from the `symbolData` object.
 * @returns The `updateUI` function is updating the user interface with data provided in the
 * `symbolData` object. It sets various text values for different elements based on the properties of
 * the `symbolData` object such as symbol, company name, sector, industry, market cap, last price, last
 * volume, profile details, statistics, financials, and historical data. The function also formats
 * large numbers and
 */
function updateUI(symbolData) {
    if (!symbolData) {
        console.warn("[active.js] No data provided for UI update.");
        return;
    }

    console.log(`[active.js] Updating UI for symbol: ${symbolData.symbol}`);

    // Summary
    setText("symbol", symbolData.symbol);
    setText("companyName", symbolData.profile?.companyName);
    setText("sector", symbolData.profile?.sector);
    setText("industry", symbolData.profile?.industry);
    setText("marketCap", formatLargeNumber(symbolData.statistics?.marketCap));
    setText("lastPrice", symbolData.historical?.price?.[0]?.value);
    setText("lastVolume", symbolData.historical?.volume?.[0]?.value);

    // Profile
    setText("profile-companyName", symbolData.profile?.companyName);
    setText("profile-sector", symbolData.profile?.sector);
    setText("profile-industry", symbolData.profile?.industry);
    setText("profile-exchange", symbolData.profile?.exchange);
    setText("profile-exchangeShortName", symbolData.profile?.exchangeShortName);
    setText("profile-country", symbolData.profile?.country);
    setText("profile-isEtf", symbolData.profile?.isEtf ? "Yes" : "No");
    setText("profile-isFund", symbolData.profile?.isFund ? "Yes" : "No");
    setText("profile-isActivelyTrading", symbolData.profile?.isActivelyTrading ? "Yes" : "No");

    // Statistics
    setText("statistics-marketCap", formatLargeNumber(symbolData.statistics?.marketCap));
    setText("statistics-beta", symbolData.statistics?.beta);

    // Financials
    setText("financials-lastAnnualDividend", symbolData.financials?.lastAnnualDividend);

    // Historical
    setText("historical-price-date", formatDate(symbolData.historical?.price?.[0]?.date));
    setText("historical-price-value", symbolData.historical?.price?.[0]?.value);
    setText("historical-volume-date", formatDate(symbolData.historical?.volume?.[0]?.date));
    setText("historical-volume-value", symbolData.historical?.volume?.[0]?.value);
}

/**
 * Updates the text content of an element by ID.
 * @param {string} id - The ID of the element to update.
 * @param {string|number} value - The value to set.
 */
function setText(id, value) {
    const elements = document.querySelectorAll(`[data-id="${id}"]`); // ✅ Selects all elements with matching `data-id`
    elements.forEach(el => el.innerText = value ?? "N/A"); // ✅ Update all instances
}
/**
 * Formats a large number with abbreviations (K, M, B).
 * @param {number} value - The number to format.
 * @returns {string} - Formatted number.
 */
function formatLargeNumber(value) {
    if (!value || isNaN(value)) return "N/A";
    const num = Number(value);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
    return num.toLocaleString();
}

/**
 * Formats a date string into a readable format.
 * @param {string} dateStr - The date string to format.
 * @returns {string} - Formatted date or "N/A".
 */
function formatDate(dateStr) {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Handles tab switching logic.
 * @param {Event} evt - The event triggering the tab switch.
 * @param {string} tabId - The ID of the tab to show.
 */
function openTab(evt, tabId) {
    document.querySelectorAll(".tabcontent").forEach((tab) => {
        tab.style.display = "none";
        tab.classList.remove("active");
    });

    document.querySelectorAll(".tablinks").forEach((tabLink) => {
        tabLink.classList.remove("active");
    });

    document.getElementById(tabId).style.display = "block";
    document.getElementById(tabId).classList.add("active");
    if (evt) evt.currentTarget.classList.add("active");
}
