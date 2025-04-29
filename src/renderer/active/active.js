// Global object to store chart instances
window.ownershipCharts = {};
const symbolColors = {};

const { isDev } = window.appFlags;

function getNewsSentimentClass(newsItem) {
    const lowerHeadline = (newsItem.headline || "").toLowerCase();
    const bullishList = window.settings?.news?.bullishList || [];
    const bearishList = window.settings?.news?.bearishList || [];

    if (bullishList.some((term) => lowerHeadline.includes(term.toLowerCase()))) {
        return "bullish";
    }
    if (bearishList.some((term) => lowerHeadline.includes(term.toLowerCase()))) {
        return "bearish";
    }
    return "neutral";
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ DOMContentLoaded event fired!");

    console.log("🟢 Notifying active-window-ready");
    window.activeAPI.notifyActiveWindowReady();

    // Load settings globally
    try {
        window.settings = await window.settingsAPI.get();
        console.log("✅ Settings loaded in active window:", window.settings);
    } catch (e) {
        console.warn("⚠️ Failed to load settings in active window:", e);
        window.settings = {}; // fallback
    }

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

        const appContainer = document.getElementById("app-container");
        const tabWrapper = document.querySelector(".tab-wrapper");

        let hideTimeout;

        const showTab = () => {
            clearTimeout(hideTimeout);
            tabWrapper.classList.add("visible");
        };

        const scheduleHide = () => {
            hideTimeout = setTimeout(() => {
                tabWrapper.classList.remove("visible");
            }, 2000);
        };

        // Make tab bar stay visible when hovering anywhere over app or the tab itself
        [appContainer, tabWrapper].forEach((el) => {
            el.addEventListener("mouseenter", showTab);
            el.addEventListener("mouseleave", scheduleHide);
        });
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

    // Check if symbolData is missing or empty
    if (!symbolData || Object.keys(symbolData).length === 0) {
        console.log("No symbol data found. Showing placeholder.");
        noActiveSymbolElement.classList.add("visible");

        tabs.forEach((el) => (el.style.display = "none"));
        return;
    }

    // Hide placeholder & show tabs
    noActiveSymbolElement.classList.remove("visible");
    tabs.forEach((el) => (el.style.display = ""));

    console.log(`[active.js] Updating UI for symbol: ${symbolData.symbol}`);
    console.log("symbolData:", symbolData);

    // Summary
    setText("symbol", symbolData.symbol);
    setText("companyName", symbolData.profile?.companyName || "N/A");
    setText("sector", symbolData.profile?.sector || "N/A");
    setText("industry", symbolData.profile?.industry || "N/A");
    setText("marketCap", formatLargeNumber(symbolData.statistics?.marketCap || 0));
    setText("lastPrice", symbolData.historical?.price?.[0]?.value || "N/A");
    setText("lastVolume", symbolData.historical?.volume?.[0]?.value || "N/A");

    // Profile
    setText("profile-companyName", symbolData.profile?.companyName || "N/A");
    setText("profile-longBusinessSummary", symbolData.profile?.longBusinessSummary || "");
    setText("profile-website", symbolData.profile?.website || "N/A");
    setText("profile-sector", symbolData.profile?.sector || "N/A");
    setText("profile-industry", symbolData.profile?.industry || "N/A");
    setText("profile-exchange", symbolData.profile?.exchange || "N/A");
    setText("profile-country", symbolData.profile?.country || "N/A");
    setText("profile-isEtf", symbolData.profile?.isEtf ? "Yes" : "No");
    setText("profile-isFund", symbolData.profile?.isFund ? "Yes" : "No");
    setText("profile-isActivelyTrading", symbolData.profile?.isActivelyTrading ? "Yes" : "No");

    // Statistics
    setText("statistics-marketCap", formatLargeNumber(symbolData.statistics?.marketCap || 0));
    setText("statistics-beta", symbolData.statistics?.beta || "N/A");
    setText("statistics-shortPercentOfFloat", symbolData.statistics?.shortPercentOfFloat || "N/A");

    // Financials
    setText("financials-netIncome", symbolData.financials?.netIncome || "N/A");

    // Ownership
    setText("ownership-insidersPercentHeld", formatPercentage(symbolData.ownership?.insidersPercentHeld));
    setText("ownership-institutionsPercentHeld", formatPercentage(symbolData.ownership?.institutionsPercentHeld));
    setText("ownership-institutionsFloatPercentHeld", formatPercentage(symbolData.ownership?.institutionsFloatPercentHeld));

    // Historical
    setText("historical-price-date", formatDate(symbolData.historical?.price?.[0]?.date));
    setText("historical-price-value", symbolData.historical?.price?.[0]?.value || "N/A");
    setText("historical-volume-date", formatDate(symbolData.historical?.volume?.[0]?.date));
    setText("historical-volume-value", symbolData.historical?.volume?.[0]?.value || "N/A");

    // Ownership & Float Check
    const sharesOutstanding = symbolData.statistics?.sharesOutstanding ?? 0;
    const floatShares = symbolData.statistics?.floatShares ?? 0;

    let dataIsCorrupted = false;

    if (
        !floatShares || // missing
        !sharesOutstanding || // missing
        floatShares <= 0 || // invalid
        sharesOutstanding <= 0 || // invalid
        floatShares > 1_000_000_000 || // absurdly large float
        sharesOutstanding > 5_000_000_000 || // also absurd
        floatShares / sharesOutstanding > 1.2 || // more float than shares? lol
        floatShares / sharesOutstanding < 0.01 // too little float, likely wrong too
    ) {
        dataIsCorrupted = true;

        console.warn("⚠️ Float data appears inconsistent:", {
            floatShares,
            sharesOutstanding,
            ratio: sharesOutstanding > 0 ? (floatShares / sharesOutstanding).toFixed(2) : "N/A",
        });
    }

    document.getElementById("data-warning-summary").style.display = dataIsCorrupted ? "block" : "none";
    document.getElementById("section-float-summary").style.display = "flex";

    document.getElementById("data-warning-stats").style.display = dataIsCorrupted ? "block" : "none";
    document.getElementById("section-float-stats").style.display = "flex";

    const floatSection = document.getElementById("section-float-summary");

    if (floatSection) {
        if (dataIsCorrupted) {
            floatSection.classList.add("blur-effect");
        } else {
            floatSection.classList.remove("blur-effect");
        }
    }

    const insidersHeld = Math.round(sharesOutstanding * (symbolData.ownership?.insidersPercentHeld || 0));
    const institutionsHeld = Math.round(sharesOutstanding * (symbolData.ownership?.institutionsPercentHeld || 0));
    const sharesShort = symbolData.statistics?.sharesShort ?? 0;

    const remainingShares = Math.max(sharesOutstanding - Math.min(floatShares + insidersHeld + institutionsHeld, sharesOutstanding), 0);

    const formatWithPercentage = (value, total) => {
        if (!Number.isFinite(value)) return `<span class="value-bold">N/A</span> <span class="value-light">(0.00%)</span>`;
        if (total === 0) return `<span class="value-bold">0</span> <span class="value-light">(0.00%)</span>`;

        const num = formatLargeNumber(value);
        const percent = ((value / total) * 100).toFixed(2);
        return `<span class="value-bold">${num}</span> <span class="value-light">(${percent}%)</span>`;
    };

    setText("statistics-sharesOutstanding", formatLargeNumber(sharesOutstanding));
    setText("statistics-float", formatWithPercentage(floatShares, sharesOutstanding));
    setText("statistics-insidersHeld", formatWithPercentage(insidersHeld, sharesOutstanding));
    setText("statistics-floatHeldByInstitutions", formatWithPercentage(institutionsHeld, sharesOutstanding));
    setText("statistics-sharesShort", formatWithPercentage(sharesShort, floatShares));
    setText("statistics-remainingShares", formatWithPercentage(remainingShares, sharesOutstanding));

    // User set symbol input
    const symbolInput = document.getElementById("symbol-input");
    if (symbolInput) {
        symbolInput.value = "$" + symbolData.symbol;

        const color = getSymbolColor(symbolData.symbol);
        symbolInput.style.backgroundColor = color; // 🎨 Colorize input text

        // Apply color to any elements with data-id="symbol"
        const symbolLabels = document.querySelectorAll('[data-id="symbol"]');
        symbolLabels.forEach((el) => (el.style.color = color));

        symbolInput.onkeydown = (e) => {
            if (e.key === "Enter") {
                const newSymbol = symbolInput.value.trim().replace(/^\$/, "").toUpperCase();
                if (newSymbol && newSymbol !== symbolData.symbol) {
                    window.activeAPI.setActiveTicker(newSymbol);
                }
                symbolInput.blur();
            }
        };
    }

    // News
    const newsContainer = document.getElementById("news-container");
    newsContainer.innerHTML = ""; // Clear previous content

    const blockList = window.settings?.news?.blockList || [];
    // Log what would be blocked
    (symbolData.News || []).forEach((newsItem) => {
        const headline = sanitize(newsItem.headline || "");
        const match = blockList.find((b) => headline.includes(sanitize(b)));
        if (match) {
            console.log(`🚫 Blocked by "${match}":`, newsItem.headline);
        }
    });

    const filteredNews = (Array.isArray(symbolData.News) ? symbolData.News : []).filter((newsItem) => {
        const headline = sanitize(newsItem.headline || "");

        // ❌ Blocked by blockList
        const isBlocked = blockList.some((blocked) => headline.includes(sanitize(blocked)));

        // ❌ Blocked if multiple symbols
        const isMultiSymbol = Array.isArray(newsItem.symbols) && newsItem.symbols.length > 1;

        return !isBlocked && !isMultiSymbol;
    });

    if (filteredNews.length === 0) {
        newsContainer.innerHTML = '<p style="opacity:0.1; color: white">no recent news available</p>';
    } else {
        filteredNews.forEach((newsItem) => {
            const sentimentClass = getNewsSentimentClass(newsItem);

            const itemDiv = document.createElement("div");
            itemDiv.className = `news-item ${sentimentClass}`;

            itemDiv.innerHTML = `<h5>${newsItem.headline || "Untitled"}</h5>`;

            //     itemDiv.innerHTML = `
            //     <h5>${newsItem.headline || "Untitled"}</h5>
            //     <p>${newsItem.summary || ""}</p>
            // `;

            newsContainer.appendChild(itemDiv);
        });
    }

    // news banner
    //     const latestNewsDiv = document.getElementById("latest-news");
    //     latestNewsDiv.innerHTML = ""; // Clear existing

    //     if (filteredNews.length > 0) {
    //         latestNewsDiv.style.display = "block"; // ✅ Show it

    //         const sortedNews = filteredNews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    //         const latest = sortedNews[0];

    //         const latestDiv = document.createElement("div");
    //         latestDiv.className = "latest-news-item";
    //         latestDiv.innerHTML = `
    //         <div class="scroll-mask">
    //   <div class="scrolling-text"><strong>📰 ${latest.headline}</strong></div>
    // </div>
    //         <p>${latest.summary || ""}</p>
    //     `;

    //         latestNewsDiv.appendChild(latestDiv);
    //     } else {
    //         latestNewsDiv.style.display = "none"; // ✅ Hide completely if no news
    //     }

    renderOwnershipChart(symbolData, "ownershipChart-summary");
    renderOwnershipChart(symbolData, "ownershipChart-stats");

    // Stats & Buffs (NEW)
    setText("stats-lv", symbolData.lv || 1);
    setText("stats-xp", symbolData.totalXpGained || 0);

    const finalScore = calculateScore(symbolData.buffs, 0);
    setText("stats-energy", mapScoreToEnergy(finalScore));

    const buffsContainer = document.getElementById("buffs-container");
    buffsContainer.innerHTML = ""; // Clear previous buffs

    renderBuffs(symbolData.buffs);
}

