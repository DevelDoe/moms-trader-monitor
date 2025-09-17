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

// Global object to store bar instances (no longer needed but keeping for compatibility)
window.ownershipCharts = {};
const symbolColors = {};

const { isDev } = window.appFlags;

// Oracle news and filing data management
let allOracleNews = [];
let allOracleFilings = [];
let currentActiveSymbol = null;
let newsSettings = {}; // Store news settings for sentiment analysis and filtering
let filingFilterSettings = {}; // Store filing filter settings

// TradingView settings
let traderviewSettings = {};
let currentActiveChartSymbol = null; // Track current active chart symbol

// Function to handle TradingView chart updates for active symbol
function handleActiveChartUpdate(symbol) {
    console.log(`📊 [ACTIVE] handleActiveChartUpdate called with symbol: ${symbol}, enableActiveChart: ${traderviewSettings.enableActiveChart}`);
    
    if (!symbol || !traderviewSettings.enableActiveChart) {
        console.log(`📊 [ACTIVE] Skipping chart update - symbol: ${!!symbol}, enabled: ${traderviewSettings.enableActiveChart}`);
        return;
    }
    
    // Auto-close previous active chart if enabled and different symbol
    if (traderviewSettings.autoCloseActive && currentActiveChartSymbol && currentActiveChartSymbol !== symbol) {
        console.log(`📊 [ACTIVE] Auto-closing previous TradingView chart for: ${currentActiveChartSymbol}`);
        if (window.traderviewAPI?.closeTickerNow) {
            window.traderviewAPI.closeTickerNow(currentActiveChartSymbol);
        }
    }
    
    console.log(`📊 [ACTIVE] Opening TradingView chart for active symbol: ${symbol}`);
    
    // Use the same API as heroes view to open TradingView window
    if (window.traderviewAPI?.openTickersNow) {
        console.log(`📊 [ACTIVE] Calling traderviewAPI.openTickersNow with: [${symbol}]`);
        window.traderviewAPI.openTickersNow([symbol]);
        currentActiveChartSymbol = symbol; // Track the current active chart
        console.log(`📊 [ACTIVE] TradingView API call completed, tracking symbol: ${symbol}`);
    } else {
        console.warn("⚠️ [ACTIVE] traderviewAPI.openTickersNow not available");
        console.log("Available traderviewAPI methods:", Object.keys(window.traderviewAPI || {}));
    }
}

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

