/**
 * ACTIVE WINDOW - NEWS & FILINGS DISPLAY
 * 
 * This file handles the active window's news and filings display functionality.
 * 
 * DATA STRUCTURES:
 * 
 * News Items (Standardized):
 * {
 *   'symbol': 'AAPL',                       # Stock symbol
 *   'headline': 'Apple Reports Strong Q4 Earnings',
 *   'source': 'alpaca',                     # or 'alpaca_historical'
 *   'url': 'https://example.com/news/article',  # Link field
 *   'published_at': '2025-01-10T14:30:00-04:00',  # ET timezone (primary timestamp)
 *   'received_at': '2025-01-10T14:35:00-04:00',   # When we got it (fallback)
 *   'created_at': '2025-01-10T14:30:00-04:00',    # Fallback timestamp
 *   'updated_at': '2025-01-10T14:30:00-04:00',    # Fallback timestamp
 *   'is_historical': False,                 # True for historical collector
 *   'alpaca_id': '12345',                   # Alpaca's internal ID
 *   'summary': 'Article summary...',        # News summary
 *   'author': 'John Doe',                   # Article author
 *   'content': 'Full article content...',   # Article content (not 'body')
 * }
 * 
 * Filing Items (Standardized):
 * {
 *   'symbol': 'AAPL',                       # Stock symbol
 *   'cik': '0000320193',                    # SEC CIK identifier
 *   'form_type': '8-K',                     # SEC form type
 *   'form_description': 'Current Report',   # Human-readable form description
 *   'title': 'Current Report Pursuant to Section 13 or 15(d)',
 *   'company_name': 'Apple Inc.',
 *   'accession_number': '000032019325000001',  # Unique SEC identifier
 *   'accession_with_dashes': '0000320193-25-000001',
 *   'filing_date': '2025-01-10T14:30:00-04:00',  # ET timezone (primary timestamp)
 *   'filing_url': 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000001/aapl-8k_20250110.htm',
 *   'priority': 1,                          # High priority (1=High, 2=Medium, 3=Low)
 *   'summary': 'Form 8-K filing summary...', # Filing summary
 *   'source': 'sec_rss',                    # or 'sec_historical'
 *   'received_at': '2025-01-10T14:35:00-04:00'  # When we received it
 * }
 * 
 * KEY FUNCTIONALITY:
 * 
 * 1. NEWS COLLAPSE FEATURE:
 *    - News items show EXPANDED view (full content, images, author, source) for first 4 minutes
 *    - After 4 minutes, automatically collapse to COMPACT view (headline, time, author only)
 *    - Uses ET timezone for accurate time comparison
 *    - Filings always show in single consistent format (no collapse)
 * 
 * 2. TIMESTAMP HANDLING:
 *    - News: published_at → received_at → created_at → updated_at
 *    - Filings: filing_date (primary)
 *    - All timestamps are in ET timezone
 * 
 * 3. RENDERING:
 *    - Combined news + filings timeline, sorted by timestamp (newest first)
 *    - News items get 'collapsed' or 'expanded' CSS classes
 *    - Clickable headlines/links open in new tabs
 *    - Sentiment analysis applied to news items (bullish/bearish/neutral)
 * 
 * 4. FILTERING:
 *    - News filtered by active symbol
 *    - Blocklist filtering applied to news headlines
 *    - Filing deduplication by accession_number
 * 
 * 5. DEBUG LOGGING:
 *    - Only enabled in dev mode (isDev flag)
 *    - Reduced console noise in production
 */

// Global object to store chart instances
window.ownershipCharts = {};
const symbolColors = {};

const { isDev } = window.appFlags;

// Oracle news and filing data management
let allOracleNews = [];
let allOracleFilings = [];
let currentActiveSymbol = null;
let newsSettings = {}; // Store news settings for sentiment analysis and filtering

