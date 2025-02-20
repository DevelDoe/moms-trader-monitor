// Local arrays for UI processing
let tickersDaily = [];
let tickersSessions = [];
let tickersAll = [];

// Store previous tickers for comparison
let prevTickersSessions = {};
let prevTickersDaily = {};

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Loading Top Window...");

    await applySavedFilters(); // ✅ Apply saved settings before fetching data
    await fetchAndUpdateTickers(); // ✅ Fetch tickers immediately on load

    addClearSessionButton();

    // ✅ Listen for ticker updates
    window.topAPI.onTickerUpdate(() => {
        console.log("🔔 Ticker update received, fetching latest data...");
        fetchAndUpdateTickers();
    });

    // ✅ Listen for news updates (new articles)
    window.topAPI.onNewsUpdate(({ ticker, newsItems }) => {
        console.log(`📰 Received ${newsItems.length} new articles for ${ticker}`);
        fetchAndUpdateTickers(); // ✅ Refresh tickers after receiving news
    });

    // ✅ Listen for settings updates globally
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);

        // ✅ Sync new settings globally
        window.settings = updatedSettings;

        // ✅ Re-apply filters & update UI
        await applySavedFilters();
        await fetchAndUpdateTickers();

        // ✅ Refresh the active ticker UI
        if (currentActiveTicker) {
            updateActiveTicker(currentActiveTicker);
        }
    });
});

