// Local arrays for UI processing
let tickersDaily = [];

// Store previous tickers for comparison
let prevTickersDaily = {};

// define floats
const floatOneMillionHigh = 2_000_000;
const floatFiveMillion = 7_500_000;
const floatTenMillion = 13_000_000;
const floatFiftyMillion = 65_000_000;
const floatHundredMillion = 125_000_000;
const floatTwoHundredMillion = 250_000_000;
const floatFiveHundredMillion = 600_000_000;

const symbolColors = {};

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Loading Daily Window...");

    await applySavedFilters();  // settingsAPI.get(); -> .invoke("get-settings") -> return appSettings;
    await fetchAndUpdateTickers(); // getTickers("daily"); -> .invoke("get-tickers", listType) ->  return tickerStore.getAllTickers(listType);

    // ✅ Listen for ticker updates
    window.dailyAPI.onTickerUpdate(() => {
        console.log("🔔 Lists updates received, fetching latest data...");
        fetchAndUpdateTickers();    // getTickers("daily"); -> .invoke("get-tickers", listType) ->  return tickerStore.getAllTickers(listType);
    });

    // ✅ Listen for news updates (new articles)
    window.dailyAPI.onNewsUpdate(({ ticker, newsItems }) => {
        console.log(`📰 Received ${newsItems.length} new articles for ${ticker}`); //
        fetchAndUpdateTickers(); // getTickers("daily"); -> .invoke("get-tickers", listType) ->  return tickerStore.getAllTickers(listType);
    });

    // ✅ Listen for settings updates globally
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);

        // ✅ Sync new settings globally
        window.settings = updatedSettings;

        // ✅ Re-apply filters & update UI
        await applySavedFilters();          // settingsAPI.get(); -> .invoke("get-settings") -> return appSettings;
        await fetchAndUpdateTickers();      // getTickers("daily"); -> .invoke("get-tickers", listType) ->  return tickerStore.getAllTickers(listType);
    });
});