// Mock test data for testing purposes only (not used in dev mode)
function createMockNewsData() {
    const now = Date.now();
    const fifteenMinutesAgo = now - (15 * 60 * 1000);
    const oneHourAgo = now - (60 * 60 * 1000);
    
    return [
        {
            symbol: "AAPL",
            headline: "Apple Reports Record Q4 Revenue Despite Supply Chain Challenges",
            body: "Apple Inc. reported record fourth-quarter revenue of $94.8 billion, up 8% year-over-year, despite ongoing supply chain disruptions. The company's services segment showed particularly strong growth, with revenue increasing 16% to $19.2 billion. CEO Tim Cook highlighted the company's resilience in navigating global supply challenges while maintaining strong customer demand for its products.",
            author: "John Doe",
            location: "Cupertino, CA",
            time: new Date(now).toISOString(),
            image: "https://via.placeholder.com/400x200/007ACC/FFFFFF?text=Apple+News",
            url: "https://example.com/apple-q4-revenue",
            source: "Reuters",
            category: "Earnings",
            sentiment: "positive"
        },
        {
            symbol: "AAPL",
            headline: "Apple Announces New iPhone 15 Pro with Advanced Camera System",
            body: "Apple has unveiled the iPhone 15 Pro featuring a revolutionary camera system with 48MP main sensor and advanced computational photography. The new device also includes the A17 Pro chip, titanium construction, and USB-C connectivity.",
            author: "Jane Smith",
            location: "San Francisco, CA",
            time: new Date(fifteenMinutesAgo).toISOString(),
            image: "https://via.placeholder.com/400x200/FF6B6B/FFFFFF?text=iPhone+15+Pro",
            url: "https://example.com/iphone-15-pro",
            source: "TechCrunch",
            category: "Product Launch",
            sentiment: "positive"
        },
        {
            symbol: "AAPL",
            headline: "Apple Stock Surges 5% on Strong Services Growth",
            body: "Apple shares jumped 5% in after-hours trading following the company's announcement of record services revenue. The App Store, iCloud, and Apple Music all showed double-digit growth.",
            author: "Mike Johnson",
            location: "New York, NY",
            time: new Date(oneHourAgo).toISOString(),
            image: "https://via.placeholder.com/400x200/4ECDC4/FFFFFF?text=Stock+Surge",
            url: "https://example.com/apple-stock-surge",
            source: "Bloomberg",
            category: "Market",
            sentiment: "positive"
        }
    ];
}

// Test function to load mock data (for testing purposes only)
function loadMockNewsData() {
    // console.log("🧪 Loading mock news data for testing...");
    allOracleNews = createMockNewsData();
    // console.log(`🧪 Loaded ${allOracleNews.length} mock news items`);
    
    // Dump mock data structure
    // console.log("🔍 === MOCK NEWS OBJECT STRUCTURE ===");
    // console.log("🔍 First mock item:", allOracleNews[0]);
    // console.log("🔍 Available fields:", Object.keys(allOracleNews[0]));
    // console.log("🔍 ==================================");
    
    renderOracleNews();
}

function getNewsSentimentClass(newsItem) {
    const lowerHeadline = (newsItem.headline || "").toLowerCase();
    const bullishList = newsSettings?.bullishList || [];
    const bearishList = newsSettings?.bearishList || [];

    if (bullishList.some((term) => lowerHeadline.includes(term.toLowerCase()))) {
        return "bullish";
    }
    if (bearishList.some((term) => lowerHeadline.includes(term.toLowerCase()))) {
        return "bearish";
    }
    return "neutral";
}

