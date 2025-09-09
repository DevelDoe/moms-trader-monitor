// news.js — Oracle news and filing feed: hydrate, subscribe, sort

let allNews = [];
let allFilings = [];
let maxNewsLength = 50; // Default value
let settings = {}; // Store settings for sentiment analysis

// Filing structure debug logging only
function logFilingStructure(filings, context = "") {
    if (!Array.isArray(filings) || filings.length === 0) {
        console.log(`🔍 ${context} - No filings to log`);
        return;
    }
    
    console.log(`🔍 === FILING STRUCTURE ${context} ===`);
    console.log(`🔍 Total filings: ${filings.length}`);
    
    filings.forEach((filing, index) => {
        console.log(`🔍 Filing ${index + 1}:`, {
            symbol: filing.symbol,
            form_type: filing.form_type,
            form_description: filing.form_description,
            title: filing.title,
            company_name: filing.company_name,
            accession_number: filing.accession_number,
            accession_with_dashes: filing.accession_with_dashes,
            filing_date: filing.filing_date,
            filing_url: filing.filing_url,
            summary: filing.summary,
            cik: filing.cik,
            priority: filing.priority,
            source: filing.source,
            ALL_FIELDS: Object.keys(filing)
        });
    });
    console.log(`🔍 ================================`);
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ News: Hydrating from Oracle...");

    // Load settings globally for sentiment analysis
    try {
        settings = await window.settingsAPI.get();
        // console.log("✅ Settings loaded in news window:", settings);
    } catch (e) {
        console.warn("⚠️ Failed to load settings in news window:", e);
        settings = {}; // fallback
    }

    // Load news settings
    try {
        const newsSettings = await window.newsSettingsAPI.get();
        maxNewsLength = newsSettings.listLength || 50;
        window.newsSettings = newsSettings; // Store globally for sentiment analysis
        // console.log(`📰 Max news length set to: ${maxNewsLength}`);
        // console.log(`📰 News settings loaded:`, newsSettings);
    } catch (e) {
        console.warn("Failed to load news settings:", e);
    }

    // Subscribe to news settings changes
    window.newsSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings) {
            if (updatedSettings.listLength !== undefined) {
                maxNewsLength = updatedSettings.listLength;
                // console.log(`📰 News max length updated to: ${maxNewsLength}`);
            }
            
            // Update global news settings for sentiment analysis
            window.newsSettings = updatedSettings;
            
            // Re-render if lists changed (affects sentiment colors)
            if (updatedSettings.blockList || updatedSettings.bullishList || updatedSettings.bearishList) {
                // console.log(`📰 News lists updated, re-rendering for sentiment changes`);
                render();
            } else if (updatedSettings.listLength !== undefined) {
                render(); // Re-render with new limit
            }
        }
    });

    // 1. HYDRATE - Get initial headlines and filings from Oracle
    try {
        const headlines = await window.newsAPI.getHeadlines();
        // console.log(`📰 News hydration response:`, headlines);
        if (Array.isArray(headlines)) {
            allNews = headlines;
            // console.log(`📰 Hydrated: ${allNews.length} headlines`);
            // if (headlines.length > 0) {
            //     console.log(`📰 First headline:`, {
            //         symbol: headlines[0].symbol,
            //         headline: headlines[0].headline?.substring(0, 50) + "...",
            //         hasBody: !!headlines[0].body,
            //         timestamp: headlines[0].created_at || headlines[0].updated_at
            //     });
            // }
        } else {
            console.warn(`📰 News hydration failed: headlines is not an array:`, typeof headlines, headlines);
        }
    } catch (e) {
        console.warn("News hydration failed:", e);
    }

    try {
        const filings = await window.filingAPI.getHeadlines();
        if (Array.isArray(filings)) {
            allFilings = filings;
            // console.log(`📁 Hydrated: ${allFilings.length} filings`);
        }
    } catch (e) {
        console.warn("Filing hydration failed:", e);
    }

    render();

    // Start periodic re-render timer to collapse items after 4 minutes
    startCollapseTimer();

    // 2. SUBSCRIBE - Listen for Oracle news and filing updates
    window.newsAPI.onHeadlines((headlines) => {
        // console.log(`📰 News headlines event received:`, headlines);
        if (Array.isArray(headlines)) {
            allNews = headlines;
            // console.log(`📰 Full refresh: ${allNews.length} headlines`);
            render();
        } else {
            console.warn(`📰 News headlines event failed: headlines is not an array:`, typeof headlines, headlines);
        }
    });

    window.newsAPI.onDelta((newsItem) => {
        // console.log(`📰 News delta event received:`, newsItem);
        if (newsItem) {
            allNews.unshift(newsItem);
            // console.log(`📰 Delta: +1 (total: ${allNews.length})`);
            render();
        } else {
            console.warn(`📰 News delta event failed: newsItem is falsy:`, newsItem);
        }
    });

    window.filingAPI.onHeadlines((filings) => {
        if (Array.isArray(filings)) {
            allFilings = filings;
            // console.log(`📁 Full refresh: ${allFilings.length} filings`);
            render();
        }
    });

    window.filingAPI.onDelta((filingItem) => {
        if (filingItem) {
            console.log(`🔍 FILING DELTA RECEIVED:`, {
                symbol: filingItem.symbol,
                form_type: filingItem.form_type,
                form_description: filingItem.form_description,
                title: filingItem.title,
                ALL_FIELDS: Object.keys(filingItem)
            });
            allFilings.unshift(filingItem);
            // console.log(`📁 Delta: +1 (total: ${allFilings.length})`);
            render();
        }
    });
});