async function fetchAndUpdateTickers() {
    try {
        console.log("Fetching updated tickers...");

        // ✅ Fetch tickers from API
        const dailyData = await window.dailyAPI.getTickers("daily");
        console.log("📊 Daily Data:", dailyData);

        // ✅ Store previous state for comparison
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
        const maxDailyLength = window.settings.top?.lists?.daily?.length ?? 10;

        console.log("Applying filters:", {
            minPrice,
            maxPrice,
            minFloat,
            maxFloat,
            minScore,
            maxScore,
            minVolume,
            maxVolume,
        });

        // ✅ Apply filters to each dataset
        const applyFilters = (data) =>
            data
                .map((ticker) => ({
                    ...ticker,
                    Score: calculateScore(ticker),
                    Float: ticker.Float !== undefined ? parseHumanNumber(ticker.Float) : null, // ✅ Ensure Float is handled
                    Volume: ticker.Volume !== undefined ? parseVolumeValue(ticker.Volume) : null, // ✅ Ensure Volume is handled
                }))
                .filter(
                    (ticker) =>
                        (minPrice === 0 || ticker.Price >= minPrice) &&
                        (maxPrice === 0 || ticker.Price <= maxPrice) &&
                        (minFloat === 0 || (ticker.Float !== null && ticker.Float >= minFloat)) && // ✅ Only check if Float exists
                        (maxFloat === 0 || (ticker.Float !== null && ticker.Float <= maxFloat)) && // ✅ Only check if Float exists
                        (minScore === 0 || ticker.Score >= minScore) &&
                        (maxScore === 0 || ticker.Score <= maxScore) &&
                        (minVolume === 0 || (ticker.Volume !== null && ticker.Volume >= minVolume)) && // ✅ Only check if Volume exists
                        (maxVolume === 0 || (ticker.Volume !== null && ticker.Volume <= maxVolume)) // ✅ Only check if Volume exists
                )
                .sort((a, b) => b.Score - a.Score);

        const filteredDaily = applyFilters(dailyData);
        console.log("✅ Filtered Daily Data:", filteredDaily);

        // ✅ Limit number of displayed entries
        tickersDaily = filteredDaily.slice(0, maxDailyLength);
        console.log("✅ Final Daily List after max length:", tickersDaily);

        // ✅ Update previous ticker states
        prevTickersDaily = Object.fromEntries(tickersDaily.map((t) => [t.Symbol, t]));

        // 🔄 Fetch the latest settings before updating
        const latestSettings = await window.settingsAPI.get();
        if (!latestSettings || !latestSettings.news) {
            console.error("❌ Failed to fetch latest settings. Skipping update.");
            return;
        }

        // ✅ Extract new filtered tickers
        const newFilteredTickers = filteredDaily.map((t) => t.Symbol);

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
        updateTickersList(tickersDaily, "tickers-daily", oldTickersDaily);

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
    tickersDaily = [];
}

function updateTickersList(tickers, listId, prevTickers) {
    const ul = document.getElementById(listId);

    // ✅ Ensure tickers array is not empty before calling Object.keys
    if (!tickers.length) {
        console.warn(`⚠️ No tickers available for ${listId}`);
        ul.innerHTML = "<li>No tickers available</li>"; // ✅ Clear existing list and show message
        return;
    }

    // 🔄 **Clear list before updating**
    ul.innerHTML = ""; // ✅ Prevent duplicates

    // ✅ Determine which columns should be displayed
    const listType = "daily";
    const enabledColumns = window.settings.top.lists?.[listType] || {};

    const allColumns = [...new Set([...Object.keys(tickers[0]), "Bonuses"])]
        .filter((key) => enabledColumns[key] || key === "Symbol");

    // ✅ Populate list items
    tickers.forEach((ticker) => {
        const li = document.createElement("li");
        li.classList.add("ticker-item");

        // 🔍 **Detect new or updated tickers**
        const prevTicker = prevTickers[ticker.Symbol];

        let isNew = !prevTicker;
        let isUpdated = prevTicker && (prevTicker.Price !== ticker.Price || prevTicker.Count !== ticker.Count || prevTicker.Score !== ticker.Score);

        if (isNew) {
            li.classList.add("highlight-new"); // 🟢 Apply new ticker highlight
        } else if (isUpdated) {
            li.classList.add("highlight-updated"); // 🟠 Apply update highlight
        }

        // ✅ Construct ticker row
        allColumns.forEach((key) => {
            const span = document.createElement("span");
            span.className = "ticker-data";

            if (key === "Symbol") {
                span.textContent = ticker[key];
                span.classList.add("symbol");
                span.style.cursor = "pointer";
                span.style.backgroundColor = getSymbolColor(ticker[key]);
                span.title = "A ticker symbol is a short, unique identifier for a publicly traded company.";
                span.addEventListener("click", () => {
                    navigator.clipboard.writeText(ticker[key]);
                    console.log(`📋 Copied ${ticker[key]} to clipboard!`);
                    window.activeAPI.setActiveTicker(ticker.Symbol);
                });
            } else if (key === "Price") {
                span.textContent = formatPrice(ticker[key]);
                span.title = "Last price update";
            } else if (key === "alertChangePercent") {
                span.textContent = ticker[key] + "%";
                span.title = "Last change update";
                if (ticker.Direction === "UP") {
                    span.classList.add("up");
                } else if (ticker.Direction === "DOWN") {
                    span.classList.add("down");
                }
            } else if (key === "cumulativeUpChange") {
                span.textContent = ticker[key] + "%";
                span.title = "Cumulative up change";
                span.classList.add("up");
            } else if (key === "cumulativeDownChange") {
                span.textContent = ticker[key] + "%";
                span.title = "Cumulative down change";
                span.classList.add("down");
            } else if (key === "fiveMinVolume") {
                span.textContent = formatVolume(ticker[key]);
                span.title = "Volume last 5 minutes";
            } else if (key === "Score") {
                span.textContent = ticker[key];
                span.classList.add("Score-tooltip");
                span.title = getScoreBreakdown(ticker);
            } else if (key === "Bonuses") {
                span.innerHTML = getBonusesHTML(ticker);
            } else {
                span.textContent = ticker[key];
            }

            li.appendChild(span);
        });

        ul.appendChild(li);
    });

    console.log(`✅ Finished updating list: ${listId}`);
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

function formatPrice(price) {
    if (typeof price !== "number" || isNaN(price)) return "$0.00";
    return `$${price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatVolume(volume) {
    if (volume >= 1_000_000_000) {
        return (volume / 1_000_000_000).toFixed(1) + "B"; // Billions
    } else if (volume >= 1_000_000) {
        return (volume / 1_000_000).toFixed(1) + "M"; // Millions
    } else if (volume >= 1_000) {
        return (volume / 1_000).toFixed(1) + "K"; // Thousands
    }
    return volume.toString(); // If less than 1K, return as is
}

function parseHumanNumber(str) {
    if (!str) return 0; // ✅ Ensure null/undefined returns 0
    let sanitized = String(str)
        .trim()
        .replace(/[^0-9.]/g, ""); // ✅ Remove non-numeric characters
    let value = parseFloat(sanitized) || 0;

    if (/B/i.test(str)) value *= 1_000_000_000; // ✅ Convert "B" to billions
    if (/M/i.test(str)) value *= 1_000_000; // ✅ Convert "M" to millions
    if (/K/i.test(str)) value *= 1_000; // ✅ Convert "K" to thousands

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

function truncateString(str, maxLength) {
    if (str.length > maxLength) {
        return str.slice(0, maxLength) + "..."; // Adds ellipsis at the end
    }
    return str;
}

function formatLargeNumber(value) {
    if (!value || isNaN(value)) return "-";
    const num = Number(value);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
    return num.toLocaleString();
}

function calculateScore(ticker) {
    // ✅ Use cumulativeUpChange instead of Count (default to 0 if missing)
    let Score = Math.floor(ticker.cumulativeUpChange || 0);

    const floatValue = parseHumanNumber(ticker.Float); // ✅ Convert Float to a real number
    const volumeValue = ticker.Volume !== undefined ? parseVolumeValue(ticker.Volume) : 0; // ✅ Ensure safe parsing
    const fiveMinVolume = parseVolumeValue(ticker.fiveMinVolume);

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
        Score += 50;
    }

    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        Score += 50;
    }

    // ✅ Float Size Bonuses & Penalties
    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        Score += 20; // 🔥 Strong bonus for ultra-low float
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        Score += 15;
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        Score += 10;
    } else if (floatValue >= floatTenMillion && floatValue < floatFiftyMillion) {
        Score += 0; // No change
    } else if (floatValue >= floatFiftyMillion && floatValue < floatHundredMillion) {
        Score -= 20; // Small penalty for large float
    } else if (floatValue >= floatHundredMillion && floatValue < floatTwoHundredMillion) {
        Score -= 40;
    } else if (floatValue >= floatTwoHundredMillion && floatValue < floatFiveHundredMillion) {
        Score -= 60;
    } else if (floatValue >= floatFiveHundredMillion) {
        Score -= 200; // 🚨 Heavy penalty for massive float
    }

    if (fiveMinVolume < 100_000) {
        Score -= 50;
    } else if (fiveMinVolume > 300_000) {
        Score += 50;
    }

    // ✅ Bonus: 5 points per million in volume
    if (volumeValue > 0) {
        Score += Math.floor(volumeValue / 1_000_000) * 2;
    }

    return Score;
}

function getScoreBreakdown(ticker) {
    let breakdown = [];
    let Score = Math.floor(ticker.cumulativeUpChange || 0); // ✅ Using cumulativeUpChange

    const floatValue = parseHumanNumber(ticker.Float);
    const volumeValue = parseVolumeValue(ticker.Volume);
    const fiveMinVolume = parseVolumeValue(ticker.fiveMinVolume);

    breakdown.push(`Base Up Change: ${ticker.cumulativeUpChange || 0}`);
    breakdown.push(`---------------------`);

    let blockList = window.settings.news?.blockList || [];
    let filteredNews = [];
    if (Array.isArray(ticker.News) && ticker.News.length > 0) {
        filteredNews = ticker.News.filter((newsItem) => {
            const headline = newsItem.headline || "";
            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));
            return !isBlocked;
        });
    }

    if (filteredNews.length > 0) {
        Score += 50;
        breakdown.push(`Has News: +50`);
    }

    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        Score += 50;
        breakdown.push("HOD: High of Day +50");
    }

    // ✅ Float Size Bonuses & Penalties
    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        Score += 20;
        breakdown.push(`Float <2M: +20`);
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        Score += 15;
        breakdown.push(`Float 2M-7.5M: +15`);
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        Score += 10;
        breakdown.push(`Float 7.5M-13M: +10`);
    } else if (floatValue >= floatFiftyMillion && floatValue < floatHundredMillion) {
        Score -= 20;
        breakdown.push(`Float 65M-125M: -20`);
    } else if (floatValue >= floatHundredMillion && floatValue < floatTwoHundredMillion) {
        Score -= 40;
        breakdown.push(`Float 125M-250M: -40`);
    } else if (floatValue >= floatTwoHundredMillion && floatValue < floatFiveHundredMillion) {
        Score -= 60;
        breakdown.push(`Float 250M-600M: -60`);
    } else if (floatValue >= floatFiveHundredMillion) {
        Score -= 200;
        breakdown.push(`Float 600M+: -200`);
    }

    if (fiveMinVolume < 100_000) {
        Score -= 50;
        breakdown.push(`Low volume: -50`);
    } else if (fiveMinVolume > 300_000) {
        Score += 50;
        breakdown.push(`High volume: +50`);
    }

    breakdown.push(`---------------------`);
    breakdown.push(`Final Score: ${Score}`);

    return breakdown.join("\n");
}

function getBonusesHTML(ticker) {
    let bonuses = [];
    let tooltipText = [];

    const floatValue = parseHumanNumber(ticker.Float);
    const volumeValue = parseVolumeValue(ticker.Volume);
    const fiveMinVolume = parseVolumeValue(ticker.fiveMinVolume);

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
        bonuses.push(`<span class="bonus news no-drag">📡</span>`);
        tooltipText.push(`📡: Has News`);
    }

    if (ticker.highestPrice !== undefined && ticker.Price === ticker.highestPrice) {
        bonuses.push('<span class="bonus high no-drag">📈</span>');
        tooltipText.push("HOD: High of Day");
    }

    if (floatValue > 0 && floatValue < floatOneMillionHigh) {
        bonuses.push('<span class="bonus gold-float no-drag">1M</span>');
        tooltipText.push("2M: Float less than 2M");
    } else if (floatValue >= floatOneMillionHigh && floatValue < floatFiveMillion) {
        bonuses.push('<span class="bonus silver-float no-drag">5M</span>');
        tooltipText.push("5M: Float between 2M-7.5M");
    } else if (floatValue >= floatFiveMillion && floatValue < floatTenMillion) {
        bonuses.push('<span class="bonus bronze-float no-drag">10M</span>');
        tooltipText.push("10M: Float between 7.5M-13M");
    } else if (floatValue >= floatFiftyMillion && floatValue < floatHundredMillion) {
        bonuses.push('<span class="bonus high-float no-drag">100M</span>');
        tooltipText.push("100M: Float between 65M-125M");
    } else if (floatValue >= floatHundredMillion && floatValue < floatTwoHundredMillion) {
        bonuses.push('<span class="bonus high-float no-drag">200M</span>');
        tooltipText.push("200M: Float between 125M-250M");
    } else if (floatValue >= floatTwoHundredMillion && floatValue < floatFiveHundredMillion) {
        bonuses.push('<span class="bonus high-float no-drag">500M</span>');
        tooltipText.push("500M: Float between 250M-500M");
    } else if (floatValue >= floatFiveHundredMillion) {
        bonuses.push('<span class="bonus high-float no-drag">B</span>');
        tooltipText.push("500M: Float more than 500M");
    }

    if (fiveMinVolume < 100_000) {
        bonuses.push('<span class="bonus low-volume no-drag">💤</span>');
        tooltipText.push("💤: Low Volume");
    } else if (fiveMinVolume > 300_000) {
        bonuses.push(`<span class="bonus high-volume no-drag">🔥</span>`);
        tooltipText.push("🔥: High Volume");
    }

    if (ticker.Industry && ticker.Industry === "Biotechnology") {
        bonuses.push('<span class="bonus bio no-drag">BIO</span>');
        tooltipText.push("BIO: Biotechnology stock");
    } else if (ticker.About && ticker.About.toLowerCase().includes("cannabis")) {
        bonuses.push('<span class="bonus cannabis no-drag">CAN</span>');
        tooltipText.push("CAN: Cannabis stock");
    }

    if (ticker.meta?.profile?.country && (ticker.meta.profile.country === "China" || ticker.meta.profile.country === "CN")) {
        bonuses.push('<span class="bonus cn no-drag">🇨🇳</span>');
        tooltipText.push("CN: Chinese based company");
    }

    if (ticker.meta?.profile?.country && (ticker.meta.profile.country === "HK" || ticker.meta.profile.country === "hk")) {
        bonuses.push('<span class="bonus hk no-drag">🇭🇰</span>');
        tooltipText.push("🇭🇰: Hong Kong based company");
    }

    console.log("ticker: ", ticker);

    if (bonuses.length === 0) {
        return ""; // No bonuses
    }

    return `<span class="bonus-container" title="${tooltipText.join("\n")}">${bonuses.join(" ")}</span>`;
}
