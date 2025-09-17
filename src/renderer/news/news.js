// news.js — Oracle news and filing feed: hydrate, subscribe, sort

let allNews = [];
let allFilings = [];
let maxNewsLength = 50; // Default value
let settings = {}; // Store settings for sentiment analysis
let filingFilterSettings = {}; // Store filing filter settings

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

    // Set up event delegation for symbol clicks
    document.addEventListener('click', function(event) {
        const symbolElement = event.target.closest('.symbol[data-clickable="true"]');
        if (symbolElement) {
            const symbol = symbolElement.getAttribute('data-symbol');
            if (symbol) {
                console.log(`🖱️ [News] Symbol clicked: ${symbol}`);
                window.handleSymbolClick(symbol, event);
            }
        }
    });

    // Wait for activeAPI to be available
    while (!window.activeAPI) {
        await new Promise((r) => setTimeout(r, 100));
    }
    console.log("✅ News view - activeAPI is now available");

    // Settings are now managed by Electron stores
    settings = {}; // fallback

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

    // Load filing filter settings
    try {
        filingFilterSettings = await window.filingFilterSettingsAPI.get();
        console.log("✅ Loaded filing filter settings:", filingFilterSettings);
    } catch (e) {
        console.warn("Failed to load filing filter settings:", e);
        filingFilterSettings = {
            group1Forms: {},
            group2Forms: {},
            group3Forms: {}
        };
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

    // Subscribe to filing filter settings changes
    window.filingFilterSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings) {
            filingFilterSettings = updatedSettings;
            console.log("✅ Filing filter settings updated:", updatedSettings);
            render(); // Re-render to apply new filters
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
            console.log(`📰 News hydration failed: headlines is not an array:`, typeof headlines, headlines);
        }
    } catch (e) {
        console.warn("News hydration failed:", e);
    }

    try {
        console.log("📁 [NEWS] Requesting filing headlines from Oracle...");
        const filings = await window.filingAPI.getHeadlines();
        console.log("📁 [NEWS] Received filing headlines response:", filings);
        if (Array.isArray(filings)) {
            allFilings = filings;
            console.log(`📁 [NEWS] Hydrated: ${allFilings.length} filings`);
        } else {
            console.log("📁 [NEWS] Filing headlines response is not an array:", typeof filings, filings);
            console.log("📁 [NEWS] This is expected if Oracle hasn't processed hydration yet - will wait for filing-headlines event");
        }
    } catch (e) {
        console.warn("📁 [NEWS] Filing hydration failed:", e);
    }

    render();

    // Start periodic auto-refresh timer to re-render every 4 minutes
    let autoRefreshTimer = setInterval(() => {
        console.log("🔄 [NEWS] Auto-refresh triggered (4 minutes)");
        render();
    }, 4 * 60 * 1000); // 4 minutes in milliseconds
    
    // Clean up timer when window is closed or unloaded
    window.addEventListener('beforeunload', () => {
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            console.log("🧹 [NEWS] Auto-refresh timer cleaned up");
        }
    });

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
        console.log(`📰 [NEWS] News delta event received:`, newsItem);
        if (newsItem) {
            console.log(`📰 [NEWS] Delta news item details:`, {
                symbol: newsItem.symbol,
                headline: newsItem.headline?.substring(0, 50) + "...",
                updated_at: newsItem.updated_at,
                created_at: newsItem.created_at,
                received_at: newsItem.received_at
            });
            allNews.unshift(newsItem);
            console.log(`📰 [NEWS] Delta: +1 (total: ${allNews.length})`);
            render();
        } else {
            console.warn(`📰 [NEWS] News delta event failed: newsItem is falsy:`, newsItem);
        }
    });

    window.filingAPI.onHeadlines((filings) => {
        console.log("📁 [NEWS] Received filing-headlines event:", filings);
        console.log("🔍 [NEWS] Filing headlines type:", typeof filings);
        console.log("🔍 [NEWS] Filing headlines length:", Array.isArray(filings) ? filings.length : "not an array");
        
        if (Array.isArray(filings)) {
            // 🔍 DETAILED LOGGING: Log the first few filing objects to see their structure
            if (filings.length > 0) {
                console.log("🔍 [NEWS] FIRST FILING OBJECT STRUCTURE:", JSON.stringify(filings[0], null, 2));
                console.log("🔍 [NEWS] FIRST FILING OBJECT KEYS:", Object.keys(filings[0]));
                if (filings.length > 1) {
                    console.log("🔍 [NEWS] SECOND FILING OBJECT STRUCTURE:", JSON.stringify(filings[1], null, 2));
                }
            }
            
            allFilings = filings;
            console.log(`📁 [NEWS] Full refresh: ${allFilings.length} filings`);
            render();
        } else {
            console.warn("📁 [NEWS] Filing headlines event data is not an array:", typeof filings, filings);
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

    // Listen for Oracle hydration completion to refresh data
    window.newsAPI.onHydrationComplete(() => {
        console.log("🔄 [NEWS] Oracle hydration complete - refreshing news and filings data...");
        
        // Clear existing data
        allNews = [];
        allFilings = [];
        
        // Re-fetch data from Oracle
        window.newsAPI.getHeadlines().then((headlines) => {
            if (Array.isArray(headlines)) {
                allNews = headlines;
                console.log(`📰 [NEWS] Refreshed: ${allNews.length} headlines after hydration`);
            }
            render();
        }).catch((e) => {
            console.warn("📰 [NEWS] Failed to refresh headlines after hydration:", e);
        });

        window.filingAPI.getHeadlines().then((filings) => {
            if (Array.isArray(filings)) {
                allFilings = filings;
                console.log(`📁 [NEWS] Refreshed: ${allFilings.length} filings after hydration`);
            }
            render();
        }).catch((e) => {
            console.warn("📁 [NEWS] Failed to refresh filings after hydration:", e);
        });
    });
});

// Helper function to truncate text to a maximum length
function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength).trim() + '...';
}

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