// Sentiment analysis function (from active.js)
function getNewsSentimentClass(newsItem) {
    const lowerHeadline = (newsItem.headline || "").toLowerCase();
    const bullishList = window.newsSettings?.bullishList || [];
    const bearishList = window.newsSettings?.bearishList || [];

    if (bullishList.some((term) => lowerHeadline.includes(term.toLowerCase()))) {
        return "bullish";
    }
    if (bearishList.some((term) => lowerHeadline.includes(term.toLowerCase()))) {
        return "bearish";
    }
    return "neutral";
}

// Check if news item is older than 15 minutes
function isNewsItemCollapsed(newsItem) {
    const ts = newsItem.updated_at ?? newsItem.created_at;
    if (!ts) return true; // If no timestamp, treat as collapsed
    
    const ms = parseTs(ts);
    if (Number.isNaN(ms)) return true; // If invalid timestamp, treat as collapsed
    
    const now = Date.now();
    const fifteenMinutesInMs = 4 * 60 * 1000; // 15 minutes in milliseconds
    
    return (now - ms) > fifteenMinutesInMs;
}

// 3. SORT & RENDER
function render() {
    const container = document.getElementById("news-container");
    if (!container) return;
    
    container.innerHTML = "";
    
    // Combine news and filings into one timeline
    const allItems = [];
    
    // Add news items
    const blockList = window.newsSettings?.blockList || [];
    // console.log(`📰 Filtering ${allNews.length} news items with block list:`, blockList);
    const filteredNews = allNews.filter((newsItem) => {
        const headline = (newsItem.headline || "").toLowerCase();
        const isBlocked = blockList.some((blocked) => headline.includes(blocked.toLowerCase()));
        // if (isBlocked) {
        //     console.log(`🚫 News item blocked: "${headline}" (matched: "${blockList.find(blocked => headline.includes(blocked.toLowerCase()))}")`);
        // }
        return !isBlocked;
    });
    // console.log(`📰 After filtering: ${filteredNews.length} news items remaining`);
    
    filteredNews.forEach(newsItem => {
        const timestamp = getTime(newsItem);
        // console.log(`📰 Adding news item:`, {
        //     headline: newsItem.headline?.substring(0, 50) + "...",
        //     symbol: newsItem.symbol,
        //     timestamp: timestamp,
        //     timestampDate: new Date(timestamp).toISOString()
        // });
        allItems.push({
            type: 'news',
            data: newsItem,
            timestamp: timestamp
        });
    });
    
    // Log filing structure for debugging
    console.log(`🔍 Checking filings in news view: ${allFilings.length} filings found`);
    logFilingStructure(allFilings, "IN NEWS VIEW");
    
    // Add filing items
    allFilings.forEach(filingItem => {
        allItems.push({
            type: 'filing',
            data: filingItem,
            timestamp: getFilingTime(filingItem)
        });
    });
    
    // Sort by timestamp (newest first)
    const sorted = allItems.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit to maxNewsLength items
    const limited = sorted.slice(0, maxNewsLength);
    
    if (limited.length === 0) {
        container.innerHTML = '<p style="opacity:0.1; color: white">no recent news or filings available</p>';
        return;
    }
    
    limited.forEach((item) => {
        if (item.type === 'news') {
            renderNewsItem(item.data, container);
        } else if (item.type === 'filing') {
            renderFilingItem(item.data, container);
        }
    });
    
    // Log the rendering info
    const newsCount = limited.filter(item => item.type === 'news').length;
    const filingCount = limited.filter(item => item.type === 'filing').length;
    // console.log(`📰 Rendered ${newsCount} news items and ${filingCount} filing items (total: ${limited.length})`);
}

