let allNews = [];
let trackedTickers = new Set();
let flashedNewsKeys = new Set();
let lastJFlashTime = 0;

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Page Loaded. Initializing...");

    // Load settings and fetch initial tickers and news
    await loadSettings();
    await fetchTrackedTickers();
    await fetchNews();

    // Handle settings updates
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🔄 Settings changed. Updating UI...");
        
        // Update local reference to settings
        window.settings = structuredClone(updatedSettings); // ✅ Read-only copy
    
        // Update tracked tickers and refresh the UI
        await fetchTrackedTickers();
        updateNewsList(); // Refresh the UI with existing news data
    });

    // Handle news updates
    window.newsAPI.onUpdate(() => {
        console.log("🔄 Received news update. Fetching fresh news...");
        fetchNews();
    });

    // Handle ticker updates
    window.dailyAPI.onTickerUpdate(() => {
        console.log("🔄 Ticker update received. Fetching fresh tickers...");
        fetchTrackedTickers();
    });
});

async function loadSettings() {
    try {
        console.log("📢 Fetching settings...");
        window.settings = await window.settingsAPI.get();

        if (!window.settings.news) {
            console.log("⚠️ `settings.news` is missing, initializing...");
            window.settings.news = {};
        }

        console.log("✅ Loaded settings:", window.settings);
    } catch (error) {
        console.error("⚠️ Error loading settings:", error);
        window.settings = { news: {} }; // Fallback
    }
}

async function fetchTrackedTickers() {
    try {
        console.log("📢 Fetching filtered tickers from settings...");

        const settings = await window.settingsAPI.get();
        if (!settings.news?.filteredTickers) {
            console.warn("⚠️ No filtered tickers found in settings! Using empty set.");
            trackedTickers = new Set(); // Instead of modifying settings, just use an empty set
        } else {
            trackedTickers = new Set(settings.news.filteredTickers);
        }

        console.log("✅ Tracked Tickers (Filtered):", trackedTickers);

        // Refresh the UI with the latest filters
        updateNewsList();
    } catch (error) {
        console.error("⚠️ Error fetching filtered tickers:", error);
    }
}

async function fetchNews() {
    try {
        console.log("📢 Fetching news...");

        const newsData = await window.newsAPI.get();
        console.log("📰 Received news:", newsData);

        if (!Array.isArray(newsData)) {
            console.error("⚠️ Expected an array but got:", newsData);
            return;
        }

        allNews = newsData; // Refresh the `allNews` array with the latest news
        updateNewsList(); // Update news list after fetching new news
    } catch (error) {
        console.error("⚠️ Error fetching news:", error);
        const listContainer = document.getElementById("news-list");
        listContainer.innerHTML = `<li class='info draggable'>Error fetching news: ${error.message}</li>`;
    }
}

function updateNewsList() {
    console.log("📢 Updating news list...");

    const showOnlyTracked = window.settings.news.showTrackedTickers ?? false;
    const allowMultiSymbols = window.settings.news.allowMultiSymbols ?? true;
    const maxEntries = 6;
    const listContainer = document.getElementById("news-list");
    listContainer.innerHTML = ""; // Clear previous news

    // ✅ Get the latest blocklist from settings and sanitize it
    const blockList = window.settings.news?.blockList || [];
    const sanitizedBlockList = blockList.map(item => item.toLowerCase().trim()); // Sanitize blocklist items
    const bullishList = window.settings.news?.bullishList || [];
    const bearishList = window.settings.news?.bearishList || [];

    let filteredNews = allNews; // Always use fresh `allNews`

    if (showOnlyTracked) {
        // ✅ Only filter if `showTrackedTickers` is true
        filteredNews = filteredNews.filter((newsItem) => 
            newsItem.symbols && newsItem.symbols.every((symbol) => trackedTickers.has(symbol.toUpperCase()))
        );
    } 

    if (!allowMultiSymbols) {
        filteredNews = filteredNews.filter((newsItem) => newsItem.symbols.length <= 1);
    }

    console.log("📊 Filtered News:", filteredNews);

    if (filteredNews.length === 0) {
        listContainer.innerHTML = "<li class='info draggable'>no news</li>";
        return;
    }

    const uniqueNews = new Map();
    filteredNews.forEach((newsItem) => {
        const key = `${newsItem.symbols?.join(",") || "N/A"}|${newsItem.headline}`;
        if (!uniqueNews.has(key)) {
            uniqueNews.set(key, newsItem);
        }
    });

    const sortedNews = Array.from(uniqueNews.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const slicedNews = sortedNews.slice(0, maxEntries);

    const topNewsItem = slicedNews[0];
    if (topNewsItem) {
        const topKey = `${topNewsItem.symbols?.join(",") || "N/A"}|${topNewsItem.headline}`;
        if (!flashedNewsKeys.has(topKey)) {
            playFlash();
            flashedNewsKeys.add(topKey);
        }
    }

    const now = new Date();
    slicedNews.forEach((article) => {
        const headline = decodeHTMLEntities(article.headline || "");
        const li = document.createElement("li");
        li.className = "no-drag";

        const symbolText = article.symbols ? article.symbols.join(", ") : "N/A";
        li.textContent = symbolText;
        li.title = `${headline}`;

        // Compare against blockList using sanitized version (lowercase)
        const sanitizedHeadline = headline.toLowerCase().trim();
        let blocked = false;

        // Log each blocklist item and its comparison
        sanitizedBlockList.forEach((blockedWord) => {
            if (sanitizedHeadline.includes(blockedWord)) {
                console.log(`Blocked keyword found: "${blockedWord}" in headline: "${headline}"`);
                blocked = true;
            }
        });

        if (blocked) {
            // Instead of adding "blocked-news", hide the item
            li.style.display = "none"; // Hide blocked news
        }

        // Additional checks for bullish and bearish words
        if (bullishList.some((goodWord) => sanitizedHeadline.includes(goodWord.toLowerCase()))) {
            li.classList.add("bullish-news");
        }
        if (bearishList.some((badWord) => sanitizedHeadline.includes(badWord.toLowerCase()))) {
            li.classList.add("bearish-news");
        }

        const newsAge = (now - new Date(article.created_at)) / 1000;
        if (newsAge >= 300) {
            li.classList.add("fade-out");
        }

        // Only append the li if it's not hidden
        if (li.style.display !== "none") {
            listContainer.appendChild(li);
        }
    });

    console.log("✅ News list updated!");
}

function playFlash() {
    const now = Date.now();
    const gap = 1000;
    if (now - lastJFlashTime < gap) {
        console.log("Jingle call debounced.");
        return;
    }
    lastJFlashTime = now;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const startTime = audioCtx.currentTime;

    const frequencies = [400, 400, 700, 700];
    const beepDuration = 0.15;
    const gapTime = 0.005;

    frequencies.forEach((freq, i) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.frequency.value = freq;
        oscillator.type = "square";

        const toneStart = startTime + i * (beepDuration + gapTime);
        oscillator.start(toneStart);
        oscillator.stop(toneStart + beepDuration);

        gainNode.gain.setValueAtTime(1, toneStart);
        gainNode.gain.exponentialRampToValueAtTime(0.001, toneStart + beepDuration);
    });
}

function decodeHTMLEntities(text) {
    const parser = new DOMParser();
    const decodedString = parser.parseFromString(text, "text/html").body.textContent;
    return decodedString || text;
}