function mapScoreToEnergy(score) {
    if (score >= 150) return "🏆 Legend";
    if (score >= 100) return "🌟 Excellent";
    if (score >= 50) return "👍 Good";
    if (score >= 0) return "🙂 Fair";
    if (score >= -25) return "😣 Weak";
    if (score >= -50) return "👎 Weaker"; // Notice: -1 to -100
    return "❄️ Cold"; // -101 or worse
}

function calculateScore(heroBuffs = {}, baseScore = 0) {
    let totalScore = baseScore;
    let newsScore = 0;
    let hasBullish = false;
    let hasBearish = false;

    for (const key in heroBuffs) {
        if (key === "volume" || key.startsWith("vol") || key.includes("Vol") || key === "newHigh") continue;

        const buff = heroBuffs[key];
        const ref = typeof buff === "object" ? buff : globalBuffs[key];
        const score = ref?.score || 0;

        if (key === "hasBullishNews") {
            hasBullish = true;
            newsScore = score;
            continue;
        }

        if (key === "hasBearishNews") {
            hasBearish = true;
            newsScore = score;
            continue;
        }

        if (key === "hasNews") {
            // Only assign if no stronger sentiment already found
            if (!hasBullish && !hasBearish) {
                newsScore = score;
            }
            continue;
        }

        totalScore += score;
    }

    if (!(hasBullish && hasBearish)) {
        totalScore += newsScore;
    }

    return totalScore;
}