async function fetchAndUpdateTickers() {
    try {
        console.log("Fetching updated tickers...");

        // ✅ Fetch tickers from API
        const sessionData = await window.topAPI.getTickers("session");
        const dailyData = await window.topAPI.getTickers("daily");
        const allData = await window.topAPI.getTickers("all");

        console.log("📊 Session Data:", sessionData);
        console.log("📊 Daily Data:", dailyData);
        console.log("📊 All Data:", allData);

        // ✅ Store previous state for comparison
        let oldTickersSessions = { ...prevTickersSessions };
        let oldTickersDaily = { ...prevTickersDaily };

        // ✅ Extract filters from settings
        const minPrice = window.settings.top?.minPrice ?? 0;
        const maxPrice = window.settings.top?.maxPrice ?? 0;
        const minFloat = window.settings.top?.minFloat ?? 0;
        const maxFloat = window.settings.top?.maxFloat ?? 0;
        const minScore = window.settings.top?.minScore ?? 0;
        const maxScore = window.settings.top?.maxScore ?? 0;
        const minVolume = window.settings.top?.minVolume ?? 0;
        const maxVolume = window.settings.top?.maxVolume ?? 0;
        const maxSessionLength = window.settings.top?.lists?.session?.length ?? 10;
        const maxDailyLength = window.settings.top?.lists?.daily?.length ?? 10;

        console.log("Applying filters:", { minPrice, maxPrice, minFloat, maxFloat, minScore, maxScore, minVolume, maxVolume });

        // ✅ Apply filters to each dataset
        const applyFilters = (data) =>
            data
                .map((ticker) => ({ ...ticker, Score: calculateScore(ticker) }))
                .filter(
                    (ticker) =>
                        (minPrice === 0 || ticker.Price >= minPrice) &&
                        (maxPrice === 0 || ticker.Price <= maxPrice) &&
                        (minFloat === 0 || parseFloatValue(ticker.Float) >= minFloat) &&
                        (maxFloat === 0 || parseFloatValue(ticker.Float) <= maxFloat) &&
                        (minScore === 0 || ticker.Score >= minScore) &&
                        (maxScore === 0 || ticker.Score <= maxScore) &&
                        (minVolume === 0 || parseVolumeValue(ticker.Volume) >= minVolume) &&
                        (maxVolume === 0 || parseVolumeValue(ticker.Volume) <= maxVolume)
                )
                .sort((a, b) => b.Score - a.Score);

        const filteredSession = applyFilters(sessionData);
        const filteredDaily = applyFilters(dailyData);
        const filteredAll = applyFilters(allData);

        console.log("✅ Filtered Session Data:", filteredSession);
        console.log("✅ Filtered Daily Data:", filteredDaily);

        // ✅ Limit number of displayed entries
        tickersSessions = filteredSession.slice(0, maxSessionLength);
        tickersDaily = filteredDaily.slice(0, maxDailyLength);

        console.log("✅ Final Session List:", tickersSessions);
        console.log("✅ Final Daily List:", tickersDaily);

        // ✅ Update previous ticker states
        prevTickersSessions = Object.fromEntries(tickersSessions.map((t) => [t.Symbol, t]));
        prevTickersDaily = Object.fromEntries(tickersDaily.map((t) => [t.Symbol, t]));

        // 🔄 Fetch the latest settings before updating
        const latestSettings = await window.settingsAPI.get();
        if (!latestSettings || !latestSettings.news) {
            console.error("❌ Failed to fetch latest settings. Skipping update.");
            return;
        }

        // ✅ Extract new filtered tickers
        const newFilteredTickers = filteredAll.map((t) => t.Symbol);

        // ✅ Check if filtered tickers have changed
        if (JSON.stringify(newFilteredTickers) !== JSON.stringify(latestSettings.news.filteredTickers)) {
            console.log("🔄 Updating filtered tickers in settings...");

            // ✅ Preserve other settings, only update `filteredTickers`
            const updatedSettings = {
                ...latestSettings,
                news: {
                    ...latestSettings.news,
                    filteredTickers: newFilteredTickers,
                },
            };

            // ✅ Save updated settings
            await window.settingsAPI.update(updatedSettings);

            // ✅ Keep local settings in sync
            window.settings = updatedSettings;
            console.log("✅ Saved filtered tickers to settings.news.filteredTickers:", updatedSettings.news.filteredTickers);
        }

        // ✅ Update UI
        updateTickersTable(tickersSessions, "tickers-session", oldTickersSessions);
        updateTickersTable(tickersDaily, "tickers-daily", oldTickersDaily);
        updateTickersTable(filteredAll, "tickers-all", {}); // ✅ No need to compare previous state

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
            ? [...new Set(tickers.flatMap((t) => Object.keys(t)))].filter((key) => key !== "Bonuses" && key !== "Time") // ✅ Exclude Bonuses
            : [...new Set([...Object.keys(tickers[0]), "Bonuses"])].filter((key) => enabledColumns[key] || key === "Symbol");

    // ✅ Generate the header dynamically
    tableHead.innerHTML = "<tr>" + allColumns.map((col) => `<th>${col}</th>`).join("") + "</tr>";

    // ✅ Populate table rows
    tickers.forEach((ticker) => {
        const row = document.createElement("tr");

        // 🔍 **Detect new or updated tickers**
        const prevTicker = prevTickers[ticker.Symbol];

        let isNew = !prevTicker; // Not found in previous state
        let isUpdated = prevTicker && (prevTicker.Price !== ticker.Price || prevTicker.Count !== ticker.Count || prevTicker.Score !== ticker.Score);

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
                cell.className = "symbol no-drag";
                cell.addEventListener("click", () => {
                    navigator.clipboard.writeText(ticker[key]);
                    console.log(`📋 Copied ${ticker[key]} to clipboard!`);
                    updateActiveTicker(ticker); // ✅ UPDATED: Set clicked ticker as active
                });
            } else if (key === "Score") {
                const ScoreBreakdown = getScoreBreakdown(ticker);
                cell.textContent = ticker[key];
                cell.className = "Score-tooltip no-drag";
                cell.setAttribute("title", ScoreBreakdown);
            } else if (key === "Bonuses") {
                // ✅ Insert dynamically styled bonus symbols
                cell.innerHTML = getBonusesHTML(ticker);
            } else if (key === "News"){
                if (Array.isArray(value)) {
                    value = value.length > 0 ? `📰` : "-"; // ✅ Fix for news column
                } else if (typeof value === "object" && value !== null) {
                    value = JSON.stringify(value); // ✅ Prevent [object Object]
                } else if (value === undefined || value === null) {
                    value = "-"; // ✅ Show dash for missing values
                }
            } else {
                let value = ticker[key];

                if (Array.isArray(value)) {
                    value = value.length > 0 ? `📰` : "-"; // ✅ Fix for news column
                } else if (typeof value === "object" && value !== null) {
                    value = JSON.stringify(value); // ✅ Prevent [object Object]
                } else if (value === undefined || value === null) {
                    value = "-"; // ✅ Show dash for missing values
                }

                cell.textContent = value;
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
    btn.textContent = "New Session 🧹";
    btn.className = "no-drag";
    btn.addEventListener("click", clearSessionList);

    // ✅ Insert the button before session tickers table
    const sessionTable = document.getElementById("tickers-session");
    sessionTable.parentNode.insertBefore(btn, sessionTable);
}

// Scoring System
function parseFloatValue(floatStr) {
    if (floatStr == null) return 0; // ✅ Ensure null/undefined returns 0
    let str = String(floatStr).trim(); // ✅ Convert to string and remove spaces
    let sanitized = str.replace(/[^0-9.]/g, ""); // ✅ Remove all non-numeric characters
    let value = parseFloat(sanitized) || 0;

    if (str.toUpperCase().includes("B")) value *= 1_000_000_000; // ✅ Convert "B" to billions
    if (str.toUpperCase().includes("M")) value *= 1_000_000; // ✅ Convert "M" to millions
    if (str.toUpperCase().includes("K")) value *= 1_000; // ✅ Convert "K" to thousands

    return value;
}

function parseVolumeValue(floatStr) {
    if (floatStr == null) return 0; // ✅ Ensure null/undefined returns 0
    let str = String(floatStr); // ✅ Convert to string
    let sanitized = str.replace(/[^0-9.]/g, "");
    let value = parseFloat(sanitized) || 0;

    if (str.toUpperCase().includes("K")) value *= 1_000; // Thousands
    if (str.toUpperCase().includes("M")) value *= 1_000_000; // Millions
    if (str.toUpperCase().includes("B")) value *= 1_000_000_000; // Billions

    return value;
}

function calculateScore(ticker) {
    let Score = ticker.Count || 0; // ✅ Ensure Count is always a number
    const floatValue = parseFloatValue(ticker.Float); // ✅ Convert Float to a real number
    const volumeValue = parseVolumeValue(ticker.Volume); // ✅ Convert Volume to a real number

    if (ticker.HighOfDay) Score += 20;

    
    let blockList = window.settings.news?.blockList || [];
    let filteredNews = [];
    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = newsItem.headline || ""; // Ensure headline is a string
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
            return !isBlocked; // Keep only non-blocked headlines
        });
    }

    // ✅ Add score only if there are valid (non-blocked) news items
    if (filteredNews.length > 0) {
        Score += 40;
    }

    // ✅ Float Size Bonuses & Penalties
    if (floatValue > 0 && floatValue < 2_000_000) {
        Score += 20; // 🔥 Strong bonus for ultra-low float
    } else if (floatValue >= 2_000_000 && floatValue < 5_000_000) {
        Score += 15;
    } else if (floatValue >= 5_000_000 && floatValue < 10_000_000) {
        Score += 10;
    } else if (floatValue >= 10_000_000 && floatValue < 50_000_000) {
        Score += 0; // No change
    } else if (floatValue >= 50_000_000 && floatValue < 100_000_000) {
        Score -= 10; // Small penalty for large float
    } else if (floatValue >= 100_000_000 && floatValue < 200_000_000) {
        Score -= 20;
    } else if (floatValue >= 200_000_000 && floatValue < 500_000_000) {
        Score -= 30;
    } else if (floatValue >= 500_000_000) {
        Score -= 50; // 🚨 Heavy penalty for massive float
    }

    // ✅ Volume Adjustment
    if (volumeValue < 300_000) {
        Score -= 20; // 🛑 Low volume is a bad sign
    }

    // ✅ Bonus: 5 points per million in volume
    Score += Math.floor(volumeValue / 1_000_000) * 5;

    return Score;
}