// Filing filter function - simple blocklist approach
function isFilingAllowed(filingItem) {
    if (!filingItem || !filingItem.form_type) {
        return false;
    }

    const formType = filingItem.form_type;
    
    // Check each group for this form type
    if (filingFilterSettings.group1Forms && filingFilterSettings.group1Forms[formType] !== undefined) {
        return filingFilterSettings.group1Forms[formType];
    }
    
    if (filingFilterSettings.group2Forms && filingFilterSettings.group2Forms[formType] !== undefined) {
        return filingFilterSettings.group2Forms[formType];
    }
    
    if (filingFilterSettings.group3Forms && filingFilterSettings.group3Forms[formType] !== undefined) {
        return filingFilterSettings.group3Forms[formType];
    }

    // Unknown form type - allow by default
    return true;
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
            console.log("🔍 [ACTIVE] === DELTA NEWS OBJECT ===");
            console.log("🔍 [ACTIVE] Delta news item:", newsItem);
            console.log("🔍 [ACTIVE] Available fields:", Object.keys(newsItem));
            console.log("🔍 [ACTIVE] =========================");
            
            // Add to beginning for latest first
            allOracleNews.unshift(newsItem);
            
            // Keep only last 1000 headlines to prevent memory bloat
            if (allOracleNews.length > 1000) {
                allOracleNews = allOracleNews.slice(0, 1000);
            }
            
            console.log(`📰 [ACTIVE] Delta: +1 (total: ${allOracleNews.length})`);
            
            // Re-render to show the new item immediately (only if we have an active symbol)
            if (currentActiveSymbol) {
                // Get current symbol data before re-rendering
                window.activeAPI.getSymbol(currentActiveSymbol).then((symbolData) => {
                    if (symbolData) {
                        renderOracleNews(symbolData);
                    } else {
                        console.log("📰 [ACTIVE] Delta: No symbol data available for", currentActiveSymbol);
                    }
                }).catch((e) => {
                    console.warn("📰 [ACTIVE] Delta: Failed to get symbol data:", e);
                });
            } else {
                console.log("📰 [ACTIVE] Delta: No active symbol, skipping render");
            }
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

    // Settings are now managed by Electron stores
    window.settings = {}; // fallback

    // Load news settings for sentiment analysis and filtering
    try {
        newsSettings = await window.newsSettingsAPI.get();
        // console.log("✅ News settings loaded in active window:", newsSettings);
    } catch (e) {
        console.warn("⚠️ Failed to load news settings in active window:", e);
        newsSettings = {}; // fallback
    }

    // Load TradingView settings
    try {
        traderviewSettings = await window.electronAPI.ipc.invoke("traderview-settings:get");
    } catch (error) {
        console.error("Failed to load traderview settings in active window:", error);
        traderviewSettings = {}; // fallback
    }

    // Listen for settings updates to refresh TradingView settings
    window.electronAPI.ipc?.send("traderview-settings:subscribe");
    window.electronAPI.ipc?.on("traderview-settings:change", (_event, updatedTraderviewSettings) => {
        traderviewSettings = updatedTraderviewSettings || {};
        console.log(`📊 [ACTIVE] Traderview settings updated:`, traderviewSettings);
        
        // If active chart is enabled and we have an active symbol, ensure chart is open
        if (traderviewSettings.enableActiveChart && currentActiveSymbol) {
            handleActiveChartUpdate(currentActiveSymbol);
        }
    });

    // Load filing filter settings
    try {
        filingFilterSettings = await window.filingFilterSettingsAPI.get();
        console.log("✅ Loaded filing filter settings in active window:", filingFilterSettings);
    } catch (e) {
        console.warn("Failed to load filing filter settings in active window:", e);
        filingFilterSettings = {
            group1Forms: {},
            group2Forms: {},
            group3Forms: {}
        };
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

    // Subscribe to filing filter settings changes
    window.filingFilterSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings) {
            filingFilterSettings = updatedSettings;
            console.log("✅ Filing filter settings updated in active window:", updatedSettings);
            renderOracleNews(); // Re-render to apply new filters
        }
    });

    // Initialize Oracle news integration
    await initializeOracleNews();
    
    // Start the collapse timer to ensure news items collapse after 4 minutes
    // Timer removed for performance - collapse logic now handled on re-renders

    // Clean up timer when window is closed or unloaded
    window.addEventListener('beforeunload', () => {
        // Timer cleanup removed - no longer needed
    });

    // Initialize UI with no symbol data
    updateUI(null); // Show "No active symbol" placeholder
    
    // Initialize Finviz chart with placeholder
    updateStockChart(null);

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
                
                // Handle TradingView chart update for active symbol
                handleActiveChartUpdate(symbol);
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

    const dataWarningSummary = document.getElementById("data-warning-summary");
    if (dataWarningSummary) {
        dataWarningSummary.style.display = dataIsCorrupted ? "block" : "none";
    }

    document.getElementById("data-warning-stats").style.display = dataIsCorrupted ? "block" : "none";
    const sectionFloatStats = document.getElementById("section-float-stats");
    if (sectionFloatStats) {
        sectionFloatStats.style.display = "flex";
    }

    const floatSection = document.getElementById("ownership-section");

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
    
    // Update Finviz chart symbol
    updateStockChart(symbolData.symbol);
    
    // Render Oracle news and filings (filtered by active symbol)
    renderOracleNews(symbolData);

    /* --- helpers --- */

    renderOwnershipBars(symbolData, "ownershipBars-summary");
    renderOwnershipBars(symbolData, "ownershipBars-stats");

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
    // For sorting/display: use original published/updated times, NOT Unix timestamp
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

    // Compare dates in ET timezone to ensure accurate same-day detection
    const dET = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const nowET = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    const sameDay = dET.getFullYear() === nowET.getFullYear() && 
                    dET.getMonth() === nowET.getMonth() && 
                    dET.getDate() === nowET.getDate();

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
    console.log(`📰 [ACTIVE] renderOracleNews called - Active symbol: ${currentActiveSymbol}, Total news: ${allOracleNews.length}, Symbol data provided: ${!!symbolData}`);
    
    // Find the news container in the summary page
    const newsContainer = document.querySelector("#news-container");
    
    if (!newsContainer) {
        console.warn("⚠️ News container not found in summary page");
        return;
    }
    
    newsContainer.innerHTML = "";
    
    if (!currentActiveSymbol) {
        console.log("📰 [ACTIVE] No active symbol, showing placeholder");
        newsContainer.innerHTML = '<p style="opacity:0.1; color: white">no active symbol</p>';
        return;
    }
    
    if (!symbolData) {
        console.log("📰 [ACTIVE] No symbol data provided, showing placeholder");
        newsContainer.innerHTML = '<p style="opacity:0.1; color: white">no active symbol</p>';
        return;
    }
    
    // Combine news and filings into one timeline
    const allItems = [];
    
    // Filter news for the current active symbol
    const symbolNews = allOracleNews.filter((newsItem) => {
        const newsSymbol = newsItem.symbol || newsItem.symbols?.[0];
        const matches = newsSymbol && newsSymbol.toUpperCase() === currentActiveSymbol.toUpperCase();
        if (!matches && newsItem.symbol) {
            console.log(`📰 [ACTIVE] News item filtered out - Symbol: ${newsSymbol}, Active: ${currentActiveSymbol}`);
        }
        return matches;
    });
    
    console.log(`📰 [ACTIVE] Filtered ${symbolNews.length} news items for symbol ${currentActiveSymbol} from ${allOracleNews.length} total`);
    
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
    
    // Apply filing filter
    const filteredFilings = uniqueFilings.filter((filingItem) => {
        return isFilingAllowed(filingItem);
    });
    
    console.log(`📁 [ACTIVE] Filings: ${symbolFilings.length} total -> ${uniqueFilings.length} unique -> ${filteredFilings.length} after filtering`);
    
    // Group consecutive identical filings
    const sortedFilings = filteredFilings.sort((a, b) => getFilingTimestamp(b) - getFilingTimestamp(a));
    const groupedFilings = groupConsecutiveFilings(sortedFilings);
    
    console.log(`📁 [ACTIVE] Grouped ${filteredFilings.length} filings into ${groupedFilings.length} groups`);
    
    // Add filing items (using latest filing from each group)
    groupedFilings.forEach(group => {
        allItems.push({
            type: 'filing',
            data: group.latestFiling,
            timestamp: getFilingTimestamp(group.latestFiling),
            count: group.count
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
            
            console.log(`📰 [ACTIVE] Rendering news item:`, {
                symbol: newsItem.symbol,
                headline: newsItem.headline?.substring(0, 50) + "...",
                timestamp: ts,
                when: when,
                isCollapsed: isCollapsed,
                published_at: newsItem.published_at,
                received_at: newsItem.received_at,
                created_at: newsItem.created_at,
                updated_at: newsItem.updated_at
            });
            
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
                        <h5 class="news-title-clickable" style="cursor: pointer; >${newsItem.headline || "Untitled"}</h5>
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
                        <h3 class="news-title-clickable" style="cursor: pointer; margin-bottom: 10px;color: #fff !important; font-size: 14px !important;"">${newsItem.headline || "Untitled"}</h3>
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
            const count = item.count || 1;
            const ts = getFilingTimestamp(filingItem);
            const when = ts ? formatFilingTime(new Date(ts)) : "";
            const isCollapsed = isFilingItemCollapsed(filingItem);
            
            const itemDiv = document.createElement("div");
            itemDiv.className = `filing-item${isCollapsed ? ' collapsed' : ''}`;
            itemDiv.style.padding = '0'; // Consistent padding with news items
            itemDiv.style.borderBottom = 'none'; // Remove any default borders
            
            // Standardized filing format: Form Type - Title, Description, Time + SEC.gov link
            const formType = filingItem.form_type || 'Filing';
            const title = filingItem.title || 'SEC Filing';
            const description = filingItem.form_description || '';
            const secLink = filingItem.filing_url ? 'SEC.gov' : '';
            
            // Add count to title if there are multiple filings
            const titleWithCount = count > 1 ? `Form ${title} (${count})` : `Form ${title}`;

            
            
            itemDiv.innerHTML = `
                <h5 class="filing-title-clickable" style="cursor: pointer;">${titleWithCount}</h5>
                ${description ? `<div class="filing-description">${description}</div>` : ''}
                <div class="filing-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <div class="filing-meta-left">
                        ${when ? `<span class="filing-time">${when}</span>` : ''}
                        ${count > 1 ? `<span class="filing-count" style="margin-left: 8px; opacity: 0.7;">Latest of ${count} Form ${formType} filings</span>` : ''}
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
    // For sorting/display: use original filing_date, NOT Unix timestamp
    if (filingItem.filing_date) {
        // Filing dates are already in NY timezone, parse them directly
        return new Date(filingItem.filing_date).getTime();
    }
    
    if (isDev) {
        console.log(`📁 [ACTIVE] Filing ${filingItem.symbol || 'unknown'} has no filing_date, using 0 timestamp`);
    }
    
    return 0; // fallback
}

// Helper function to create filing group key for deduplication
function getFilingGroupKey(filingItem) {
    return `${filingItem.symbol}_${filingItem.form_type}`;
}

// Helper function to group consecutive identical filings
function groupConsecutiveFilings(filings) {
    if (!Array.isArray(filings) || filings.length === 0) return [];
    
    const grouped = [];
    let currentGroup = null;
    
    for (const filing of filings) {
        const groupKey = getFilingGroupKey(filing);
        
        if (!currentGroup || currentGroup.groupKey !== groupKey) {
            // Start new group
            currentGroup = {
                groupKey,
                filings: [filing],
                latestFiling: filing,
                count: 1
            };
            grouped.push(currentGroup);
        } else {
            // Add to existing group
            currentGroup.filings.push(filing);
            currentGroup.count++;
            // Keep the latest filing (assuming filings are already sorted by timestamp)
            if (getFilingTimestamp(filing) > getFilingTimestamp(currentGroup.latestFiling)) {
                currentGroup.latestFiling = filing;
            }
        }
    }
    
    return grouped;
}

// Helper function to format filing timestamps
function formatFilingTime(ts) {
    const ms = parseTs(ts);
    if (Number.isNaN(ms)) return "";
    
    // Filing dates are already in NY timezone, display them directly
    const d = new Date(ms);
    const now = new Date();

    // Convert current local time to NY timezone for comparison
    const nowNY = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const dateNY = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    const sameDay = dateNY.getFullYear() === nowNY.getFullYear() && 
                    dateNY.getMonth() === nowNY.getMonth() && 
                    dateNY.getDate() === nowNY.getDate();

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
    // For age checking: use Unix timestamp if available, fallback to ISO string parsing
    let newsTimestamp;
    
    if (newsItem.received_at_unix) {
        newsTimestamp = newsItem.received_at_unix * 1000; // Convert to milliseconds
    } else {
        // Use the same timestamp extraction logic as getNewsTimestamp for consistency
        const timestampStr = newsItem.published_at || newsItem.received_at || newsItem.created_at || newsItem.updated_at;
        if (!timestampStr) return true; // If no timestamp, treat as collapsed
        
        // Use the same parsing approach as getNewsTimestamp for consistency
        const ms = new Date(timestampStr).getTime();
        if (Number.isNaN(ms)) return true; // If invalid timestamp, treat as collapsed
        newsTimestamp = ms;
    }
    
    const now = Date.now();
    const fourMinutesInMs = 4 * 60 * 1000; // 4 minutes in milliseconds
    const ageInMs = now - newsTimestamp;
    
    return ageInMs > fourMinutesInMs;
}

// Check if filing item is older than 4 minutes (should be collapsed)
function isFilingItemCollapsed(filingItem) {
    // For age checking: use Unix timestamp if available, fallback to ISO string parsing
    let filingTimestamp;
    
    if (filingItem.received_at_unix) {
        filingTimestamp = filingItem.received_at_unix * 1000; // Convert to milliseconds
    } else {
        const ts = filingItem.filing_date || filingItem.filed_at;
        if (!ts) return true; // If no timestamp, treat as collapsed
        
        const filingDate = new Date(ts);
        if (Number.isNaN(filingDate.getTime())) return true; // If invalid timestamp, treat as collapsed
        filingTimestamp = filingDate.getTime();
    }
    
    const now = Date.now();
    const fourMinutesInMs = 4 * 60 * 1000; // 4 minutes in milliseconds
    const ageInMs = now - filingTimestamp;
    
    return ageInMs > fourMinutesInMs;
}

// Timer removed for performance - collapse logic now handled on re-renders

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

function renderOwnershipBars(symbolData, barsId) {
    const floatShares = symbolData.statistics?.floatShares || 0;
    const insidersPercentHeld = symbolData.ownership?.insidersPercentHeld || 0;
    const institutionsPercentHeld = symbolData.ownership?.institutionsPercentHeld || 0;
    const sharesOutstanding = symbolData.statistics?.sharesOutstanding || 0;
    const sharesShort = symbolData.statistics?.sharesShort || 0;

    // ✅ Correctly calculate insider & institutional shares
    const insiderShares = Math.round(sharesOutstanding * insidersPercentHeld);
    const institutionalShares = Math.round(sharesOutstanding * institutionsPercentHeld);
    const remainingShares = sharesOutstanding - (floatShares + insiderShares + institutionalShares);

    // ✅ Calculate float breakdown
    const floatNonShort = floatShares - sharesShort; // Remaining float

    // Get the bars container
    const barsContainer = document.getElementById(barsId);
    if (!barsContainer) {
        console.error(`Bars container not found: ${barsId}`);
        return;
    }

    // Clear existing content
    barsContainer.innerHTML = '';

    // Check if we have valid data
    if (sharesOutstanding === 0) {
        console.warn("All ownership data is zero. Bars will not be displayed.");
        barsContainer.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">No ownership data available</div>';
        return;
    }

    // Check for data quality issues
    const dataIssues = [];
    const issues = [];
    
    if (!floatShares || floatShares <= 0) {
        issues.push("Float shares missing or invalid");
    }
    if (!sharesOutstanding || sharesOutstanding <= 0) {
        issues.push("Shares outstanding missing or invalid");
    }
    if (floatShares > 1_000_000_000) {
        issues.push("Float shares unrealistically large (>1B)");
    }
    if (sharesOutstanding > 5_000_000_000) {
        issues.push("Shares outstanding unrealistically large (>5B)");
    }
    if (floatShares / sharesOutstanding > 1.2) {
        issues.push("Float exceeds shares outstanding (impossible)");
    }
    if (floatShares / sharesOutstanding < 0.01) {
        issues.push("Float too small relative to shares outstanding");
    }
    
    const hasDataIssues = issues.length > 0;

    // Create two stacked bars: Total Outstanding and Float breakdown
    
    // 1. Total Shares Outstanding Bar
    const totalBarElement = document.createElement('div');
    totalBarElement.className = 'ownership-bar';
    
    // Highlight problematic values
    const outstandingClass = (!sharesOutstanding || sharesOutstanding <= 0) ? 'data-error' : '';
    const floatClass = (!floatShares || floatShares <= 0 || floatShares > 1_000_000_000) ? 'data-error' : '';
    
    totalBarElement.innerHTML = `
        <div class="ownership-bar-label">
            Outstanding: <span class="ownership-bar-value ${outstandingClass}">${formatLargeNumber(sharesOutstanding)}</span>
        </div>
        <div class="ownership-bar-fill-container">
            <div class="ownership-bar-fill ownership-bar-remaining" style="width: ${sharesOutstanding > 0 ? (remainingShares / sharesOutstanding) * 100 : 0}%"></div>
            <div class="ownership-bar-fill ownership-bar-institutional" style="width: ${sharesOutstanding > 0 ? (institutionalShares / sharesOutstanding) * 100 : 0}%"></div>
            <div class="ownership-bar-fill ownership-bar-insider" style="width: ${sharesOutstanding > 0 ? (insiderShares / sharesOutstanding) * 100 : 0}%"></div>
            <div class="ownership-bar-fill ownership-bar-float ${floatClass}" style="width: ${sharesOutstanding > 0 ? (floatShares / sharesOutstanding) * 100 : 0}%"></div>
        </div>
        <div class="ownership-bar-breakdown">
            ⚫ rem: ${formatLargeNumber(remainingShares)} (${((remainingShares / sharesOutstanding) * 100).toFixed(1)}%) • 
            🟠 insid: ${formatLargeNumber(institutionalShares)} (${((institutionalShares / sharesOutstanding) * 100).toFixed(1)}%) • 
            🔴 insti: ${formatLargeNumber(insiderShares)} (${((insiderShares / sharesOutstanding) * 100).toFixed(1)}%) • 
            🔵 float: ${formatLargeNumber(floatShares)} (${((floatShares / sharesOutstanding) * 100).toFixed(1)}%)
        </div>
    `;
    barsContainer.appendChild(totalBarElement);

    // 2. Float Breakdown Bar (only if we have float data)
    if (floatShares > 0) {
        const floatBarElement = document.createElement('div');
        floatBarElement.className = 'ownership-bar';
        floatBarElement.innerHTML = `
            <div class="ownership-bar-label">
                🔵 Float: <span class="ownership-bar-value float ${floatClass}">${formatLargeNumber(floatShares)}</span>
            </div>
            <div class="ownership-bar-fill-container">
                <div class="ownership-bar-fill ownership-bar-float-non-short" style="width: ${(floatNonShort / floatShares) * 100}%"></div>
                <div class="ownership-bar-fill ownership-bar-short" style="width: ${(sharesShort / floatShares) * 100}%"></div>
            </div>
            <div class="ownership-bar-breakdown">
               
                🟡 short ${formatLargeNumber(sharesShort)} (${((sharesShort / floatShares) * 100).toFixed(1)}%)
            </div>
        `;
        barsContainer.appendChild(floatBarElement);
    }
    
    // 3. Data Quality Issues Message
    if (hasDataIssues) {
        const errorElement = document.createElement('div');
        errorElement.className = 'data-quality-warning';
        errorElement.innerHTML = `
            <div class="warning-header">⚠️ Data Quality Issues:</div>
            <ul class="warning-list">
                ${issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
        `;
        barsContainer.appendChild(errorElement);
    }
}

// Finviz charts implementation
// No global variables needed - using simple iframe approach

// Function to create/update Finviz chart
function updateStockChart(symbol) {
    console.log(`📊 [ACTIVE] Updating Finviz chart for: ${symbol}`);
    
    const container = document.getElementById("stockchart-widget");
    if (!container) {
        console.warn("⚠️ [ACTIVE] Chart container not found");
        return;
    }
    
    if (!symbol) {
        // Show placeholder if no symbol
        container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888; font-size: 14px;">Select a symbol to view chart</div>';
        return;
    }
    
    // Build Finviz mini chart URL (smaller, simpler format)
    // Parameters:
    // t = ticker symbol
    // ty = chart type (c = candlestick, l = line)
    // ta = technical analysis (0 = no indicators)
    // p = period (d = daily, w = weekly, m = monthly)
    // s = size (s = small)
    const chartUrl = `https://finviz.com/chart.ashx?t=${symbol}&ty=l&ta=0&p=d&s=s`;
    
    console.log(`📊 [ACTIVE] Creating iframe with Finviz mini chart URL: ${chartUrl}`);
    
    // Create iframe dynamically
    const iframe = document.createElement('iframe');
    iframe.id = 'stockchart-iframe';
    iframe.src = chartUrl;
    iframe.style.cssText = 'height: 100%; width: 100%; border: none; border-radius: 8px;';
    iframe.frameBorder = '0';
    iframe.title = 'Stock Chart';
    
    // Handle iframe load events
        iframe.onload = () => {
            console.log(`📊 [ACTIVE] Finviz mini chart loaded for ${symbol}`);
        };
        
        iframe.onerror = () => {
            console.error(`❌ [ACTIVE] Failed to load Finviz mini chart for ${symbol}`);
        container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #ff6b6b; font-size: 14px;">Chart failed to load</div>';
    };
    
    // Clear container and add iframe
    container.innerHTML = '';
    container.appendChild(iframe);
    
    console.log(`📊 [ACTIVE] Iframe created and added to container`);
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