function renderBuffs(buffs) {
    const container = document.getElementById("buffs-container");
    container.innerHTML = ""; // Clear previous buffs

    if (!buffs || Object.keys(buffs).length === 0) {
        container.innerHTML = '<span class="text-gray-500 text-sm">No buffs available</span>';
        return;
    }

    const sortedBuffs = Object.entries(buffs)
        .filter(([key, buff]) => {
            const k = key.toLowerCase(); // always lowercase to match
            return !k.includes("vol") && k !== "volume" && k !== "newhigh" && k !== "bounceback";
        })
        .map(([, buff]) => buff) // use only the buff object
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

    sortedBuffs.forEach((buff) => {
        const buffSpan = document.createElement("span");

        let buffClass = "buff-neutral"; // Default
        if (buff.isBuff === true) buffClass = "buff-positive";
        else if (buff.isBuff === false) buffClass = "buff-negative";

        buffSpan.className = `buff-badge ${buffClass}`;
        buffSpan.innerHTML = `
            ${buff.icon ? `<span class="buff-icon">${buff.icon}</span>` : ""}
            <span class="buff-desc">${buff.desc || ""}</span>
        `;
        container.appendChild(buffSpan);
    });
}

function sanitize(str) {
    return str
        .toLowerCase()
        .replace(/[’‘“”]/g, "'") // Normalize fancy quotes
        .replace(/[^\w\s]/g, "") // Remove most punctuation
        .trim(); // Trim whitespace
}