function getScoreBreakdown(ticker) {
    let breakdown = [];
    let Score = ticker.Count || 0; // ✅ Ensure Count is always a number
    const floatValue = parseFloatValue(ticker.Float); // ✅ Convert Float to real number
    const volumeValue = parseVolumeValue(ticker.Volume); // ✅ Convert Volume to real number

    breakdown.push(`Base Count: ${ticker.Count}`);
    breakdown.push(`---------------------`);

    if (ticker.HighOfDay) {
        Score += 20;
        breakdown.push(`High of Day: +20`);
    }

    let blockList = window.settings.news?.blockList || [];
    let filteredNews = [];
    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = newsItem.headline || ""; // Ensure headline is a string
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
            return !isBlocked; // Keep only non-blocked headlines
        });
    }

    if (filteredNews.length > 0) {
        Score += 40;
        breakdown.push(`Has News: +40`);
    }

    if (volumeValue < 300_000) {
        Score -= 20;
        breakdown.push(`Volume < 300K: -20`);
    }

    // ✅ Bonus: 5 points per million in volume
    const volumeBonus = Math.floor(volumeValue / 1_000_000) * 5;
    if (volumeBonus > 0) {
        Score += volumeBonus;
        breakdown.push(`Volume Bonus (${Math.floor(volumeValue / 1_000_000)}M): +${volumeBonus}`);
    }

    // ✅ Float Size Bonuses & Penalties
    if (floatValue > 0 && floatValue < 2_000_000) {
        Score += 20;
        breakdown.push(`Float < 2M: +20`);
    } else if (floatValue >= 2_000_000 && floatValue < 5_000_000) {
        Score += 15;
        breakdown.push(`Float 2M - 5M: +15`);
    } else if (floatValue >= 5_000_000 && floatValue < 10_000_000) {
        Score += 10;
        breakdown.push(`Float 5M - 10M: +10`);
    } else if (floatValue >= 50_000_000 && floatValue < 100_000_000) {
        Score -= 10;
        breakdown.push(`Float 50M - 100M: -10`);
    } else if (floatValue >= 100_000_000 && floatValue < 200_000_000) {
        Score -= 20;
        breakdown.push(`Float 100M - 200M: -20`);
    } else if (floatValue >= 200_000_000 && floatValue < 500_000_000) {
        Score -= 30;
        breakdown.push(`Float 200M - 500M: -30`);
    } else if (floatValue >= 500_000_000) {
        Score -= 50;
        breakdown.push(`Float > 500M: -50`);
    }

    breakdown.push(`---------------------`);
    breakdown.push(`Final Score: ${Score}`);

    return breakdown.join("\n");
}

