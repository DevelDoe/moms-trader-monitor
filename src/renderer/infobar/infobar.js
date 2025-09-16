const newsQueue = [];
let isNewsDisplaying = false;
const displayedNewsKeys = new Set();
let blockList = [];
let bullishList = [];
let bearishList = [];
let filingFilterSettings = {}; // Store filing filter settings
let lastJFlashTime = 0;

let lastActivePush = 0;
const ACTIVE_PUSH_COOLDOWN = 8000; // ms

// Filing debounce tracking
const filingDebounceMap = new Map(); // key: "symbol_formType", value: timestamp
const FILING_DEBOUNCE_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

// Age filter constants
const MAX_AGE_MINUTES = 4;
const MAX_AGE_MS = MAX_AGE_MINUTES * 60 * 1000; // 4 minutes in milliseconds

function maybeActivateFromSymbols(symbols) {
    if (!Array.isArray(symbols) || !symbols.length) return;
    const sym = String(symbols[0] || "").toUpperCase();
    if (!sym) return;

    // No filtering needed - backend only sends news/filings for active stocks
    const now = Date.now();
    if (now - lastActivePush < ACTIVE_PUSH_COOLDOWN) return;

    window.activeAPI?.setActiveTicker?.(sym);
    lastActivePush = now;
}

// Helper function to check if news item is less than 4 minutes old
function isNewsItemRecent(newsItem) {
    if (!newsItem) return false;
    
    // Use the same timestamp extraction logic as news.js getTime() function
    // Priority: updated_at -> created_at (matching news.js line 645)
    const timestampStr = newsItem.updated_at || newsItem.created_at;
    
    if (!timestampStr) {
        console.log("📰 [INFOBAR] News item has no timestamp, skipping age filter");
        return true; // If no timestamp, allow it through
    }
    
    const itemTime = new Date(timestampStr).getTime();
    const now = Date.now();
    const age = now - itemTime;
    
    const isRecent = age < MAX_AGE_MS;
    
    if (!isRecent) {
        console.log(`📰 [INFOBAR] News item too old (${Math.round(age / 1000 / 60)} minutes), skipping:`, newsItem.headline?.substring(0, 50));
    }
    
    return isRecent;
}

// Helper function to check if filing item is less than 4 minutes old
function isFilingItemRecent(filingItem) {
    if (!filingItem) return false;
    
    // Use the same timestamp extraction logic as news.js getFilingTime() function
    // Priority: filing_date -> filed_at (matching news.js line 565)
    const timestampStr = filingItem.filing_date || filingItem.filed_at;
    
    if (!timestampStr) {
        console.log("📁 [INFOBAR] Filing item has no timestamp, skipping age filter");
        return true; // If no timestamp, allow it through
    }
    
    const itemTime = new Date(timestampStr).getTime();
    const now = Date.now();
    const age = now - itemTime;
    
    const isRecent = age < MAX_AGE_MS;
    
    if (!isRecent) {
        console.log(`📁 [INFOBAR] Filing item too old (${Math.round(age / 1000 / 60)} minutes), skipping:`, filingItem.symbol, filingItem.form_type);
    }
    
    return isRecent;
}