// Initialize Oracle news integration
async function initializeOracleNews() {
    // console.log("📰 Initializing Oracle news integration for active view...");
    
    // Check if newsAPI is available
    if (!window.newsAPI) {
        // console.error("❌ newsAPI not available in active view");
        return;
    }
    
    // console.log("✅ newsAPI is available:", Object.keys(window.newsAPI));
    
    try {
        // 1. HYDRATE - Get initial headlines from Oracle
        // console.log("📰 Requesting headlines from Oracle...");
        const headlines = await window.newsAPI.getHeadlines();
        // console.log("📰 Received headlines response:", headlines);
        
        if (Array.isArray(headlines)) {
            allOracleNews = headlines;
            // console.log(`📰 Active view hydrated: ${allOracleNews.length} headlines`);
            
            // Dump first news object structure for analysis
            if (headlines.length > 0) {
                // console.log("🔍 === RAW NEWS OBJECT STRUCTURE FROM ACTIVE VIEW ===");
                // console.log("🔍 First news item:", JSON.stringify(headlines[0], null, 2));
                // console.log("🔍 Available fields:", Object.keys(headlines[0]));
                // console.log("🔍 Sample of first 3 news items:");
                // headlines.slice(0, 3).forEach((item, index) => {
                //     console.log(`🔍 News item ${index + 1}:`, {
                //         symbol: item.symbol,
                //         headline: item.headline?.substring(0, 50) + "...",
                //         hasBody: !!item.body,
                //         hasAuthor: !!item.author,
                //         hasLocation: !!item.location,
                //         hasImage: !!item.image,
                //         hasImageCaption: !!item.image_caption,
                //         hasSummary: !!item.summary,
                //         hasContent: !!item.content,
                //         hasAlpacaData: !!item.alpaca_data,
                //         timestamp: item.created_at ?? item.received_at ?? item.updated_at,
                //         url: item.url,
                //         source: item.source,
                //         priority: item.priority,
                //         allFields: Object.keys(item),
                //         alpacaDataParsed: item.alpaca_data ? JSON.parse(item.alpaca_data) : null
                //     });
                // });
                // console.log("🔍 ==============================================");
            }
            
            // Filing display now handled in renderOracleNews() when UI updates
        } else {
            console.warn("⚠️ Headlines response is not an array:", headlines);
        }
    } catch (e) {
        console.warn("⚠️ Oracle news hydration failed:", e);
    }

    // 2. SUBSCRIBE - Listen for Oracle news updates
    window.newsAPI.onHeadlines((headlines) => {
        if (Array.isArray(headlines)) {
            allOracleNews = headlines;
            // console.log(`📰 Active view full refresh: ${allOracleNews.length} headlines`);
            
            // Dump sample of headlines for debugging
            if (headlines.length > 0) {
                // console.log("🔍 === HEADLINES REFRESH SAMPLE ===");
                // headlines.slice(0, 2).forEach((item, index) => {
                //     console.log(`🔍 Headline ${index + 1}:`, {
                //         symbol: item.symbol,
                //         headline: item.headline?.substring(0, 50) + "...",
                //         hasBody: !!item.body,
                //         hasAuthor: !!item.author,
                //         hasLocation: !!item.location,
                //         hasImage: !!item.image_url,
                //         timestamp: item.created_at || item.updated_at
                //     });
                // });
                // console.log("🔍 ================================");
            }
            
            // Filing display now handled in renderOracleNews() when UI updates
        }
    });

    window.newsAPI.onDelta((newsItem) => {
        if (newsItem) {
            // Dump delta news object structure
            // console.log("🔍 === DELTA NEWS OBJECT ===");
            // console.log("🔍 Delta news item:", newsItem);
            // console.log("🔍 Available fields:", Object.keys(newsItem));
            // console.log("🔍 =========================");
            
            // Add to beginning for latest first
            allOracleNews.unshift(newsItem);
            
            // Keep only last 1000 headlines to prevent memory bloat
            if (allOracleNews.length > 1000) {
                allOracleNews = allOracleNews.slice(0, 1000);
            }
            
            // console.log(`📰 Active view delta: +1 (total: ${allOracleNews.length})`);
            // Filing display now handled in renderOracleNews() when UI updates
        }
    });

    // Listen for Oracle hydration completion to refresh data
    window.newsAPI.onHydrationComplete(() => {
        console.log("🔄 [ACTIVE] Oracle hydration complete - refreshing news data...");
        
        // Clear existing data
        allOracleNews = [];
        
        // Re-fetch data from Oracle
        window.newsAPI.getHeadlines().then((headlines) => {
            if (Array.isArray(headlines)) {
                allOracleNews = headlines;
                console.log(`📰 [ACTIVE] Refreshed: ${allOracleNews.length} headlines after hydration`);
            }
            // Re-render the active view with updated data
            renderOracleNews();
        }).catch((e) => {
            console.warn("📰 [ACTIVE] Failed to refresh headlines after hydration:", e);
        });
    });
}

    // Filing integration not needed - filings come from store.attachFilingToSymbol()
    // The active view displays filings from symbolData.Filings (attached by store)
    
    // Debug: Check if filingAPI is available
    if (window.filingAPI) {
        console.log("📁 [ACTIVE] filingAPI is available:", Object.keys(window.filingAPI));
    } else {
        console.warn("📁 [ACTIVE] filingAPI not available");
    }