// Check if news item is older than 4 minutes
function isNewsItemCollapsed(newsItem) {
    // Use Unix timestamp if available, fallback to ISO string parsing
    let newsTimestamp;
    
    if (newsItem.received_at_unix) {
        newsTimestamp = newsItem.received_at_unix * 1000; // Convert to milliseconds
    } else {
        // Use the same timestamp extraction logic as getTime() for consistency
        const ts = newsItem.updated_at ?? newsItem.created_at ?? newsItem.received_at;
        if (!ts) return true; // If no timestamp, treat as collapsed
        
        // Use the same parsing approach as getTime() for consistency
        const ms = toMs(ts);
        if (!ms || Number.isNaN(ms) || ms === 0) return true; // If invalid timestamp, treat as collapsed
        newsTimestamp = ms;
    }
    
    const now = Date.now();
    const fourMinutesInMs = 4 * 60 * 1000; // 4 minutes in milliseconds
    const ageInMs = now - newsTimestamp;
    
    return ageInMs > fourMinutesInMs;
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
    console.log(`📰 [NEWS] Filtering ${allNews.length} news items with block list:`, blockList);
    const filteredNews = allNews.filter((newsItem) => {
        const headline = (newsItem.headline || "").toLowerCase();
        const isBlocked = blockList.some((blocked) => headline.includes(blocked.toLowerCase()));
        if (isBlocked) {
            console.log(`🚫 [NEWS] News item blocked: "${headline}" (matched: "${blockList.find(blocked => headline.includes(blocked.toLowerCase()))}")`);
        }
        return !isBlocked;
    });
    console.log(`📰 [NEWS] After filtering: ${filteredNews.length} news items remaining`);
    
    filteredNews.forEach(newsItem => {
        const timestamp = getTime(newsItem);
        console.log(`📰 [NEWS] Adding news item:`, {
            headline: newsItem.headline?.substring(0, 50) + "...",
            symbol: newsItem.symbol,
            timestamp: timestamp,
            timestampDate: new Date(timestamp).toISOString(),
            updated_at: newsItem.updated_at,
            created_at: newsItem.created_at,
            received_at: newsItem.received_at
        });
        allItems.push({
            type: 'news',
            data: newsItem,
            timestamp: timestamp
        });
    });
    
    // Add filing items with filtering
    console.log(`📁 [NEWS] Rendering ${allFilings.length} filings`);
    const filteredFilings = allFilings.filter((filingItem) => {
        return isFilingAllowed(filingItem);
    });
    console.log(`📁 [NEWS] After filtering: ${filteredFilings.length} filings remaining`);
    
    // Group consecutive identical filings
    const sortedFilings = filteredFilings.sort((a, b) => getFilingTime(b) - getFilingTime(a));
    const groupedFilings = groupConsecutiveFilings(sortedFilings);
    
    console.log(`📁 [NEWS] Grouped ${filteredFilings.length} filings into ${groupedFilings.length} groups`);
    
    groupedFilings.forEach((group, index) => {
        // Debug: Log the structure of the first few filing groups
        if (index < 3) {
            console.log(`📁 [NEWS] Filing group ${index} structure:`, {
                groupKey: group.groupKey,
                count: group.count,
                latestFiling: {
                    symbol: group.latestFiling.symbol,
                    symbols: group.latestFiling.symbols,
                    form_type: group.latestFiling.form_type,
                    filing_date: group.latestFiling.filing_date,
                    filed_at: group.latestFiling.filed_at
                }
            });
        }
        
        const timestamp = getFilingTime(group.latestFiling);
        const symbol = group.latestFiling.symbol || (group.latestFiling.symbols && group.latestFiling.symbols[0]);
        console.log(`📁 [NEWS] Adding filing group: ${symbol} - ${group.latestFiling.form_type} - count: ${group.count} - timestamp: ${timestamp}`);
        allItems.push({
            type: 'filing',
            data: group.latestFiling,
            timestamp: timestamp,
            count: group.count
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
            renderFilingItem(item.data, container, item.count);
        }
    });
    
    // Log the rendering info
    const newsCount = limited.filter(item => item.type === 'news').length;
    const filingCount = limited.filter(item => item.type === 'filing').length;
    console.log(`📰 [NEWS] Rendered ${newsCount} news items and ${filingCount} filing items (total: ${limited.length})`);
    
    if (filingCount > 0) {
        console.log(`📁 [NEWS] Filing items being rendered:`, limited.filter(item => item.type === 'filing').map(item => ({
            symbol: item.data.symbol,
            form_type: item.data.form_type,
            timestamp: item.timestamp
        })));
    }
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
            <h5 style="color: #fff; margin-bottom: 10px;">${newsItem.headline || "Untitled"}</h5>
            ${when ? `<div class="news-time">${when}</div>` : ""}
        `;
    }
    
    container.appendChild(itemDiv);
}

function renderFilingItem(filingItem, container, count = 1) {
    const symbol = filingItem.symbol || (filingItem.symbols && filingItem.symbols[0]);
    const filingDate = filingItem.filing_date || filingItem.filed_at;
    console.log(`📁 [NEWS] Rendering filing: ${symbol} - ${filingDate} - count: ${count}`);
    
    const isCollapsed = isFilingItemCollapsed(filingItem);
    const when = filingDate ? formatFilingTime(filingDate) : "";
    const symbolSize = isCollapsed ? "small" : "medium";

    const itemDiv = document.createElement("div");
    itemDiv.className = `filing-item${isCollapsed ? ' collapsed' : ''}`;
    
    // Remove general click handler - we'll make specific elements clickable
    
    if (isCollapsed) {
        // Collapsed view: Use the same format as infobar
        const formType = filingItem.form_type;
        const description = filingItem.form_description || filingItem.title || "filing";
        const countText = count > 1 ? ` (${count})` : '';
        const article = count <= 1 ? 'a' : '';
        const formWord = count > 1 ? 'forms' : 'form';
        const filingText = `${symbol} has filed${countText} ${article} ${formWord} ${formType} ${description}`;
        
        itemDiv.innerHTML = `
            ${window.components.Symbol({ 
                symbol: symbol, 
                size: symbolSize,
                onClick: true
            })}
            <h5 class="${filingItem.filing_url ? 'filing-text-clickable' : ''}">${filingText}</h5>
            ${when ? `<div class="filing-time">${when}</div>` : ""}
        `;
        
        // Make the entire filing text clickable if there's a URL
        if (filingItem.filing_url) {
            const textElement = itemDiv.querySelector('h5');
            if (textElement) {
                textElement.style.cursor = 'pointer';
                textElement.addEventListener('click', () => {
                    window.open(filingItem.filing_url, '_blank', 'noopener,noreferrer');
                });
            }
        }
    } else {
        // Expanded view: Symbol + Full Title + Company + Time + URL
        const countText = count > 1 ? ` (${count})` : '';
        const article = count <= 1 ? 'a' : '';
        const formWord = count > 1 ? 'forms' : 'form';
        const titleText = `${symbol} has filed${countText} ${article} ${formWord} ${filingItem.form_type}`;
        
        itemDiv.innerHTML = `
            ${window.components.Symbol({ 
                symbol: symbol, 
                size: symbolSize,
                onClick: true
            })}
            <div class="filing-content">
                <h3 class="filing-title-large ${filingItem.filing_url ? 'filing-title-clickable' : ''}">${titleText} - ${filingItem.form_description ? `
                    <div class="filing-description"> ${filingItem.form_description}</h3>
                ` : ''}
                ${filingItem.company_name || when || count > 1 ? `
                    <div class="filing-meta">
                        ${when ? `<div class="filing-time">${when}</div>` : ''}
                        ${count > 1 ? `<div class="filing-count-info" style="font-size: 0.9em; opacity: 0.7; margin-top: 4px;">Latest of ${count} Form ${filingItem.form_type} filings</div>` : ""}
                    </div>
                ` : ''}
               
            </div>
        `;
        
        // Make only the title clickable if there's a URL
        if (filingItem.filing_url) {
            const titleElement = itemDiv.querySelector('.filing-title-large');
            if (titleElement) {
                titleElement.style.cursor = 'pointer';
                titleElement.addEventListener('click', () => {
                    window.open(filingItem.filing_url, '_blank', 'noopener,noreferrer');
                });
            }
        }
    }
    
    container.appendChild(itemDiv);
}

function getFilingTime(filingItem) {
    // 🔍 DETAILED LOGGING: Log the complete filing object structure
    console.log(`🔍 [NEWS] COMPLETE FILING OBJECT:`, JSON.stringify(filingItem, null, 2));
    console.log(`🔍 [NEWS] Filing object keys:`, Object.keys(filingItem));
    console.log(`🔍 [NEWS] Received_at_unix field:`, filingItem.received_at_unix);
    console.log(`🔍 [NEWS] Filing_date field:`, filingItem.filing_date);
    console.log(`🔍 [NEWS] Filed_at field:`, filingItem.filed_at);
    
    // For sorting/display: use original filing_date, NOT Unix timestamp
    const filingDate = filingItem.filing_date || filingItem.filed_at;
    if (!filingDate) {
        console.log(`📁 [NEWS] Filing ${filingItem.symbol} has no filing_date, using 0 timestamp`);
        return 0;
    }
    const date = new Date(filingDate);
    const timestamp = Number.isFinite(date.getTime()) ? date.getTime() : 0;
    console.log(`📁 [NEWS] Filing ${filingItem.symbol} filing_date: ${filingDate} -> timestamp: ${timestamp}`);
    return timestamp;
}

// Helper function to create filing group key for deduplication
function getFilingGroupKey(filingItem) {
    const symbol = filingItem.symbol || (filingItem.symbols && filingItem.symbols[0]);
    return `${symbol}_${filingItem.form_type}`;
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
            if (getFilingTime(filing) > getFilingTime(currentGroup.latestFiling)) {
                currentGroup.latestFiling = filing;
            }
        }
    }
    
    return grouped;
}

function formatFilingTime(filingDate) {
    // Display the original filing_date (already in NY timezone) without conversion
    if (!filingDate) return "";
    
    const date = new Date(filingDate);
    if (Number.isNaN(date.getTime())) return "";
    
    const now = new Date();
    
    // Convert current local time to NY timezone for same-day comparison
    const nowNY = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const dateNY = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    const sameDay = dateNY.getFullYear() === nowNY.getFullYear() && 
                    dateNY.getMonth() === nowNY.getMonth() && 
                    dateNY.getDate() === nowNY.getDate();

    const formatted = sameDay
        ? date.toLocaleTimeString([], { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })
        : date.toLocaleString([], {
              timeZone: "America/New_York",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
          });
    
    console.log(`📅 [NEWS] Filing time: ${filingDate} → ${formatted}`);
    
    return formatted;
}

// Check if filing item is older than 4 minutes
function isFilingItemCollapsed(filingItem) {
    // Use Unix timestamp if available, fallback to ISO string parsing
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

function getTime(item) {
    // For sorting/display: use original published/updated times, NOT Unix timestamp
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
    // Backend provides dates in ET timezone, display in ET to preserve original timezone
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

function parseTs(t) {
    if (t == null) return NaN;
    if (typeof t === "number") return t < 1e12 ? t * 1000 : t; // secs → ms
    const n = Number(t);
    if (!Number.isNaN(n)) return parseTs(n);
    const d = new Date(t).getTime();
    return Number.isNaN(d) ? NaN : d;
}

// Timer removed for performance - collapse logic now handled on re-renders