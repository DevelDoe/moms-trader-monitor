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
            
            // Check if filing is allowed based on filter settings
            if (!isFilingAllowed(filingItem)) {
                console.log("📁 Filing filtered out:", filingItem.form_type, filingItem.symbol);
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
                group1Enabled: true,
                group2Enabled: true,
                group3Enabled: false,
                enabledForms: []
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

// Filing filter function
function isFilingAllowed(filingItem) {
    if (!filingItem || !filingItem.form_type) {
        return false;
    }

    const formType = filingItem.form_type;
    
    // SEC Form Priority Mapping
    const FORM_PRIORITIES = {
        // High Priority (1)
        '8-K': 1, '8-K/A': 1,
        'S-3': 1, 'S-3/A': 1,
        'S-1': 1, 'S-1/A': 1,
        '424B1': 1, '424B2': 1, '424B3': 1, '424B4': 1, '424B5': 1,
        '425': 1,  // Business combination transactions (mergers, acquisitions)
        '10-Q': 1, '10-Q/A': 1,
        '10-K': 1, '10-K/A': 1,
        '6-K': 1, '20-F': 1, '40-F': 1,
        
        // Medium Priority (2)
        '13D': 2, '13D/A': 2,
        '13G': 2, '13G/A': 2,
        '4': 2, '4/A': 2,
        'DEF 14A': 2, 'DEFA14A': 2,
        'F-1': 2, 'F-1/A': 2,
        'F-3': 2, 'F-3/A': 2,
        
        // Low Priority (3) - will be filtered out at manager level
        '11-K': 3, '144': 3, '144A': 3, '305B2': 3,
        'SC TO-T': 3, 'SC 13E3': 3,
        'N-Q': 3, 'N-CSR': 3, 'N-1A': 3,
        'N-CSRS': 3, 'N-MFP': 3, 'N-MFP2': 3, 'N-MFP3': 3,
    };

    const priority = FORM_PRIORITIES[formType];
    if (priority === undefined) {
        // Unknown form type - allow by default
        return true;
    }

    // Check group settings first
    let groupEnabled = false;
    if (priority === 1) {
        groupEnabled = filingFilterSettings.group1Enabled !== false;
    } else if (priority === 2) {
        groupEnabled = filingFilterSettings.group2Enabled !== false;
    } else if (priority === 3) {
        groupEnabled = filingFilterSettings.group3Enabled !== false;
    }

    if (!groupEnabled) {
        return false;
    }

    // Check specific form settings
    let formEnabled = true; // default to enabled
    if (priority === 1 && filingFilterSettings.group1Forms) {
        formEnabled = filingFilterSettings.group1Forms[formType] !== false;
    } else if (priority === 2 && filingFilterSettings.group2Forms) {
        formEnabled = filingFilterSettings.group2Forms[formType] !== false;
    } else if (priority === 3 && filingFilterSettings.group3Forms) {
        formEnabled = filingFilterSettings.group3Forms[formType] !== false;
    }

    return formEnabled;
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

    const audio = new Audio("./metal.wav");
    audio.volume = getNewsAlertVolume(); // 🎚 hook to settings.events.newsAlertVolume

    audio
        .play()
        .then(() => console.log("Sound played successfully."))
        .catch((error) => console.error("Error playing sound:", error));
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

// Test function for news alerts
window.testNewsAlert = () => {
    console.log("Testing news alert sound...");
    console.log(`[News Test] Current volume: ${getNewsAlertVolume()}`);
    console.log(`[News Test] Audio file path: ./metal.wav`);
    playFlash();
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

// IPC listeners for audio test commands
if (window.ipcListenerAPI) {
    window.ipcListenerAPI.onTestNewsAlert(() => {
        console.log("[Infobar] Received test-news-alert command from main process");
        window.testNewsAlert();
    });
}