// ✅ Find the ticker from tickersDaily only (ensures all attributes exist)
function findTickerBySymbol(symbol) {
    const foundTicker = tickersDaily.find((ticker) => ticker.Symbol === symbol);

    if (!foundTicker) {
        console.warn(`❌ Ticker ${symbol} not found in tickersDaily!`);
    }

    return foundTicker;
}

function updateActiveTicker(ticker) {
    const row = document.getElementById("active-ticker-row");
    const newsList = document.getElementById("news-list");

    if (!row || !newsList) return;

    console.log(`🔄 Updating Active Ticker: ${ticker.Symbol}`);

    // ✅ Ensure blockList, goodList, and badList exist
    let blockList = window.settings.news?.blockList || [];
    let goodList = window.settings.news?.goodList || [];
    let badList = window.settings.news?.badList || [];

    row.innerHTML = `
        <td>${ticker.Symbol}</td>
        <td>${ticker.Price}</td>
        <td>${ticker.ChangePercent}</td>
        <td>${ticker.FiveM}</td>
        <td>${ticker.Float}</td>
        <td>${ticker.Volume}</td>
        <td>${ticker.SprPercent}</td>
        <td>${ticker.HighOfDay}</td>
        <td>${ticker.Count}</td>
        <td>${Array.isArray(ticker.News) ? ticker.News.length : 0}</td>
        <td>${ticker.Score}</td>
    `;

    // ✅ Clear and re-render news list
    newsList.innerHTML = "";

    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        ticker.News.forEach((article) => {
            const headline = decodeHtmlEntities(article.headline || "");
            const articleURL = article.url || "#";

            function decodeHtmlEntities(text) {
                const txt = document.createElement("textarea");
                txt.innerHTML = text;
                return txt.value;
            }

            // ✅ Check if the headline contains blocklisted words/phrases
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));

            if (!isBlocked) {
                const li = document.createElement("li");

                const link = document.createElement("a");
                link.href = articleURL;
                link.textContent = headline;
                link.target = "_blank"; // ✅ Open in new tab
                link.rel = "noopener noreferrer"; // ✅ Security best practice
                link.title = `Published: ${new Date(article.created_at).toLocaleString()}`;

                // ✅ Apply CSS classes based on goodList and badList
                if (goodList.some((goodWord) => headline.toLowerCase().includes(goodWord.toLowerCase()))) {
                    link.classList.add("good-news");
                }
                if (badList.some((badWord) => headline.toLowerCase().includes(badWord.toLowerCase()))) {
                    link.classList.add("bad-news");
                }

                li.appendChild(link);
                newsList.appendChild(li);
            }
        });
    }

    if (newsList.innerHTML.trim() === "") {
        newsList.innerHTML = "<li style='opacity: 0.5'>No relevant news available</li>";
    }

    // ✅ Highlight ticker change
    row.style.background = "rgba(34, 139, 34, 0.4)";
    setTimeout(() => {
        row.style.background = "rgba(34, 139, 34, 0.2)";
    }, 1000);

    console.log("✅ Active ticker updated successfully!");
}

