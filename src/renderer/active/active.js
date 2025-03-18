// Global object to store chart instances
window.ownershipCharts = {};

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ DOMContentLoaded event fired!");

    // Initialize UI with no symbol data
    updateUI(null); // Show "No active symbol" placeholder

    try {
        // Listen for active ticker updates
        window.activeAPI.onActiveTickerUpdate(async (symbol) => {
            console.log(`🔄 Active ticker updated: ${symbol}`);
            const symbolData = await window.activeAPI.getSymbol(symbol);

            if (symbolData) {
                updateUI(symbolData); // Update UI with symbol data
            } else {
                console.warn(`[active.js] No data found for symbol: ${symbol}`);
                updateUI(null); // Show "No active symbol" placeholder
            }
        });

        // Set initial UI with default active tab
        const defaultTab = document.querySelector(".tablinks.active");
        if (defaultTab) {
            const tabId = defaultTab.dataset.tabId; // Use dataset to get the tab ID
            if (tabId) {
                openTab(null, tabId); // Open the default tab
            } else {
                console.error("Default tab has no data-tab-id attribute.");
            }
        } else {
            const firstTab = document.querySelector(".tablinks");
            if (firstTab) {
                const tabId = firstTab.dataset.tabId; // Use dataset to get the tab ID
                if (tabId) {
                    openTab(null, tabId); // Open the first tab
                } else {
                    console.error("First tab has no data-tab-id attribute.");
                }
            }
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
    const noActiveSymbolElement = document.getElementById("no-active-symbol");
    const settingsContainer = document.querySelector(".settings-container");
    const tabs = document.querySelectorAll(".tab, .tabcontent");

    if (!noActiveSymbolElement || !settingsContainer) {
        console.error("Required elements not found in the DOM.");
        return;
    }

    // Check if symbolData is null, undefined, or an empty object
    if (!symbolData || Object.keys(symbolData).length === 0) {
        console.log("No symbol data found. Showing placeholder."); // Debugging line
        noActiveSymbolElement.classList.add("visible");

        // Hide all tabs and content
        tabs.forEach((el) => {
            el.style.display = "none";
        });
        return;
    }

    // Hide "No active symbol" message and show tabs/content
    noActiveSymbolElement.classList.remove("visible");
    tabs.forEach((el) => {
        el.style.display = "";
    });

    // Update UI with symbol data
    console.log(`[active.js] Updating UI for symbol: ${symbolData.symbol}`);
    console.log("symbolData:", symbolData);

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
    setText("profile-longBusinessSummary", symbolData.profile?.longBusinessSummary);
    setText("profile-website", symbolData.profile?.website);
    setText("profile-sector", symbolData.profile?.sector);
    setText("profile-industry", symbolData.profile?.industry);
    setText("profile-exchange", symbolData.profile?.exchange);
    setText("profile-country", symbolData.profile?.country);
    setText("profile-isEtf", symbolData.profile?.isEtf ? "Yes" : "No");
    setText("profile-isFund", symbolData.profile?.isFund ? "Yes" : "No");
    setText("profile-isActivelyTrading", symbolData.profile?.isActivelyTrading ? "Yes" : "No");

    // Statistics
    setText("statistics-marketCap", formatLargeNumber(symbolData.statistics?.marketCap));
    setText("statistics-beta", symbolData.statistics?.beta);
    // setText("statistics-sharesOutstanding", formatLargeNumber(symbolData.statistics?.sharesOutstanding));
    // setText("statistics-float", formatLargeNumber(symbolData.statistics?.floatShares));
    // let indidersHeld = symbolData.statistics?.floatShares * symbolData.ownership?.insidersPercentHeld;
    // setText("statistics-insidersHeld", formatLargeNumber(indidersHeld));
    // setText("statistics-floatHeldByInstitutions", formatLargeNumber(symbolData.statistics?.floatHeldByInstitutions));
    // setText("statistics-sharesShort", formatLargeNumber(symbolData.statistics?.sharesShort));
    setText("statistics-shortPercentOfFloat", symbolData.statistics?.shortPercentOfFloat);

    // Financials
    setText("financials-lastAnnualDividend", symbolData.financials?.lastAnnualDividend);

    // Ownership
    setText("ownership-insidersPercentHeld", formatPercentage(symbolData.ownership?.insidersPercentHeld));
    setText("ownership-institutionsPercentHeld", formatPercentage(symbolData.ownership?.institutionsPercentHeld));
    setText("ownership-institutionsFloatPercentHeld", formatPercentage(symbolData.ownership?.institutionsFloatPercentHeld));

    // Historical
    setText("historical-price-date", formatDate(symbolData.historical?.price?.[0]?.date));
    setText("historical-price-value", symbolData.historical?.price?.[0]?.value);
    setText("historical-volume-date", formatDate(symbolData.historical?.volume?.[0]?.date));
    setText("historical-volume-value", symbolData.historical?.volume?.[0]?.value);

    const sharesOutstanding = symbolData.statistics?.sharesOutstanding || 0;
    const floatShares = symbolData.statistics?.floatShares || 0;
    const insidersHeld = Math.round(sharesOutstanding * (symbolData.ownership?.insidersPercentHeld || 0));
    const institutionsHeld = Math.round(sharesOutstanding * (symbolData.ownership?.institutionsPercentHeld || 0));
    const sharesShort = symbolData.statistics?.sharesShort || 0;
    const remainingShares = Math.max(sharesOutstanding - (floatShares + insidersHeld + institutionsHeld), 0);

    // ✅ Function to format value with percentage
    const formatWithPercentage = (value, total) => {
        if (total === 0) return `${formatLargeNumber(value)} (N/A)`;
        const percentage = ((value / total) * 100).toFixed(2);
        return `${formatLargeNumber(value)} (${percentage}%)`;
    };

    // ✅ Update UI with absolute + percentage values
    setText("statistics-sharesOutstanding", formatLargeNumber(sharesOutstanding));
    setText("statistics-float", formatWithPercentage(floatShares, sharesOutstanding));
    setText("statistics-insidersHeld", formatWithPercentage(insidersHeld, sharesOutstanding));
    setText("statistics-floatHeldByInstitutions", formatWithPercentage(institutionsHeld, sharesOutstanding));
    setText("statistics-sharesShort", formatWithPercentage(sharesShort, floatShares)); // Short % is based on float
    setText("statistics-remainingShares", formatWithPercentage(remainingShares, sharesOutstanding));

    // Render the ownership chart
    renderOwnershipChart(symbolData, "ownershipChart-summary");
    renderOwnershipChart(symbolData, "ownershipChart-stats");
}

/**
 * Updates the text content of an element by ID.
 * @param {string} id - The ID of the element to update.
 * @param {string|number} value - The value to set.
 */
function setText(id, value) {
    const elements = document.querySelectorAll(`[data-id="${id}"]`); // ✅ Selects all elements with matching `data-id`
    elements.forEach((el) => (el.innerText = value ?? "N/A")); // ✅ Update all instances
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
 * Converts a decimal ratio (0-1) into a human-readable percentage.
 * @param {number} value - The ratio to convert.
 * @returns {string} - Formatted percentage or "N/A".
 */
function formatPercentage(value) {
    if (value == null || isNaN(value)) return "N/A";
    return (value * 100).toFixed(2) + "%";
}

/**
 * Handles tab switching logic.
 * @param {Event} evt - The event triggering the tab switch.
 * @param {string} tabId - The ID of the tab to show.
 */
function openTab(evt, tabId) {
    // Hide all tab content
    document.querySelectorAll(".tabcontent").forEach((tab) => {
        tab.style.display = "none";
        tab.classList.remove("active");
    });

    // Deactivate all tab buttons
    document.querySelectorAll(".tablinks").forEach((tabLink) => {
        tabLink.classList.remove("active");
    });

    // Show the selected tab content
    const tabContent = document.getElementById(tabId);
    if (tabContent) {
        tabContent.style.display = "block";
        tabContent.classList.add("active");
    }

    // Activate the clicked tab button
    if (evt) {
        evt.currentTarget.classList.add("active");
    }
}

function renderOwnershipChart(symbolData, chartId) {
    const floatShares = symbolData.statistics?.floatShares || 0;
    const insidersPercentHeld = symbolData.ownership?.insidersPercentHeld || 0;
    const institutionsPercentHeld = symbolData.ownership?.institutionsPercentHeld || 0;
    const sharesOutstanding = symbolData.statistics?.sharesOutstanding || 0;
    const sharesShort = symbolData.statistics?.sharesShort || 0;

    // ✅ Correctly calculate insider & institutional shares
    const insiderShares = Math.round(sharesOutstanding * insidersPercentHeld);
    const institutionalShares = Math.round(sharesOutstanding * institutionsPercentHeld);
    const remainingShares = sharesOutstanding - (floatShares + insiderShares + institutionalShares);

    // ✅ Inner ring (FLOAT breakdown: float vs. shorted inside float)
    const floatNonShort = floatShares - sharesShort; // Remaining float
    const floatBreakdown = [
        Math.max(floatNonShort, 0), // Float excluding shorts (Blue)
        Math.max(sharesShort, 0), // Shorted Shares (Red inside Float)
    ];

    // ✅ Outer ring (Total Outstanding breakdown)
    const totalBreakdown = [
        Math.max(floatShares, 0), // Public Float (Blue)
        Math.max(insiderShares, 0), // Insider held (Yellow)
        Math.max(institutionalShares, 0), // Institutional held (Orange)
        Math.max(remainingShares, 0), // Remaining (Gray)
    ];

    if (totalBreakdown.every((val) => val === 0)) {
        console.warn("All ownership data is zero. Chart will not be displayed.");
        return;
    }

    // Select the correct canvas dynamically
    const chartCanvas = document.getElementById(chartId);
    if (!chartCanvas) {
        console.error(`Canvas not found: ${chartId}`);
        return;
    }

    // Clean up old chart instance (prevents multiple charts being created)
    if (window.ownershipCharts[chartId]) {
        window.ownershipCharts[chartId].destroy();
    }

    // ✅ Custom tooltip function to show percentages
    const tooltipFormatter = (tooltipItem) => {
        const datasetIndex = tooltipItem.datasetIndex; // 0 = Outer Ring, 1 = Inner Ring
        const index = tooltipItem.dataIndex;
        const dataset = tooltipItem.dataset;
        const value = dataset.data[index];

        // Determine the reference total (outer ring uses sharesOutstanding, inner uses floatShares)
        const referenceTotal = datasetIndex === 0 ? sharesOutstanding : floatShares;
        const percentage = ((value / referenceTotal) * 100).toFixed(2);

        return `${tooltipItem.label}: ${formatLargeNumber(value)} (${percentage}%)`;
    };

    // ✅ Create a nested doughnut chart (Stacked Ownership)
    window.ownershipCharts[chartId] = new Chart(chartCanvas.getContext("2d"), {
        type: "doughnut",
        data: {
            labels: [
                "Public Float",
                "Insider Held",
                "Institutional Held",
                "Remaining Shares", // Outer Ring (Total)
                "Float (Non-Shorted)",
                "Shorted Shares", // Inner Ring (Short Inside Float)
            ],
            datasets: [
                {
                    // 🟣 Outer Ring (Total Outstanding Breakdown)
                    data: totalBreakdown,
                    backgroundColor: [
                        "#1E90FF", // 🔵 Public Float (Blue)
                        "#FFFF00", // 🟡 Insider Held (Yellow)
                        "#FFA500", // 🟠 Institutional Held (Orange)
                        "#404040", // ⚫ Remaining Shares (Gray)
                    ],
                    borderColor: "#1c1d23", // ⚪ Keep borders white for better separation
                    borderWidth: 1, // ✅ Reduced width
                },
                {
                    // 🔴 Inner Ring (Short Inside Float)
                    data: floatBreakdown,
                    backgroundColor: [
                        "#1E90FF", // 🔵 Float (excluding short)
                        "#FF0000", // 🔴 Shorted Shares (Red inside Float)
                    ],
                    borderColor: "#1c1d23", // ⚪ Keep borders white for better separation
                    borderWidth: 1, // ✅ Reduced width
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }, // ✅ Enabled legend for clarity
                tooltip: {
                    enabled: true, // ✅ Enable tooltips
                    callbacks: {
                        label: tooltipFormatter, // ✅ Format tooltips to show absolute + percentage
                    },
                },
            },
            cutout: "80%", // ✅ Makes it a more distinct double-ring chart
        },
    });
}
