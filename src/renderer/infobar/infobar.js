const newsQueue = [];
let isNewsDisplaying = false;
const displayedNewsKeys = new Set();
let blockList = [];
let bullishList = [];
let bearishList = [];
let lastJFlashTime = 0;
let trackedTickers = [];
let showTrackedOnly = false;

let lastActivePush = 0;
const ACTIVE_PUSH_COOLDOWN = 8000; // ms

function maybeActivateFromSymbols(symbols) {
    if (!Array.isArray(symbols) || !symbols.length) return;
    const sym = String(symbols[0] || "").toUpperCase();
    if (!sym) return;

    // honor the UI filter when it's on
    if (showTrackedOnly && trackedTickers.length && !trackedTickers.includes(sym)) return;

    const now = Date.now();
    if (now - lastActivePush < ACTIVE_PUSH_COOLDOWN) return;

    window.activeAPI?.setActiveTicker?.(sym);
    lastActivePush = now;
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Page Loaded. Initializing...");

    await loadSettings(); // blockList + showTrackedOnly
    await fetchNews(); // initial headlines

    window.storeAPI.onTrackedUpdate((list) => {
        console.log("trackedTickers", list);
        trackedTickers = (Array.isArray(list) ? list : []).map((s) => String(s).toUpperCase());
        console.log("trackedTickers", trackedTickers);
        fetchNews(); // re-filter with latest tracked list
    });

    // settings changes — DO NOT set trackedTickers from settings anymore
    window.settingsAPI.onUpdate(async (updated) => {
        window.settings = structuredClone(updated || {});
        const prev = showTrackedOnly;
        blockList = window.settings?.news?.blockList || [];
        showTrackedOnly = !!window.settings?.news?.showTrackedTickers;
        trackedTickers = (window.settings?.news?.trackedTickers || []).map((s) => String(s).toUpperCase());
        console.log("onUpdate trackedTickers", trackedTickers);
        if (prev !== showTrackedOnly) fetchNews(); // only re-filter if toggle changed
    });

    // news pushed from main — just refresh headlines
    window.newsAPI.onUpdate(() => {
        console.log("🔄 Received news update. Fetching fresh news...");
        fetchNews();
    });

    window.infobarAPI.onForceRefresh?.(() => {
        console.log("🔁 Refreshing infobar from main process trigger...");
        displayedNewsKeys.clear();
        fetchNews();
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

        blockList = (window.settings.news?.blockList || []).map((w) => w.toLowerCase().trim());
        bullishList = (window.settings.news?.bullishList || []).map((w) => w.toLowerCase().trim());
        bearishList = (window.settings.news?.bearishList || []).map((w) => w.toLowerCase().trim());

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

async function fetchNews() {
    try {
        console.log("📢 Fetching news...");

        const newsData = await window.newsAPI.get();
        if (!Array.isArray(newsData)) {
            console.error("⚠️ Expected an array but got:", newsData);
            return;
        }

        newsData.forEach((newsItem) => {
            const sanitized = newsItem.headline.toLowerCase().trim();
            const isBlocked = blockList.some((word) => sanitized.includes(word));
            const isDuplicate = displayedNewsKeys.has(newsItem.id);
            const isMultiSymbol = newsItem.symbols.length > 1;

            // Skip blocked, duplicate, or multi-symbol
            if (isBlocked || isDuplicate || isMultiSymbol) return;

            // If showing only tracked tickers
            if (window.settings.news?.showTrackedTickers) {
                const symbol = newsItem.symbols?.[0]?.toUpperCase();
                if (!symbol || !trackedTickers.includes(symbol)) return;
            }

            const type = getSentimentClass(newsItem.headline);
            let truncated = newsItem.headline;
            if (truncated.length > 240) truncated = truncated.slice(0, 239).trimEnd() + "…";

            const syms = Array.isArray(newsItem.symbols) ? newsItem.symbols : [];
            queueNewsItem(truncated, newsItem.id, type, syms);
        });
    } catch (error) {
        console.error("❌ Failed to fetch news:", error);
    }
}

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

    // symbols badges
    if (Array.isArray(symbols) && symbols.length) {
        const symWrap = document.createElement("span");
        symWrap.className = "symbols";
        for (const s of symbols) {
            const sym = String(s).toUpperCase();
            if (!sym) continue;
            const badge = document.createElement("span");
            badge.className = `badge ${hueClass(assignHue(sym))}`;
            badge.textContent = sym;
            symWrap.appendChild(badge);
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

    const icon = type === "bullish" ? "😺" : type === "bearish" ? "🙀" : "😼";
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

function assignHue(symbol) {
    if (!symbol) return 210;
    const key = String(symbol).trim().toUpperCase();
    let sum = 0;
    for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
    return (sum * 37) % 360;
}
function hueClass(h) {
    const n = ((Number(h) % 360) + 360) % 360;
    const bucket = (Math.round(n / 30) * 30) % 360; // 0,30,...330
    return `badge-h${bucket}`;
}

// Show regular ticker
initTicker(".bonus-list", bonusItems);