function renderNewsItem(newsItem, container) {
    const sentimentClass = getNewsSentimentClass(newsItem);
    const isCollapsed = isNewsItemCollapsed(newsItem);
    const ts = newsItem.updated_at ?? newsItem.created_at;
    const when = ts ? formatNewsTime(ts) : "";
    
    // Get symbol from news item
    const symbol = newsItem.symbol || newsItem.symbols?.[0] || "N/A";
    const symbolSize = isCollapsed ? "small" : "medium";

    const itemDiv = document.createElement("div");
    itemDiv.className = `news-item ${sentimentClass}${isCollapsed ? ' collapsed' : ''}`;
    
    if (isCollapsed) {
        // Collapsed view: Symbol + Headline + Time
        itemDiv.innerHTML = `
            ${window.components.Symbol({ 
                symbol: symbol, 
                size: symbolSize,
                onClick: true
            })}
            <h5>${newsItem.headline || "Untitled"}</h5>
            ${when ? `<div class="news-time">${when}</div>` : ""}
        `;
    } else {
        // Normal view: Symbol + Headline + Time
        itemDiv.innerHTML = `
            ${window.components.Symbol({ 
                symbol: symbol, 
                size: symbolSize,
                onClick: true
            })}
            <h5>${newsItem.headline || "Untitled"}</h5>
            ${when ? `<div class="news-time">${when}</div>` : ""}
        `;
    }
    
    container.appendChild(itemDiv);
}