function getBonusesHTML(ticker) {
    console.log("🔎 Debugging Bonuses for:", ticker); // ✅ Log ticker object

    let bonuses = [];
    let tooltipText = [];

    const floatValue = parseFloatValue(ticker.Float); // ✅ Convert "2.5M" -> 2,500,000
    const volumeValue = parseVolumeValue(ticker.Volume); // ✅ Ensure Volume is converted

    let blockList = window.settings.news?.blockList || [];
    let filteredNews = [];
    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = newsItem.headline || ""; // Ensure headline is a string
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
            return !isBlocked; // Keep only non-blocked headlines
        });
    }

    if (filteredNews.length > 0) {
        bonuses.push(`<span class="bonus news no-drag">N</span>`);
        tooltipText.push(`N: Has News`);
    }

    if (ticker.HighOfDay) {
        bonuses.push('<span class="bonus high no-drag">H</span>');
        tooltipText.push("H: High of Day");
    }

    if (floatValue > 0 && floatValue < 2_000_000) {
        bonuses.push('<span class="bonus gold-float no-drag">2M</span>');
        tooltipText.push("2M: Float less than 2M");
    } else if (floatValue >= 2_000_000 && floatValue < 5_000_000) {
        bonuses.push('<span class="bonus silver-float no-drag">5M</span>');
        tooltipText.push("5M: Float between 2M - 5M");
    } else if (floatValue >= 5_000_000 && floatValue < 10_000_000) {
        bonuses.push('<span class="bonus bronze-float no-drag">10M</span>');
        tooltipText.push("10M: Float between 5M - 10M");
    } else if (floatValue >= 50_000_000 && floatValue < 100_000_000) {
        bonuses.push('<span class="bonus high-float no-drag">100M</span>');
        tooltipText.push("100M: Float between 50M - 100M");
    } else if (floatValue >= 100_000_000 && floatValue < 200_000_000) {
        bonuses.push('<span class="bonus high-float no-drag">200M</span>');
        tooltipText.push("200M: Float between 100M - 200M");
    } else if (floatValue >= 500_000_000) {
        bonuses.push('<span class="bonus high-float no-drag">500M</span>');
        tooltipText.push("500M: Float more than 500M");
    }

    if (volumeValue < 300_000) {
        bonuses.push('<span class="bonus low-volume no-drag">V-</span>');
        tooltipText.push("V: Low Volume (<300K)");
    }

    const volumeBonus = Math.floor(volumeValue / 1_000_000) * 5;
    if (volumeBonus > 0) {
        bonuses.push('<span class="bonus high-volume no-drag">V+</span>');
        tooltipText.push(`V+: Volume Bonus (${Math.floor(volumeValue / 1_000_000)}M)`);
    }

    if (bonuses.length === 0) {
        return "-"; // No bonuses
    }

    return `<span class="bonus-container" title="${tooltipText.join("\n")}">
                ${bonuses.join(" ")}
            </span>`;
}
