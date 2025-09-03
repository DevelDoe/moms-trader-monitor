// news.js — minimal time-sorted list (ET) with symbol hue badges (no store symbols)

let blockList = [];
let allNews = [];
let showTrackedOnly = false;
let trackedTickers = [];
let activeStocksData = null; // ← Oracle active stocks data

// --- boot ---
document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Page Loaded. Initializing...");

    await loadSettings();
    await refreshNewsFromStore();

    // ✅ NEW: stay in sync with store
    window.storeAPI.onTrackedUpdate((list) => {
        trackedTickers = (Array.isArray(list) ? list : []).map((s) => String(s).toUpperCase());
        // console.log("onTrackedUpdate trackedTickers", trackedTickers);
        render();
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
            console.log("✅ Active stocks data updated, re-rendering with", data.symbols.length, "symbols");
        } else {
            console.log("⚠️ Active stocks update received but no symbols data");
        }
        
        render(); // re-render with new active stocks filter
    });

    // Get initial Oracle data
    try {
        activeStocksData = await window.xpAPI.getActiveStocks();
        console.log("📊 Initial Oracle active stocks data:", activeStocksData);
        
        // If we got data, re-render to apply any active stocks filtering
        if (activeStocksData?.symbols && activeStocksData.symbols.length > 0) {
            console.log("✅ Got initial active stocks, re-rendering...");
            render();
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
                    render(); // Re-render with fallback data
                }
            }
        } catch (fallbackError) {
            console.warn("Failed to get session history fallback:", fallbackError);
        }
    }

    // settings change
    window.settingsAPI.onUpdate(async (updated) => {
        window.settings = structuredClone(updated || {});
        blockList = window.settings?.news?.blockList || [];
        showTrackedOnly = !!window.settings?.news?.showTrackedTickers;

        render();
    });

    // news pushed from main
    window.newsAPI.onUpdate(async () => {
        console.log("🔄 News update received in news.js, refreshing from store...");
        await refreshNewsFromStore();
    });

    
});

// --- deterministic hue (match Python: sum(ord)*37 % 360) ---
function assignHue(symbol) {
    if (!symbol) return 210;
    const key = String(symbol).trim().toUpperCase();
    let sum = 0;
    for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
    return (sum * 37) % 360;
}

// Map exact hue to one of 12 class buckets (0,30,...,330)
// (Keeps CSP strict: no inline styles needed)
function hueClass(h) {
    const n = ((Number(h) % 360) + 360) % 360;
    const bucket = (Math.round(n / 30) * 30) % 360;
    return `badge-h${bucket}`;
}

async function refreshNewsFromStore() {
    try {
        console.log("📢 Refreshing news from store in news.js...");
        const newsData = await window.newsAPI.get();
        allNews = Array.isArray(newsData) ? newsData : [];
        console.log(`📰 Loaded ${allNews.length} news items from store`);
        render();
    } catch (e) {
        console.error("refreshNewsFromStore failed:", e);
    }
}

function render() {
    const list = document.getElementById("news-list");
    list.innerHTML = "";

    const filtered = (allNews || []).filter((n) => {
        const h = (n.headline || "").toLowerCase();
        if (blockList.some((w) => h.includes(String(w).toLowerCase()))) return false;

        if (showTrackedOnly) {
            const syms = Array.isArray(n.symbols) ? n.symbols : n.symbol ? [n.symbol] : [];
            if (!syms.length) return false;
            
            // First check if any symbol is in tracked tickers
            const hasTrackedSymbol = syms.some((s) => trackedTickers.includes(String(s).toUpperCase()));
            if (hasTrackedSymbol) return true;
            
            // If no tracked symbols, check if any symbol is in Oracle active stocks
            if (activeStocksData?.symbols && activeStocksData.symbols.length > 0) {
                const hasActiveSymbol = syms.some((s) => 
                    activeStocksData.symbols.some(active => active.symbol === String(s).toUpperCase())
                );
                if (hasActiveSymbol) return true;
            }
            
            return false;
        }

        return true;
    });

    const sorted = filtered.sort((a, b) => ts(b) - ts(a));

    // if (sorted.length === 0) {
    //     const li = document.createElement("li");
    //     li.className = "empty";
    //     li.textContent = "No news yet.";
    //     list.appendChild(li);
    //     return;
    // }

    for (const n of sorted) {
        const li = document.createElement("li");
        li.title = n.headline || "";

        const syms = Array.isArray(n.symbols) ? n.symbols : n.symbol ? [n.symbol] : [];
        if (syms.length) {
            const symWrap = document.createElement("span");
            symWrap.className = "symbols";
            for (const s of syms) {
                const sym = String(s).toUpperCase();
                const hue = assignHue(sym);
                const cls = hueClass(hue);
                const badge = document.createElement("span");
                badge.className = `badge ${cls}`;
                badge.textContent = sym;
                symWrap.appendChild(badge);
            }
            li.appendChild(symWrap);
        }

        const timeEl = document.createElement("span");
        timeEl.className = "time";
        timeEl.textContent = `${formatET(ts(n))}`;
        li.appendChild(timeEl);

        const headlineEl = document.createElement("span");
        headlineEl.className = "headline";
        headlineEl.textContent = decodeHTMLEntities(n.headline || "");
        li.appendChild(headlineEl);

        list.appendChild(li);
    }
}
// --- helpers ---
function assignHue(symbol) {
    if (!symbol) return 210;
    const key = String(symbol).trim().toUpperCase();
    let sum = 0;
    for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
    return (sum * 37) % 360;
}
function hueClass(h) {
    const n = ((Number(h) % 360) + 360) % 360;
    const bucket = (Math.round(n / 30) * 30) % 360;
    return `badge-h${bucket}`;
}
function ts(n) {
    return toMs(n.updated_at) ?? toMs(n.created_at) ?? 0;
}
function toMs(v) {
    if (!v) return null;
    if (typeof v === "number") return v > 1e12 ? v : v * 1000;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
}
function formatET(ms) {
    if (!ms) return "--:--";
    return new Date(ms).toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}
function decodeHTMLEntities(text) {
    const p = new DOMParser();
    const d = p.parseFromString(text, "text/html").body.textContent;
    return d || text;
}
async function loadSettings() {
    try {
        window.settings = await window.settingsAPI.get();
        blockList = window.settings?.news?.blockList || [];
        showTrackedOnly = !!window.settings?.news?.showTrackedTickers;

    } catch (e) {
        console.warn("settings load failed:", e);
        blockList = [];
        showTrackedOnly = false;
        trackedTickers = [];
    }
}

// Test function for active stocks integration
window.testNewsActiveStocks = () => {
    console.log("Testing news active stocks integration...");
    console.log(`[News Test] Current active stocks:`, activeStocksData);
    console.log(`[News Test] Current tracked tickers:`, trackedTickers);
    console.log(`[News Test] Show tracked only:`, showTrackedOnly);
    console.log(`[News Test] Total news items:`, allNews?.length || 0);
    
    if (activeStocksData?.symbols) {
        console.log(`[News Test] Active stocks symbols:`, activeStocksData.symbols.map(s => s.symbol));
    }
    
    if (trackedTickers.length > 0) {
        console.log(`[News Test] Tracked tickers:`, trackedTickers);
    }
};