/**
 * Updates the text content of an element by ID.
 * @param {string} id - The ID of the element to update.
 * @param {string|number} value - The value to set.
 */
function setText(id, value) {
    const elements = document.querySelectorAll(`[data-id="${id}"]`);
    elements.forEach((el) => {
        let text = value ?? "N/A";
        if (id === "industry" && typeof text === "string" && text.length > 30) {
            text = text.slice(0, 27) + "...";
        }
        el.innerHTML = text; // <-- use innerHTML instead of innerText
    });
}
/**
 * Formats a large number with abbreviations (K, M, B).
 * @param {number} value - The number to format.
 * @returns {string} - Formatted number.
 */
function formatLargeNumber(value) {
    if (value == null || isNaN(value)) return "N/A"; // Allow 0 but reject NaN/null
    const num = Number(value);
    if (num === 0) return "0"; // Ensure 0 is explicitly displayed as "0"
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

        return `${tooltipItem.label}: ${percentage}%)`;
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
                    // Outer Ring (Total Outstanding Breakdown)
                    data: totalBreakdown,
                    backgroundColor: [
                        "#1E90FF", // 🔵 Public Float (Blue)
                        "#FF0000", // 🔴 Insider Held
                        "#FFA500", // 🟠 Institutional Held (Orange)
                        "#404040", // ⚫ Remaining Shares (Gray)
                    ],
                    borderColor: "#1c1d23", // ⚪ Keep borders white for better separation
                    borderWidth: 1, // ✅ Reduced width
                },
                {
                    // Inner Ring (Short Inside Float)
                    data: floatBreakdown,
                    backgroundColor: [
                        "#1E90FF", // 🔵 Float (excluding short)
                        "#FFFF00", // 🟡 Shorted Shares
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

function getSymbolColor(symbol) {
    if (!symbolColors[symbol]) {
        const hash = [...symbol].reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const hue = (hash * 37) % 360;
        const saturation = 80;
        const lightness = 50;
        const alpha = 0.5;
        symbolColors[symbol] = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    }
    return symbolColors[symbol];
}