function renderFilingItem(filingItem, container) {
    // Debug: Log what's actually being rendered
    console.log(`🔍 RENDERING FILING ITEM:`, {
        symbol: filingItem.symbol,
        form_type: filingItem.form_type,
        form_description: filingItem.form_description,
        title: filingItem.title,
        ALL_FIELDS: Object.keys(filingItem)
    });
    
    const isCollapsed = isFilingItemCollapsed(filingItem);
    const ts = filingItem.filing_date;
    // Use filing_date directly for formatting
    const when = ts ? formatFilingTime(ts) : "";
    
    // Debug: Log collapse decision
    console.log(`🔍 COLLAPSE DECISION:`, {
        symbol: filingItem.symbol,
        filing_date: filingItem.filing_date,
        isCollapsed: isCollapsed,
        when: when
    });
    
    const symbolSize = isCollapsed ? "small" : "medium";

    const itemDiv = document.createElement("div");
    itemDiv.className = `filing-item${isCollapsed ? ' collapsed' : ''}`;
    
    // Make the entire filing item clickable if there's a URL
    if (filingItem.filing_url) {
        itemDiv.style.cursor = "pointer";
        itemDiv.addEventListener("click", () => {
            window.open(filingItem.filing_url, "_blank", "noopener,noreferrer");
        });
    }
    
    if (isCollapsed) {
        // Debug: Log the exact values being used in template
        console.log(`🔍 TEMPLATE VALUES:`, {
            form_type: filingItem.form_type,
            form_description: filingItem.form_description,
            form_type_type: typeof filingItem.form_type,
            form_description_type: typeof filingItem.form_description
        });
        
        // Collapsed view: Symbol + Form Type + Time
        itemDiv.innerHTML = `
            ${window.components.Symbol({ 
                symbol: filingItem.symbol, 
                size: symbolSize,
                onClick: true
            })}
            <h5>📁 ${filingItem.form_type} - ${filingItem.form_description}</h5>
            ${when ? `<div class="filing-time">${when}</div>` : ""}
        `;
    } else {
        // Debug: Log the exact values being used in expanded template
        console.log(`🔍 EXPANDED TEMPLATE VALUES:`, {
            form_type: filingItem.form_type,
            form_description: filingItem.form_description,
            title: filingItem.title,
            form_type_type: typeof filingItem.form_type,
            form_description_type: typeof filingItem.form_description
        });
        
        // Expanded view: Symbol + Full Title + Company + Time + URL
        itemDiv.innerHTML = `
            ${window.components.Symbol({ 
                symbol: filingItem.symbol, 
                size: symbolSize,
                onClick: true
            })}
            <div class="filing-content">
                <h3 class="filing-title-large">${filingItem.title}</h3>
                ${filingItem.company_name || when ? `
                    <div class="filing-meta">
                        ${when ? `<div class="filing-time">${when}</div>` : ''}
                        ${filingItem.company_name ? `<div class="filing-company">${filingItem.company_name}</div>` : ''}
                    </div>
                ` : ''}
                ${filingItem.summary ? `
                    <div class="filing-summary">${filingItem.summary}</div>
                ` : ''}
                ${filingItem.filing_url ? `
                    <div class="filing-url">
                        <span class="filing-link-text">📄 View on SEC.gov</span>
                    </div>
                ` : ''}
                ${filingItem.accession_with_dashes ? `
                    <div class="filing-details">
                        Filed: ${filingItem.filing_date} AccNo: ${filingItem.accession_with_dashes} Size: 6 KB
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    container.appendChild(itemDiv);
}

function getFilingTime(filingItem) {
    // Use filing_date directly - it's already in ISO format
    if (!filingItem.filing_date) return 0;
    const date = new Date(filingItem.filing_date);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function formatFilingTime(filingDate) {
    // Format filing date directly from ISO string
    if (!filingDate) return "";
    const date = new Date(filingDate);
    if (!Number.isFinite(date.getTime())) return "";
    
    const now = new Date();
    const sameDay = date.getFullYear() === now.getFullYear() && 
                   date.getMonth() === now.getMonth() && 
                   date.getDate() === now.getDate();

    return sameDay
        ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
}

// Check if filing item is older than 15 minutes
function isFilingItemCollapsed(filingItem) {
    const ts = filingItem.filing_date;
    if (!ts) return true; // If no timestamp, treat as collapsed
    
    // Use filing_date directly - it's already in ISO format
    const date = new Date(ts);
    const ms = Number.isFinite(date.getTime()) ? date.getTime() : NaN;
    if (Number.isNaN(ms)) return true; // If invalid timestamp, treat as collapsed
    
    const now = Date.now();
    const fifteenMinutesInMs = 15 * 60 * 1000; // 15 minutes in milliseconds
    
    return (now - ms) > fifteenMinutesInMs;
}

function getTime(item) {
    return toMs(item.updated_at) || toMs(item.created_at) || 0;
}

function toMs(timestamp) {
    if (!timestamp) return 0;
    if (typeof timestamp === "number") {
        return timestamp > 1e12 ? timestamp : timestamp * 1000;
    }
    const parsed = new Date(timestamp).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatTime(ms) {
    if (!ms) return "--:--";
    return new Date(ms).toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function formatNewsTime(ts) {
    const ms = parseTs(ts);
    if (Number.isNaN(ms)) return "";
    const d = new Date(ms);
    const now = new Date();

    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();

    return sameDay
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
          });
}

function parseTs(t) {
    if (t == null) return NaN;
    if (typeof t === "number") return t < 1e12 ? t * 1000 : t; // secs → ms
    const n = Number(t);
    if (!Number.isNaN(n)) return parseTs(n);
    const d = new Date(t).getTime();
    return Number.isNaN(d) ? NaN : d;
}

// Timer to periodically re-render news items so they can collapse after 4 minutes
let collapseTimer = null;

function startCollapseTimer() {
    // Clear any existing timer
    if (collapseTimer) {
        clearInterval(collapseTimer);
    }
    
    // Check every 30 seconds for items that need to collapse
    collapseTimer = setInterval(() => {
        // console.log("📰 Collapse timer: checking for items to collapse");
        render();
    }, 30000); // 30 seconds
    
    // console.log("📰 Collapse timer started: checking every 30 seconds");
}