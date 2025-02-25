let currentActiveTicker = {}
document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Loading Active Window...");


    // ✅ Listen for settings updates globally
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated, applying changes...", updatedSettings);

        // ✅ Sync new settings globally
        window.settings = updatedSettings;

        // ✅ Refresh the active ticker UI
        if (currentActiveTicker) {
            updateActiveTicker(currentActiveTicker);
        }
    });

    window.tickers = await window.topAPI.getTickers("all");
    window.settings = await window.settingsAPI.get();

    // ✅ Listen for ticker updates
    window.topAPI.onTickerUpdate( async () => {
        console.log("🔔 Ticker update received, fetching latest tickers");
        window.tickers = await window.topAPI.getTickers("all");
    });

    initializeAccordion(); // ✅ Ensure accordion is initialized

    window.activeAPI.onActiveTickerUpdate((symbol) => {
        currentActiveTicker = tickers.find(t => t.Symbol === symbol)
        updateActiveTicker()
    });

    // ✅ Refresh the active ticker UI
    if (currentActiveTicker) {
        updateActiveTicker(currentActiveTicker);
    }

    // ✅ Reinitialize accordion after active ticker updates
    window.updateAccordion = function () {
        initializeAccordion();
    };
});

// ✅ Function to initialize or reinitialize the accordion event listeners
function initializeAccordion() {
    const accordionItems = document.querySelectorAll(".accordion-item");

    accordionItems.forEach((item) => {
        const header = item.querySelector(".accordion-header");

        header.removeEventListener("click", toggleAccordion); // Remove existing to prevent duplicate events
        header.addEventListener("click", toggleAccordion);
    });
}

// ✅ Function to toggle the accordion and close others
function toggleAccordion(event) {
    const item = event.currentTarget.parentNode;
    const accordionItems = document.querySelectorAll(".accordion-item");

    // Close all other accordions
    accordionItems.forEach((accordion) => {
        if (accordion !== item) {
            accordion.classList.remove("active");
        }
    });

    // Toggle the clicked accordion
    item.classList.toggle("active");
}

function truncateString(str, maxLength) {
    if (str.length > maxLength) {
        return str.slice(0, maxLength) + "..."; // Adds ellipsis at the end
    }
    return str;
}

/** Updates the UI with real-time ticker data and metadata across multiple dashboard sections
 *
 * @param {Object} ticker - The active ticker object containing financial data and metadata
 * @param {string} ticker.Symbol - Stock symbol (e.g., "AAPL")
 * @param {number} ticker.Price - Current price
 * @param {string} ticker.Float - Formatted float value
 * @param {number} ticker.Volume - Trading volume
 * @param {number} ticker.ChangePercent - Percentage price change
 * @param {Object} ticker.meta - Detailed metadata object
 * @param {Object[]} ticker.News - Array of news articles
 *
 * @returns {void} Updates DOM elements directly
 *
 * @example
 * updateActiveTicker({
 *   Symbol: "TSLA",
 *   Price: 250.50,
 *   Float: "1.2B",
 *   News: [{ headline: "Tesla launches new model", url: "...", created_at: "..." }],
 *   meta: {
 *     Industry: "Automotive",
 *     AnalystTargetPrice: 300,
 *     EBITDA: 1500000000
 *   }
 * });
 *
 * Key Functionality:
 * - Updates main ticker row with core statistics
 * - Filters and displays news articles with sentiment highlighting
 * - Populates detailed company overview accordion
 * - Updates analyst ratings and valuation metrics
 * - Handles data formatting/fallbacks for missing values
 * - Applies visual feedback on updates
 *
 * DOM Dependencies:
 * - #active-ticker-row: Main summary row
 * - #news-list: Container for filtered news
 * - Various overview elements (#overview-sector, #analyst-strongbuy, etc.)
 * - .accordion-item: Container for expandable sections
 *
 * External Dependencies:
 * - truncateString(): Utility for shortening long text
 * - decodeHtmlEntities(): Cleans HTML-encoded text
 * - formatLargeNumber(): Formats numeric values (e.g., 1.5M)
 * - window.settings.news: User-defined filter lists
 * - window.updateAccordion(): Manages accordion state
 *
 * Visual Features:
 * - Animated row highlight on update
 * - News sentiment coloring (bullish/bearish classes)
 * - Auto-expanded first accordion section
 * - Tooltips on news links
 * - Fallback "no data" displays
 */
