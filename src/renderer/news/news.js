// news.js — minimal time-sorted list (ET) with symbol hue badges (no store symbols)

let blockList = [];
let allNews = [];
let showTrackedOnly = false;
let trackedTickers = [];

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

    // settings changes
    window.settingsAPI.onUpdate(async (updated) => {
        window.settings = structuredClone(updated || {});
        blockList = window.settings?.news?.blockList || [];
        showTrackedOnly = !!window.settings?.news?.showTrackedTickers;
        trackedTickers = (window.settings?.news?.trackedTickers || []).map((s) => String(s).toUpperCase());
        // console.log("onUpdate trackedTickers", trackedTickers);
        render();
    });

    // news pushed from main
    window.newsAPI.onUpdate(async () => {
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
        const newsData = await window.newsAPI.get();
        allNews = Array.isArray(newsData) ? newsData : [];
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
            if (!syms.length || !trackedTickers.length) return false;
            if (!syms.some((s) => trackedTickers.includes(String(s).toUpperCase()))) return false;
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
        trackedTickers = (window.settings?.news?.trackedTickers || []).map((s) => String(s).toUpperCase());
    } catch (e) {
        console.warn("settings load failed:", e);
        blockList = [];
        showTrackedOnly = false;
        trackedTickers = [];
    }
}