document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Page Loaded. Initializing...");

    await loadSettings(); // blockList + bullishList + bearishList
    // Don't fetch initial news - only listen for deltas





    window.settingsAPI.onUpdate(async (updated) => {
        window.settings = structuredClone(updated || {});
    });

    // Subscribe to news settings changes
    window.newsSettingsAPI.onUpdate((updatedNewsSettings) => {
        if (updatedNewsSettings) {
            blockList = (updatedNewsSettings.blockList || []).map((w) => w.toLowerCase().trim());
            bullishList = (updatedNewsSettings.bullishList || []).map((w) => w.toLowerCase().trim());
            bearishList = (updatedNewsSettings.bearishList || []).map((w) => w.toLowerCase().trim());
            console.log("✅ News settings updated in infobar:", updatedNewsSettings);
        }
    });

    // Subscribe to filing filter settings changes
    window.filingFilterSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings) {
            filingFilterSettings = updatedSettings;
            console.log("✅ Filing filter settings updated in infobar:", updatedSettings);
        }
    });

    // Don't listen for full headlines - only deltas

    // Listen for new news deltas
    window.newsAPI.onDelta((newsItem, metadata = {}) => {
        if (newsItem) {
            // Skip hydration data - only process real-time deltas
            if (metadata.isHydration) {
                console.log("📰 Skipping hydration news data:", newsItem.headline);
                return;
            }

            console.log("📰 New news delta received:", newsItem.headline);
            
            // Check if news item is recent (less than 4 minutes old)
            if (!isNewsItemRecent(newsItem)) {
                return;
            }
            
            const sanitized = newsItem.headline.toLowerCase().trim();
            const isBlocked = blockList.some((word) => sanitized.includes(word));
            const isDuplicate = displayedNewsKeys.has(newsItem.id);

            // Skip blocked or duplicate news
            if (isBlocked || isDuplicate) return;

            const type = getSentimentClass(newsItem.headline);
            let truncated = newsItem.headline;
            if (truncated.length > 240) truncated = truncated.slice(0, 239).trimEnd() + "…";

            // Extract symbols from newsItem
            const symbols = [];
            if (newsItem.symbol) {
                symbols.push(newsItem.symbol);
            } else if (newsItem.symbols && Array.isArray(newsItem.symbols)) {
                symbols.push(...newsItem.symbols);
            }

            queueNewsItem(truncated, newsItem.id, type, symbols);
        }
    });

    // Listen for new filing deltas
    window.filingAPI.onDelta((filingItem, metadata = {}) => {
        if (filingItem) {
            // Skip hydration data - only process real-time deltas
            if (metadata.isHydration) {
                console.log("📁 Skipping hydration filing data:", filingItem.symbol, filingItem.form_type);
                return;
            }

            console.log("📁 New filing delta received:", filingItem.form_type, filingItem.title);
            
            // Check if filing item is recent (less than 4 minutes old)
            if (!isFilingItemRecent(filingItem)) {
                return;
            }
            
            // Check if filing is allowed based on filter settings
            if (!isFilingAllowed(filingItem)) {
                console.log("📁 Filing filtered out:", filingItem.form_type, filingItem.symbol);
                return;
            }
            
            // Check if filing should be debounced (5-minute cooldown for same filing type)
            if (shouldDebounceFiling(filingItem)) {
                return;
            }
            
            const isDuplicate = displayedNewsKeys.has(filingItem.accession_number);

            // Skip duplicate filings
            if (isDuplicate) return;

            const type = "filing"; // Filings are always neutral
            const symbol = filingItem.symbol;
            const formType = filingItem.form_type;
            const description = filingItem.form_description;
            let truncated = `${symbol} has filed a ${formType} ${description}`;
            if (truncated.length > 240) truncated = truncated.slice(0, 239).trimEnd() + "…";

            // Extract symbols from filingItem
            const symbols = [filingItem.symbol];

            queueNewsItem(truncated, filingItem.accession_number, type, symbols);
        }
    });

    window.infobarAPI.onForceRefresh?.(() => {
        console.log("🔁 Refreshing infobar from main process trigger...");
        displayedNewsKeys.clear();
        // Don't fetch news - only listen for deltas
    });

    // Listen for Oracle hydration completion to refresh data
    window.newsAPI.onHydrationComplete(() => {
        console.log("🔄 [INFOBAR] Oracle hydration complete - clearing displayed news keys...");
        
        // Clear displayed news keys so we can show new items
        displayedNewsKeys.clear();
        
        // Clear the news queue
        newsQueue.length = 0;
        
        // Stop any currently displaying news
        if (isNewsDisplaying) {
            const container = document.querySelector(".bonus-list");
            if (container) {
                container.innerHTML = "";
                isNewsDisplaying = false;
            }
        }
        
        // Restart the regular ticker
        initTicker(".bonus-list", bonusItems);
        
        console.log("🔄 [INFOBAR] Cleared all news data and restarted ticker after hydration");
    });
});