function updateActiveTicker() {
    const row = document.getElementById("active-ticker-row");
    const newsList = document.getElementById("news-list");

    if (!row || !newsList) return;

    console.log(`🔄 Updating Active Ticker: ${currentActiveTicker.Symbol}`);

    let blockList = window.settings.news?.blockList || [];
    let bullishList = window.settings.news?.bullishList || [];
    let bearishList = window.settings.news?.bearishList || [];

    const industry = currentActiveTicker.meta?.Industry || "-";
    const truncatedIndustry = truncateString(industry, 19);

    row.innerHTML = `
        <td>${currentActiveTicker.Symbol}</td>
        <td>${currentActiveTicker.Price}</td>
        <td>${currentActiveTicker.Float}</td>
        <td>${currentActiveTicker.Volume}</td>
        <td>${currentActiveTicker.ChangePercent}%</td>
        <td>${(currentActiveTicker.meta?.ProfitMargin * 100).toFixed(2)}%</td>
        <td>${currentActiveTicker.meta?.["52WeekHigh"] || "-"}</td>
        <td>${currentActiveTicker.meta?.["52WeekLow"] || "-"}</td>
        <td>${currentActiveTicker.meta?.Beta || "-"}%</td>
        <td>${truncatedIndustry}</td>
        <td>${currentActiveTicker.meta?.Country || "-"}</td>
    `;

    if (document.getElementById("compay-desc")) document.getElementById("compay-desc").textContent = currentActiveTicker.meta?.Description || "-";

    newsList.innerHTML = "";
    if (Array.isArray(currentActiveTicker.News) && currentActiveTicker.News.length > 0) {
        currentActiveTicker.News.forEach((article) => {
            const headline = decodeHtmlEntities(article.headline || "");
            const articleURL = article.url || "#";

            function decodeHtmlEntities(text) {
                const txt = document.createElement("textarea");
                txt.innerHTML = text;
                return txt.value;
            }

            const isBlocked = blockList.some((blockedWord) => headline.toLowerCase().includes(blockedWord.toLowerCase()));

            if (!isBlocked) {
                const li = document.createElement("li");
                const link = document.createElement("a");

                link.href = articleURL;
                link.textContent = headline;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.title = `Published: ${new Date(article.created_at).toLocaleString()}`;

                if (bullishList.some((goodWord) => headline.toLowerCase().includes(goodWord.toLowerCase()))) {
                    link.classList.add("bullish-news");
                }
                if (bearishList.some((badWord) => headline.toLowerCase().includes(badWord.toLowerCase()))) {
                    link.classList.add("bearish-news");
                }

                li.appendChild(link);
                newsList.appendChild(li);
            }
        });
    }

    if (newsList.innerHTML.trim() === "") {
        const listItem = document.createElement("li");
        listItem.textContent = "No relevant news available";
        listItem.classList.add("no-news");
        newsList.appendChild(listItem);
    }
    row.style.background = "rgba(34, 139, 34, 0.4)";
    setTimeout(() => {
        row.style.background = "rgba(34, 139, 34, 0.2)";
    }, 1000);

    console.log("✅ Active ticker updated successfully!");

    if (currentActiveTicker.meta) {
        const meta = currentActiveTicker.meta;

        // ✅ Update Company Overview (Accordion)
        if (document.getElementById("overview-symbol")) document.getElementById("overview-symbol").textContent = currentActiveTicker.Symbol || "-";
        if (document.getElementById("overview-industry")) document.getElementById("overview-industry").textContent = meta.Industry || "-";
        if (document.getElementById("overview-sector")) document.getElementById("overview-sector").textContent = meta.Sector || "-";
        if (document.getElementById("overview-country")) document.getElementById("overview-country").textContent = meta.Country || "-";
        if (document.getElementById("overview-profitmargin")) document.getElementById("overview-profitmargin").textContent = meta.ProfitMargin ? `${(meta.ProfitMargin * 100).toFixed(2)}%` : "-";
        if (document.getElementById("overview-52high")) document.getElementById("overview-52high").textContent = meta["52WeekHigh"] || "-";
        if (document.getElementById("overview-52low")) document.getElementById("overview-52low").textContent = meta["52WeekLow"] || "-";
        if (document.getElementById("overview-beta")) document.getElementById("overview-beta").textContent = meta.Beta || "-";

        // ✅ Update General Information
        if (document.getElementById("general-symbol")) document.getElementById("general-symbol").textContent = currentActiveTicker.Symbol || "-";
        if (document.getElementById("general-name")) document.getElementById("general-name").textContent = meta.Name || "-";
        if (document.getElementById("general-country")) document.getElementById("general-country").textContent = meta.Country || "-";
        if (document.getElementById("general-address")) document.getElementById("general-address").textContent = meta.Address || "-";
        if (document.getElementById("general-industry")) document.getElementById("general-industry").textContent = meta.Industry || "-";
        if (document.getElementById("general-sector")) document.getElementById("general-sector").textContent = meta.Sector || "-";
        if (document.getElementById("general-exchange")) document.getElementById("general-exchange").textContent = meta.Exchange || "-";
        if (document.getElementById("general-website"))
            document.getElementById("general-website").innerHTML = meta.OfficialSite ? `<a href="${meta.OfficialSite}" target="_blank" rel="noopener noreferrer">${meta.OfficialSite}</a>` : "-";

        // ✅ Update Analyst Ratings
        if (document.getElementById("analyst-targetprice")) document.getElementById("analyst-targetprice").textContent = meta.AnalystTargetPrice || "-";
        if (document.getElementById("analyst-strongbuy")) document.getElementById("analyst-strongbuy").textContent = meta.AnalystRatingStrongBuy || "-";
        if (document.getElementById("analyst-buy")) document.getElementById("analyst-buy").textContent = meta.AnalystRatingBuy || "-";
        if (document.getElementById("analyst-hold")) document.getElementById("analyst-hold").textContent = meta.AnalystRatingHold || "-";
        if (document.getElementById("analyst-sell")) document.getElementById("analyst-sell").textContent = meta.AnalystRatingSell || "-";
        if (document.getElementById("analyst-strongsell")) document.getElementById("analyst-strongsell").textContent = meta.AnalystRatingStrongSell || "-";

        // ✅ Update Valuation Metrics
        if (document.getElementById("finansial-eps")) document.getElementById("finansial-eps").textContent = meta.EPS || "-";
        if (document.getElementById("finansial-marketcap")) document.getElementById("finansial-marketcap").textContent = formatLargeNumber(meta.MarketCapitalization);
        if (document.getElementById("finansial-bookvalue")) document.getElementById("finansial-bookvalue").textContent = meta.BookValue || "-";
        if (document.getElementById("finansial-revenue-ttm")) document.getElementById("finansial-revenue-ttm").textContent = formatLargeNumber(meta.RevenueTTM);
        if (document.getElementById("finansial-ebitda")) document.getElementById("finansial-ebitda").textContent = formatLargeNumber(meta.EBITDA);
        if (document.getElementById("finansial-profitmargin")) document.getElementById("finansial-profitmargin").textContent = meta.ProfitMargin ? `${(meta.ProfitMargin * 100).toFixed(2)}%` : "-";
        if (document.getElementById("finansial-trailingpe")) document.getElementById("finansial-trailingpe").textContent = meta.TrailingPE || "-";
        if (document.getElementById("finansial-forwardpe")) document.getElementById("finansial-forwardpe").textContent = meta.ForwardPE || "-";
        if (document.getElementById("finansial-psr")) document.getElementById("finansial-psr").textContent = meta.PriceToSalesRatioTTM || "-";
        if (document.getElementById("finansial-pbr")) document.getElementById("finansial-pbr").textContent = meta.PriceToBookRatio || "-";
        if (document.getElementById("finansial-evrevenue")) document.getElementById("finansial-evrevenue").textContent = meta.EVToRevenue || "-";
        if (document.getElementById("finansial-evebitda")) document.getElementById("finansial-evebitda").textContent = meta.EVToEBITDA || "-";

        // ✅ Make Website Clickable
        const websiteElement = document.getElementById("overview-website");
        if (websiteElement) {
            websiteElement.innerHTML = meta.OfficialSite ? `<a href="${meta.OfficialSite}" target="_blank" rel="noopener noreferrer">${meta.OfficialSite}</a>` : "-";
        }

        // ✅ Open "Company Overview" Automatically
        document.querySelector(".accordion-item:first-child")?.classList.add("active");

        console.log("✅ Overview section updated successfully!");
        window.updateAccordion();
    }
}