document.addEventListener("DOMContentLoaded", async () => {
    // console.log("⚡ DOMContentLoaded event fired!");

    // console.log("🟢 Notifying active-window-ready");
    window.activeAPI.notifyActiveWindowReady();

    // Load settings globally
    try {
        window.settings = await window.settingsAPI.get();
        // console.log("✅ Settings loaded in active window:", window.settings);
    } catch (e) {
        console.warn("⚠️ Failed to load settings in active window:", e);
        window.settings = {}; // fallback
    }

    // Load news settings for sentiment analysis and filtering
    try {
        newsSettings = await window.newsSettingsAPI.get();
        // console.log("✅ News settings loaded in active window:", newsSettings);
    } catch (e) {
        console.warn("⚠️ Failed to load news settings in active window:", e);
        newsSettings = {}; // fallback
    }

    // Subscribe to news settings changes
    window.newsSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings) {
            newsSettings = updatedSettings;
            // console.log("📰 News settings updated in active window:", newsSettings);
            
            // Re-render if lists changed (affects sentiment colors and filtering)
            if (updatedSettings.blockList || updatedSettings.bullishList || updatedSettings.bearishList) {
                // console.log("📰 News lists updated, re-rendering for sentiment changes");
                renderOracleNews();
            }
        }
    });

    // Initialize Oracle news integration
    
    await initializeOracleNews();

    // Initialize UI with no symbol data
    updateUI(null); // Show "No active symbol" placeholder

    try {
        // Listen for active ticker updates
        window.activeAPI.onActiveTickerUpdate(async (symbol) => {
            console.log(`🔄 [ACTIVE] Active ticker updated: ${symbol}`);
            const symbolData = await window.activeAPI.getSymbol(symbol);

            if (symbolData) {
                console.log(`🔄 [ACTIVE] Symbol data received for ${symbol}:`, {
                    hasFilings: !!symbolData.Filings,
                    filingsCount: symbolData.Filings?.length || 0,
                    symbolKeys: Object.keys(symbolData)
                });
                updateUI(symbolData); // Update UI with symbol data
            } else {
                console.warn(`[ACTIVE] No data found for symbol: ${symbol}`);
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

        // // Make tab bar stay visible when hovering anywhere over app or the tab itself
        // [appContainer, tabWrapper].forEach((el) => {
        //     el.addEventListener("mouseenter", showTab);
        //     el.addEventListener("mouseleave", scheduleHide);
        // });
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
        // console.log("No symbol data found. Showing placeholder.");
        noActiveSymbolElement.classList.add("visible");

        tabs.forEach((el) => (el.style.display = "none"));
        
        // Clear active symbol and render empty news and filings
        currentActiveSymbol = null;
        renderOracleNews(null);
        return;
    }

    // Hide placeholder & show tabs
    noActiveSymbolElement.classList.remove("visible");
    tabs.forEach((el) => (el.style.display = ""));

    // console.log(`[active.js] Updating UI for symbol: ${symbolData.symbol}`);
    // console.log("symbolData:", symbolData);

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

    // Update current active symbol for news and filing filtering
    currentActiveSymbol = symbolData.symbol;
    
    // Render Oracle news and filings (filtered by active symbol)
    renderOracleNews(symbolData);

    /* --- helpers --- */

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
    if (score >= 150) return "🏆 LEGEND";
    if (score >= 100) return "🌟 EXCELLENT";
    if (score >= 50) return "👍 GOOD";
    if (score >= 0) return "🙂 OK";
    if (score >= -25) return "😬 POOR";
    if (score >= -50) return "😣 WEAK"; // Notice: -1 to -100
    return "💀 BAD"; // -101 or worse
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
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric"     });
}

// Helper function to extract timestamp from standardized news format
function getNewsTimestamp(newsItem) {
    // Try different timestamp fields in order of preference
    const timestampStr = newsItem.published_at || newsItem.received_at || newsItem.created_at || newsItem.updated_at;
    
    if (!timestampStr) return 0;
    
    // Parse the timestamp string directly (already in ET timezone)
    return new Date(timestampStr).getTime();
}

// Helper function to format news timestamps
function formatNewsTime(ts) {
    const ms = parseTs(ts);
    if (Number.isNaN(ms)) return "";
    // Backend provides dates in ET timezone, display in ET to preserve original timezone
    const d = new Date(ms);
    const now = new Date();

    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();

    return sameDay
        ? d.toLocaleTimeString([], { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })
        : d.toLocaleString([], {
              timeZone: "America/New_York",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
          });
}

// Helper function to parse timestamps
function parseTs(t) {
    if (t == null) return NaN;
    if (typeof t === "number") return t < 1e12 ? t * 1000 : t; // secs → ms
    const n = Number(t);
    if (!Number.isNaN(n)) return parseTs(n);
    const d = new Date(t).getTime();
    return Number.isNaN(d) ? NaN : d;
}

// Render Oracle news and filings for the active symbol (summary page only)
function renderOracleNews(symbolData = null) {
    // Find the news container in the summary page
    const newsContainer = document.querySelector("#news-container");
    
    if (!newsContainer) {
        console.warn("⚠️ News container not found in summary page");
        return;
    }
    
    newsContainer.innerHTML = "";
    
    // console.log(`🔍 renderOracleNews called - Active symbol: ${currentActiveSymbol}, Total news: ${allOracleNews.length}, Symbol filings: ${symbolData?.Filings?.length || 0}`);
    
    if (!currentActiveSymbol || !symbolData) {
        newsContainer.innerHTML = '<p style="opacity:0.1; color: white">no active symbol</p>';
        return;
    }
    
    // Combine news and filings into one timeline
    const allItems = [];
    
    // Filter news for the current active symbol
    const symbolNews = allOracleNews.filter((newsItem) => {
        const newsSymbol = newsItem.symbol || newsItem.symbols?.[0];
        return newsSymbol && newsSymbol.toUpperCase() === currentActiveSymbol.toUpperCase();
    });
    
    // Apply blocklist filtering to news
    const blockList = newsSettings?.blockList || [];
    // console.log(`📰 Filtering ${symbolNews.length} news items with block list:`, blockList);
    const filteredNews = symbolNews.filter((newsItem) => {
        const headline = sanitize(newsItem.headline || "");
        const isBlocked = blockList.some((blocked) => headline.includes(sanitize(blocked)));
        if (isBlocked) {
            // console.log(`🚫 News item blocked: "${headline}" (matched: "${blockList.find(blocked => headline.includes(sanitize(blocked)))}")`);
        }
        return !isBlocked;
    });
    // console.log(`📰 After filtering: ${filteredNews.length} news items remaining`);
    
    // Add news items
    filteredNews.forEach(newsItem => {
        allItems.push({
            type: 'news',
            data: newsItem,
            timestamp: getNewsTimestamp(newsItem)
        });
    });
    
    // Get filings from the symbol data itself (attached via store.attachFilingToSymbol)
    const symbolFilings = symbolData?.Filings || [];
    
    
    // Deduplicate filings by accession_number to prevent double rendering
    const uniqueFilings = symbolFilings.filter((filing, index, self) => {
        return index === self.findIndex(f => f.accession_number === filing.accession_number);
    });
    
    // console.log(`🔍 Deduplicated filings: ${symbolFilings.length} -> ${uniqueFilings.length}`);
    
    // Add filing items
    uniqueFilings.forEach(filingItem => {
        allItems.push({
            type: 'filing',
            data: filingItem,
            timestamp: getFilingTimestamp(filingItem)
        });
    });
    
    // Sort by timestamp (newest first)
    const sorted = allItems.sort((a, b) => b.timestamp - a.timestamp);
    
    if (sorted.length === 0) {
        newsContainer.innerHTML = '<p style="opacity:0.1; color: white">no recent news or filings available</p>';
        return;
    }
    
    sorted.forEach((item) => {
        if (item.type === 'news') {
            const newsItem = item.data;
            const sentimentClass = getNewsSentimentClass(newsItem);
            const ts = getNewsTimestamp(newsItem);
            const when = ts ? formatNewsTime(new Date(ts)) : "";
            const isCollapsed = isNewsItemCollapsed(newsItem);
            
            const itemDiv = document.createElement("div");
            itemDiv.className = `news-item ${sentimentClass} ${isCollapsed ? 'collapsed' : 'expanded'}`;
            itemDiv.style.padding = '0'; // Reduce padding to match filings
            itemDiv.style.borderBottom = 'none'; // Remove any default borders
            
            // Extract standardized fields
            const author = newsItem.author || '';            
            if (isCollapsed) {
                // Collapsed view - just headline and time
                itemDiv.innerHTML = `
                    <div class="news-content">
                        <h5 class="news-title-clickable" style="cursor: pointer;">${newsItem.headline || "Untitled"}</h5>
                        <div class="news-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                            <div class="news-meta-left">
                                ${when ? `<span class="news-time">${when}</span>` : ''}
                                ${author ? `<span class="news-author" style="margin-left: 8px;">${author}</span>` : ''}
                            </div>
                        </div>
                        <div class="news-separator" style="border-bottom: 1px solid #333; margin-top: 8px; margin-bottom: 8px;"></div>
                    </div>
                `;
            } else {
                // Expanded view - full content with image, body, etc.
                itemDiv.innerHTML = `
                    ${newsItem.image_url ? `
                        <div class="news-image-container">
                            <img src="${newsItem.image_url}" alt="News image" class="news-image" />
                            ${newsItem.image_caption ? `<div class="news-image-caption">${newsItem.image_caption}</div>` : ''}
                        </div>
                    ` : ''}
                    <div class="news-content">
                        <h5 class="news-title-clickable" style="cursor: pointer;">${newsItem.headline || "Untitled"}</h5>
                        ${newsItem.content || newsItem.summary ? `
                            <div class="news-body">${newsItem.content || newsItem.summary}</div>
                        ` : ''}
                        <div class="news-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                            <div class="news-meta-left">
                                ${when ? `<span class="news-time">${when}</span>` : ''}
                                ${author ? `<span class="news-author" style="margin-left: 8px;">${author}</span>` : ''}
                            </div>
                        </div>
                        <div class="news-separator" style="border-bottom: 1px solid #333; margin-top: 8px; margin-bottom: 8px;"></div>
                    </div>
                `;
            }
            
            // Make only the headline clickable if there's a URL
            if (newsItem.url) {
                const titleElement = itemDiv.querySelector('.news-title-clickable');
                if (titleElement) {
                    titleElement.addEventListener("click", () => {
                        window.open(newsItem.url, "_blank", "noopener,noreferrer");
                    });
                }
            }
            
            newsContainer.appendChild(itemDiv);
        } else if (item.type === 'filing') {
            const filingItem = item.data;
            const ts = getFilingTimestamp(filingItem);
            const when = ts ? formatFilingTime(new Date(ts)) : "";
            
            const itemDiv = document.createElement("div");
            itemDiv.className = `filing-item`;
            itemDiv.style.padding = '0'; // Consistent padding with news items
            itemDiv.style.borderBottom = 'none'; // Remove any default borders
            
            // Standardized filing format: Form Type - Title, Description, Time + SEC.gov link
            const formType = filingItem.form_type || 'Filing';
            const title = filingItem.title || 'SEC Filing';
            const description = filingItem.form_description || '';
            const secLink = filingItem.filing_url ? 'SEC.gov' : '';
            
            itemDiv.innerHTML = `
                <h5 class="filing-title-clickable" style="cursor: pointer;">Form ${title}</h5>
                ${description ? `<div class="filing-description">${description}</div>` : ''}
                <div class="filing-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <div class="filing-meta-left">
                        ${when ? `<span class="filing-time">${when}</span>` : ''}
                    </div>
                    ${secLink ? `<span class="filing-sec-link">${secLink}</span>` : ''}
                </div>
                <div class="filing-separator" style="border-bottom: 1px solid #333; margin-top: 8px; margin-bottom: 8px;"></div>
            `;
            
            // Make only the title clickable if there's a URL
            if (filingItem.filing_url) {
                const titleElement = itemDiv.querySelector('.filing-title-clickable');
                if (titleElement) {
                    titleElement.addEventListener("click", () => {
                        window.open(filingItem.filing_url, "_blank", "noopener,noreferrer");
                    });
                }
            }
            
            newsContainer.appendChild(itemDiv);
        }
    });
    
    // Log the rendering info
    const newsCount = sorted.filter(item => item.type === 'news').length;
    const filingCount = sorted.filter(item => item.type === 'filing').length;
    // console.log(`📰 Rendered ${newsCount} news items and ${filingCount} filing items for ${currentActiveSymbol} (total: ${sorted.length})`);
}

// renderOracleFilings function removed - filings now handled in renderOracleNews()

// Helper function to extract timestamp from standardized filing format
function getFilingTimestamp(filingItem) {
    if (filingItem.filing_date) {
        return new Date(filingItem.filing_date).getTime();
    }
    
    if (isDev) {
        console.log(`📁 [ACTIVE] Filing ${filingItem.symbol || 'unknown'} has no filing_date, using 0 timestamp`);
    }
    
    return 0; // fallback
}

// Helper function to format filing timestamps
function formatFilingTime(ts) {
    const ms = parseTs(ts);
    if (Number.isNaN(ms)) return "";
    // Backend provides dates in ET timezone, display in ET to preserve original timezone
    const d = new Date(ms);
    const now = new Date();

    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();

    return sameDay
        ? d.toLocaleTimeString([], { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })
        : d.toLocaleString([], {
              timeZone: "America/New_York",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
          });
}


// Check if news item is older than 4 minutes (should be collapsed)
function isNewsItemCollapsed(newsItem) {
    const ts = newsItem.published_at ?? newsItem.received_at ?? newsItem.created_at ?? newsItem.updated_at;
    if (!ts) return true; // If no timestamp, treat as collapsed
    
    const ms = parseTs(ts);
    if (Number.isNaN(ms)) return true; // If invalid timestamp, treat as collapsed
    
    const now = Date.now();
    const fourMinutesInMs = 4 * 60 * 1000; // 4 minutes in milliseconds
    
    return (now - ms) > fourMinutesInMs;
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
