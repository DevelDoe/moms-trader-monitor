
let allNews = [];
let flashedNewsKeys = new Set(); // Track flashed news
let lastJFlashTime = 0;
let clickedNews = new Set(); // Track clicked news items
let newsQueue = []; // Queue for incoming news
let visibleNews = []; // Currently visible news items
let displayedNewsKeys = new Set(); // Track displayed news keys
let blockList = []; // Blocklist from settings
let bullishList = []; // Bullish keywords from settings
let bearishList = []; // Bearish keywords from settings

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Page Loaded. Initializing...");

    // Load settings and fetch initial news
    await loadSettings();
    await fetchNews(); // No need to fetch tickers anymore

    // Handle settings updates
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🔄 Settings changed. Updating UI...");
        window.settings = structuredClone(updatedSettings); // ✅ Read-only copy
        updateNewsList(); // Refresh the UI with existing news data
    });

    // Handle news updates
    window.newsAPI.onUpdate(() => {
        console.log("🔄 Received news update. Fetching fresh news...");
        fetchNews(); // Refresh news on update
    });
});

function playFlash() {
    const now = Date.now();
    const gap = 3000;
    if (now - lastJFlashTime < gap) {
        console.log("Jingle call debounced.");
        return;
    }
    lastJFlashTime = now;

    // Create a new Audio object and set the source to your custom sound file
    const audio = new Audio("./flash.wav");

    audio
        .play()
        .then(() => {
            console.log("Sound played successfully.");
        })
        .catch((error) => {
            console.error("Error playing sound:", error);
        });
}

function decodeHTMLEntities(text) {
    const parser = new DOMParser();
    const decodedString = parser.parseFromString(text, "text/html").body.textContent;
    return decodedString || text;
}


async function loadSettings() {
    try {
        console.log("📢 Fetching settings...");
        window.settings = await window.settingsAPI.get();

        blockList = window.settings.news?.blockList || [];
        bullishList = window.settings.news?.bullishList || [];
        bearishList = window.settings.news?.bearishList || [];

        console.log("✅ Loaded settings:", window.settings);

        updateNewsList(); // Ensure the UI is updated with the new settings
    } catch (error) {
        console.error("⚠️ Error loading settings:", error);
        blockList = [];
        bullishList = [];
        bearishList = [];
        updateNewsList(); // Ensure the UI is updated even if settings load fails
    }
}

// Handle news updates
async function fetchNews() {
    try {
        console.log("📢 Fetching news...");

        const newsData = await window.newsAPI.get();
        if (!Array.isArray(newsData)) {
            console.error("⚠️ Expected an array but got:", newsData);
            return;
        }

        // Process the incoming news data
        allNews = newsData;

        // Apply filtering based on blocklist and allowMultiSymbols
        let filteredNews = allNews.filter(newsItem => {
            const sanitizedHeadline = newsItem.headline.toLowerCase().trim();
            const isBlocked = blockList.some(blockedWord => sanitizedHeadline.includes(blockedWord.toLowerCase()));

            if (isBlocked) {
                console.log(`Blocked news: ${newsItem.headline}`);
                return false;
            }

            // Allow multi-symbol filter
            return newsItem.symbols.length <= 1; // Only allow items with 1 symbol
        });

        console.log("Filtered News Length:", filteredNews.length);

        // Add filtered items to the news queue
        filteredNews.forEach(newsItem => {
            if (!displayedNewsKeys.has(newsItem.id) && !newsQueue.some(item => item.id === newsItem.id)) {
                newsQueue.push(newsItem);
            }
        });

        // Update visibleNews array, respecting the maxEntries limit
        updateVisibleNews();

        // Render the updated news list
        updateNewsList();
    } catch (error) {
        console.error("⚠️ Error fetching news:", error);
    }
}

// Render the visible news
function updateNewsList() {
    console.log("📢 Rendering news list...");

    const listContainer = document.getElementById("news-list");
    listContainer.innerHTML = "";  // Clear previous content

    // Check if the list is empty or not, if not empty, render items
    if (visibleNews.length === 0) {
        console.log("No visible news to render.");
    }

    visibleNews.forEach(article => {
        const headline = decodeHTMLEntities(article.headline || "");
        const li = document.createElement("li");
        li.className = "no-drag flashing";  // Add flashing class for new items

        const symbolText = article.symbols ? article.symbols.join(", ") : "N/A";
        li.textContent = symbolText;
        li.title = `${headline}`;

        // Apply sentiment (Bullish, Bearish, or Neutral)
        const sentimentClass = getSentimentClass(article.headline);
        li.classList.add(sentimentClass);

        // Stop flashing on click
        li.addEventListener("click", () => handleNewsClick(article, li));

        // Append the list item if it's not hidden
        listContainer.appendChild(li);
    });

    console.log("✅ News list updated!");
}

// Determine sentiment (Bullish, Bearish, or Neutral)
function getSentimentClass(headline) {
    const sanitizedHeadline = headline.toLowerCase().trim();
    const hasBullish = bullishList.some(word => sanitizedHeadline.includes(word.toLowerCase()));
    const hasBearish = bearishList.some(word => sanitizedHeadline.includes(word.toLowerCase()));

    if (hasBullish && !hasBearish) return "bullish-news";
    if (hasBearish && !hasBullish) return "bearish-news";
    return "neutral-news";  // Default to neutral if neither
}

// Handle news item click (stop flashing, update clickedNews, shift next item)
function handleNewsClick(article, li) {
    li.classList.remove("flashing");  // Stop flashing on click
    li.style.animation = "none";  // Stop animation

    // Remember clicked news item
    clickedNews.add(article.id);

    // Release the current item and move the next one from the queue into visibleNews
    stopFlashingAndReleaseItem(article, li);
}

// Stop flashing and release the clicked news item
function stopFlashingAndReleaseItem(article, li) {
    // Remove the clicked item from the visible news list
    visibleNews = visibleNews.filter(item => item.id !== article.id);

    // Check if there are more items in the queue
    if (newsQueue.length === 0) {
        console.log("No more items in the queue.");
        return; // If no more items in the queue, do nothing
    }

    // If there are more items in the queue, move the next item to visibleNews
    const nextItem = newsQueue.shift();
    visibleNews.push(nextItem);
    displayedNewsKeys.add(nextItem.id);  // Mark as displayed

    updateNewsList();  // Re-render the list with the new item
    console.log(`Item released: ${article.headline}`);
}

// Update visibleNews based on the newsQueue and maxEntries
function updateVisibleNews() {
    const maxEntries = 4;  // Example: you can adjust the number as needed
    while (visibleNews.length < maxEntries && newsQueue.length > 0) {
        const nextItem = newsQueue.shift(); // Move item from queue to visible
        visibleNews.push(nextItem);
        displayedNewsKeys.add(nextItem.id); // Mark as displayed
    }

    // If newsQueue is empty, log it
    if (newsQueue.length === 0) {
        console.log("News queue is now empty.");
    }
}