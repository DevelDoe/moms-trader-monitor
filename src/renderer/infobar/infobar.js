const newsQueue = [];
let isNewsDisplaying = false;
const displayedNewsKeys = new Set();
let blockList = [];
let bullishList = [];
let bearishList = [];
let lastJFlashTime = 0;
let trackedTickers = [];

let lastActivePush = 0;
const ACTIVE_PUSH_COOLDOWN = 8000; // ms
let activeStocksData = null; // ← Oracle active stocks data

function maybeActivateFromSymbols(symbols) {
    if (!Array.isArray(symbols) || !symbols.length) return;
    const sym = String(symbols[0] || "").toUpperCase();
    if (!sym) return;

    // honor the UI filter when it's on
    if (showTrackedOnly) {
        // Check if symbol is in tracked tickers
        if (trackedTickers.includes(sym)) {
            // Allow activation
        } else if (activeStocksData?.symbols && activeStocksData.symbols.length > 0) {
            // Check if symbol is in Oracle active stocks
            const isActiveStock = activeStocksData.symbols.some(active => active.symbol === sym);
            if (!isActiveStock) return; // Not in active stocks either
        } else {
            return; // No active stocks data and not in tracked tickers
        }
    }

    const now = Date.now();
    if (now - lastActivePush < ACTIVE_PUSH_COOLDOWN) return;

    window.activeAPI?.setActiveTicker?.(sym);
    lastActivePush = now;
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Page Loaded. Initializing...");

    await loadSettings(); // blockList + showTrackedOnly
    // Don't fetch initial news - only listen for deltas

    window.storeAPI.onTrackedUpdate((list) => {
        console.log("trackedTickers", list);
        trackedTickers = (Array.isArray(list) ? list : []).map((s) => String(s).toUpperCase());
        console.log("trackedTickers", trackedTickers);
        // Don't re-filter - only listen for new deltas
    });

    // Listen for Oracle active stocks updates
    window.xpAPI.onActiveStocksUpdate((data) => {
        console.log("🔄 Oracle active stocks update received:", data);
        console.log("🔍 Previous active stocks data:", activeStocksData);
        
        // Log the new active stocks list details
        if (data?.symbols && Array.isArray(data.symbols)) {
            console.log(`📊 NEW ACTIVE STOCKS LIST RECEIVED: ${data.symbols.length} symbols`);
            console.log("📋 Active stocks symbols:", data.symbols.map(s => s.symbol));
        } else {
            console.log("⚠️ Active stocks update received but no valid symbols data");
        }
        
        activeStocksData = data;
        console.log("🔍 New active stocks data:", activeStocksData);
        
        if (data?.symbols && data.symbols.length > 0) {
            console.log("✅ Active stocks data updated, re-filtering news with", data.symbols.length, "symbols");
        } else {
            console.log("⚠️ Active stocks update received but no symbols data");
        }
        
        // Don't re-filter - only listen for new deltas
    });

    // Get initial Oracle data
    try {
        activeStocksData = await window.xpAPI.getActiveStocks();
        console.log("📊 Initial Oracle active stocks data:", activeStocksData);
        
        // Don't re-filter - only listen for new deltas
        if (activeStocksData?.symbols && activeStocksData.symbols.length > 0) {
            console.log("✅ Got initial active stocks data");
        } else {
            console.log("⚠️ No initial active stocks data available yet");
        }
    } catch (e) {
        console.warn("Failed to get initial Oracle data:", e);
        activeStocksData = null;
    }

    // Add fallback to last session data for overnight continuity
    if (!activeStocksData?.symbols) {
        try {
            const sessionHistory = await window.xpAPI.getSessionHistory();
            if (sessionHistory?.sessions) {
                const lastActiveSession = sessionHistory.sessions
                    .filter(s => s.symbols?.length > 0)
                    .sort((a, b) => b.end_time - a.end_time)[0];
                
                if (lastActiveSession) {
                    activeStocksData = { symbols: lastActiveSession.symbols };
                    console.log(`🌙 Using last session data (${lastActiveSession.session_name}) for overnight continuity: ${lastActiveSession.symbols.length} symbols`);
                    // Don't re-filter - only listen for new deltas
                }
            }
        } catch (fallbackError) {
            console.warn("Failed to get session history fallback:", fallbackError);
        }
    }


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

    // Don't listen for full headlines - only deltas

    // Listen for new news deltas
    window.newsAPI.onDelta((newsItem) => {
        if (newsItem) {
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
    window.filingAPI.onDelta((filingItem) => {
        if (filingItem) {
            console.log("📁 New filing delta received:", filingItem.form_type, filingItem.title);
            const isDuplicate = displayedNewsKeys.has(filingItem.id || filingItem.accession_number);

            // Skip duplicate filings
            if (isDuplicate) return;

            const type = "filing"; // Filings are always neutral
            const symbol = filingItem.symbol || filingItem.symbols?.[0] || "Unknown";
            const formType = filingItem.form_type || "filing";
            const description = filingItem.form_description || "document";
            let truncated = `${symbol} has filed a ${formType} ${description}`;
            if (truncated.length > 240) truncated = truncated.slice(0, 239).trimEnd() + "…";

            // Extract symbols from filingItem
            const symbols = [];
            if (filingItem.symbol) {
                symbols.push(filingItem.symbol);
            } else if (filingItem.symbols && Array.isArray(filingItem.symbols)) {
                symbols.push(...filingItem.symbols);
            }

            queueNewsItem(truncated, filingItem.id || filingItem.accession_number, type, symbols);
        }
    });

    window.infobarAPI.onForceRefresh?.(() => {
        console.log("🔁 Refreshing infobar from main process trigger...");
        displayedNewsKeys.clear();
        // Don't fetch news - only listen for deltas
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

// Test function for active stocks integration
window.testActiveStocks = () => {
    console.log("Testing active stocks integration...");
    console.log(`[Active Stocks Test] Current active stocks:`, activeStocksData);
    console.log(`[Active Stocks Test] Current tracked tickers:`, trackedTickers);
    console.log(`[Active Stocks Test] Show tracked only:`, showTrackedOnly);
    
    if (activeStocksData?.symbols) {
        console.log(`[Active Stocks Test] Active stocks symbols:`, activeStocksData.symbols.map(s => s.symbol));
    }
    
    if (trackedTickers.length > 0) {
        console.log(`[Active Stocks Test] Tracked tickers:`, trackedTickers);
    }
    
    console.log(`[Active Stocks Test] News queue length:`, newsQueue.length);
    console.log(`[Active Stocks Test] Currently displaying news:`, isNewsDisplaying);
};

// IPC listeners for audio test commands
if (window.ipcListenerAPI) {
    window.ipcListenerAPI.onTestNewsAlert(() => {
        console.log("[Infobar] Received test-news-alert command from main process");
        window.testNewsAlert();
    });
}