async function loadSettings() {
    try {
        console.log("📢 Fetching settings...");
        window.settings = await window.settingsAPI.get();

        // ✅ Ensure path + default
        window.settings.events ||= {};
        if (typeof window.settings.events.newsAlertVolume !== "number") {
            window.settings.events.newsAlertVolume = 0.55;
            window.settingsAPI.update(window.settings).catch(() => {});
        }



        // Load news settings from news store
        try {
            const newsSettings = await window.newsSettingsAPI.get();
            blockList = (newsSettings.blockList || []).map((w) => w.toLowerCase().trim());
            bullishList = (newsSettings.bullishList || []).map((w) => w.toLowerCase().trim());
            bearishList = (newsSettings.bearishList || []).map((w) => w.toLowerCase().trim());
            console.log("✅ Loaded news settings from news store:", newsSettings);
        } catch (newsError) {
            console.warn("⚠️ Failed to load news settings, using empty lists:", newsError);
            blockList = [];
            bullishList = [];
            bearishList = [];
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

        console.log("✅ Loaded settings:", window.settings);
    } catch (error) {
        console.error("⚠️ Error loading settings:", error);
        blockList = [];
        bullishList = [];
        bearishList = [];
    }
}

function getNewsAlertVolume() {
    const v = Number(window?.settings?.events?.newsAlertVolume);
    if (!Number.isFinite(v)) return 0.55;
    return Math.min(1, Math.max(0, v));
}



// fetchNews() function removed - infobar only listens to delta updates from Oracle
// This ensures we only show real-time news alerts, not historical data

// Determine sentiment (Bullish, Bearish, or Neutral)
function getSentimentClass(headline) {
    const sanitizedHeadline = headline.toLowerCase().trim();
    const hasBullish = bullishList.some((word) => sanitizedHeadline.includes(word.toLowerCase()));
    const hasBearish = bearishList.some((word) => sanitizedHeadline.includes(word.toLowerCase()));

    if (hasBullish && !hasBearish) return "bullish";
    if (hasBearish && !hasBullish) return "bearish";
    if (hasBearish && hasBullish) return "neutral";
    return "neutral"; // Default to neutral if neither
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

// Helper function to check if filing should be debounced
function shouldDebounceFiling(filingItem) {
    const symbol = filingItem.symbol;
    const formType = filingItem.form_type;
    const debounceKey = `${symbol}_${formType}`;
    const now = Date.now();
    
    const lastSeenTime = filingDebounceMap.get(debounceKey);
    
    if (lastSeenTime && (now - lastSeenTime) < FILING_DEBOUNCE_TIME) {
        console.log(`📁 [INFOBAR] Filing debounced: ${symbol} ${formType} (last seen ${Math.round((now - lastSeenTime) / 1000)}s ago)`);
        return true; // Should be debounced
    }
    
    // Update the last seen time
    filingDebounceMap.set(debounceKey, now);
    
    // Clean up old entries to prevent memory leaks
    for (const [key, timestamp] of filingDebounceMap.entries()) {
        if (now - timestamp > FILING_DEBOUNCE_TIME * 2) { // Clean up entries older than 10 minutes
            filingDebounceMap.delete(key);
        }
    }
    
    return false; // Should not be debounced
}

/**
 * Initializes a scrolling ticker with the given items.
 * @param {string} containerSelector - CSS selector of the UL element.
 * @param {Array<{ icon: string, desc: string }>} dataList - List of items to display.
 * @param {number} interval - Time in ms between items. Default: 10000 (10s)
 */
function initTicker(containerSelector, dataList, interval = 10000) {
    const container = document.querySelector(containerSelector);
    if (!container || !dataList || dataList.length === 0) return;

    // Clear existing items
    container.innerHTML = "";

    // Populate with new items
    dataList.forEach(({ icon, desc }) => {
        const li = document.createElement("li");
        li.className = "bonus-item draggable";
        li.innerHTML = `<span class="icon">${icon}</span><span class="desc">${desc}</span>`;
        container.appendChild(li);
    });

    const items = container.querySelectorAll(".bonus-item");
    let currentIndex = 0;

    const showItem = () => {
        items.forEach((item, index) => {
            item.classList.remove("show", "slide");
            if (index === currentIndex) {
                item.classList.add("show", "slide");
            }
        });
    };

    showItem(); // Show first

    setInterval(() => {
        currentIndex = (currentIndex + 1) % items.length;
        showItem();
    }, interval);
}

function showNewsItem(containerSelector, icon, desc, onDismiss, type = "neutral", symbols = []) {
    isNewsDisplaying = true;
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.innerHTML = "";
    playFlash();

    const li = document.createElement("li");
    li.className = `news-item show slide-in no-drag ${type}-news`;

    // left icon
    const iconSpan = document.createElement("span");
    iconSpan.className = "icon";
    iconSpan.textContent = icon;
    li.appendChild(iconSpan);

    // symbols using the Symbol component
    if (Array.isArray(symbols) && symbols.length) {
        const symWrap = document.createElement("span");
        symWrap.className = "symbols";
        for (const s of symbols) {
            const sym = String(s).toUpperCase();
            if (!sym) continue;
            const symbolHtml = window.components.Symbol({ 
                symbol: sym, 
                size: "small",
                onClick: true
            });
            symWrap.innerHTML += symbolHtml;
        }
        li.appendChild(symWrap);
    }

    // headline text
    const descSpan = document.createElement("span");
    descSpan.className = "desc";
    descSpan.innerHTML = `<span class="scroll-inner">${desc}</span>`;
    li.appendChild(descSpan);

    // mount and scrolling logic
    container.appendChild(li);
    setTimeout(() => {
        const inner = descSpan.querySelector(".scroll-inner");
        if (inner && descSpan.clientHeight < inner.scrollHeight) inner.classList.add("scroll-vertical");
    }, 50);

    const cleanup = () => {
        container.innerHTML = "";
        isNewsDisplaying = false;
        if (typeof onDismiss === "function") onDismiss();
        processNextNews();
    };
    li.addEventListener("click", () => {
        li.classList.remove("slide-in");
        li.classList.add("slide-out");
        li.addEventListener("animationend", cleanup, { once: true });
    });
    setTimeout(() => li.click(), 30000);
}

function queueNewsItem(desc, id = null, type = "neutral", symbols = []) {
    if (id && displayedNewsKeys.has(id)) return;

    const icon = type === "bullish" ? "😺" : type === "bearish" ? "🙀" : type === "filing" ? "📁" : "😼";
    newsQueue.push({ icon, desc, type, symbols });
    if (id) displayedNewsKeys.add(id);
    if (!isNewsDisplaying) processNextNews();
}

function processNextNews() {
    if (newsQueue.length > 0) {
        const { icon, desc, type, symbols } = newsQueue.shift();

        // 👉 push to active “Gilmore” here
        maybeActivateFromSymbols(symbols);

        showNewsItem(
            ".bonus-list",
            icon,
            desc,
            () => {
                if (newsQueue.length === 0) initTicker(".bonus-list", bonusItems);
            },
            type,
            symbols
        );
    }
}

function playFlash() {
    const now = Date.now();
    const gap = 3000;
    if (now - lastJFlashTime < gap) {
        console.log("Jingle call debounced.");
        return;
    }
    lastJFlashTime = now;

    // Use centralized audio system instead of local audio
    if (window.audioAPI) {
        window.audioAPI.playNewsAlert().catch((error) => {
            console.error("Error playing news alert via centralized system:", error);
        });
        console.log("🎵 News alert triggered via centralized audio system");
    } else {
        console.warn("⚠️ Centralized audio API not available, skipping news alert");
    }
}

const bonusItems = [
    { icon: "❄️", desc: "Tiny Volume" },
    { icon: "💤", desc: "Low Volume" },
    { icon: "🚛", desc: "Medium Volume" },
    { icon: "🔥", desc: "High Volume" },
    { icon: "🚀", desc: "Parabolic Volume" },
    { icon: "1️⃣", desc: "Float around 1M" },
    { icon: "5️⃣", desc: "Float around 5M" },
    { icon: "🔟", desc: "Float around 10M" },
    { icon: "50", desc: "Float around 50M" },
    { icon: "100", desc: "Float around 100M" },
    // { icon: "200", desc: "Float around 200M" },
    // { icon: "500", desc: "Float around 500M" },
    // { icon: "600+", desc: "Float higher than 600M" },
    { icon: "⚠️", desc: "Float is corrupted" },
    { icon: "🏛️", desc: "High insider/institutional/locked shares holders" },
    { icon: "😼", desc: "Catalyst in play — recent news may affect momentum" },
    { icon: "😺", desc: "Bullish news - may affect momentum" },
    { icon: "🙀", desc: "Bearish news - may affect momentum" },
    { icon: "📈", desc: "New high" },
    { icon: "🔁", desc: "Recovering — stock is bouncing back after a downtrend" },
    { icon: "🧬", desc: "Biotechnology stock" },
    { icon: "🌿", desc: "Cannabis stock" },
    { icon: "🌌", desc: "Space industry stock" },
    { icon: "🇨🇳", desc: "China/Hong Kong-based company" },
    { icon: "🩳", desc: "High short interest (more than 20% of float)" },
    { icon: "🥅", desc: "Company is currently running at a net loss" },
    { icon: "📂", desc: "Registered S-3 filing" },
    { icon: "🚨", desc: "High dilution risk: Net loss + Registered S-3" },
];

// Removed assignHue and hueClass functions - now using Symbol component

// Show regular ticker
initTicker(".bonus-list", bonusItems);

// Test function for news alerts - forward to centralized system
window.testNewsAlert = () => {
    console.log("🎧 Infobar forwarding news alert test to centralized audio system...");
    if (window.audioAPI) {
        window.audioAPI.testNewsAlert();
    } else {
        console.warn("⚠️ Centralized audio API not available");
    }
};

// Test function for news integration
window.testNewsIntegration = () => {
    console.log("Testing news integration...");
    console.log(`[News Test] News queue length:`, newsQueue.length);
    console.log(`[News Test] Currently displaying news:`, isNewsDisplaying);
    console.log(`[News Test] Block list:`, blockList);
    console.log(`[News Test] Bullish list:`, bullishList);
    console.log(`[News Test] Bearish list:`, bearishList);
};

// Test function for age filtering
window.testAgeFiltering = () => {
    console.log("Testing age filtering...");
    console.log(`[Age Filter Test] Max age: ${MAX_AGE_MINUTES} minutes (${MAX_AGE_MS} ms)`);
    
    // Test with a recent news item (1 minute old)
    const recentNews = {
        headline: "Test recent news",
        updated_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(), // 1 minute ago
        id: "test-recent"
    };
    
    // Test with an old news item (5 minutes old)
    const oldNews = {
        headline: "Test old news",
        updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
        id: "test-old"
    };
    
    // Test with a recent filing (2 minutes old)
    const recentFiling = {
        symbol: "TEST",
        form_type: "8-K",
        filing_date: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
        accession_number: "test-recent-filing"
    };
    
    // Test with an old filing (6 minutes old)
    const oldFiling = {
        symbol: "TEST",
        form_type: "8-K",
        filing_date: new Date(Date.now() - 6 * 60 * 1000).toISOString(), // 6 minutes ago
        accession_number: "test-old-filing"
    };
    
    console.log(`[Age Filter Test] Recent news (1 min old): ${isNewsItemRecent(recentNews) ? "PASS" : "FAIL"}`);
    console.log(`[Age Filter Test] Old news (5 min old): ${isNewsItemRecent(oldNews) ? "FAIL" : "PASS"}`);
    console.log(`[Age Filter Test] Recent filing (2 min old): ${isFilingItemRecent(recentFiling) ? "PASS" : "FAIL"}`);
    console.log(`[Age Filter Test] Old filing (6 min old): ${isFilingItemRecent(oldFiling) ? "FAIL" : "PASS"}`);
};

// IPC listeners for audio test commands
if (window.ipcListenerAPI) {
    window.ipcListenerAPI.onTestNewsAlert(() => {
        console.log("[Infobar] Received test-news-alert command from main process");
        window.testNewsAlert();
    });
}


