function openTab(evt, tabId) {
    // Hide all tab contents
    document.querySelectorAll(".tabcontent").forEach((tab) => {
        tab.style.display = "none";
        tab.classList.remove("active");
    });

    // Remove active class from all tab buttons
    document.querySelectorAll(".tablinks").forEach((tabLink) => {
        tabLink.classList.remove("active");
    });

    // Show the selected tab
    document.getElementById(tabId).style.display = "block";
    document.getElementById(tabId).classList.add("active");
    if (evt) evt.currentTarget.classList.add("active"); // Ensure evt exists
}

const HARDCODED_ATTRIBUTES = {
    session: {
        Price: true,
        ChangePercent: false,
        FiveM: false,
        Float: true,
        Volume: true,
        SprPercent: false,
        Time: false,
        HighOfDay: false,
        News: false,
        Count: true,
        Score: true,
        Bonuses: true,
    },
    daily: {
        Price: false,
        ChangePercent: false,
        FiveM: false,
        Float: false,
        Volume: false,
        SprPercent: false,
        Time: false,
        HighOfDay: false,
        News: false,
        Count: false,
        Score: true,
        Bonuses: true,
    },
};

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ DOMContentLoaded event fired!");

    try {
        console.log("Fetching settings...");
        window.settings = await window.settingsAPI.get(); // ✅ Store settings globally
        console.log("Retrieved settings:", window.settings);

        initializeGeneralSection();
        initializeTopSection();
        initializeNewsSection();

        await loadAttributeFilters("session", "session-filters");
        await loadAttributeFilters("daily", "daily-filters");

        // ✅ Update toggle buttons to pass settings
        document.querySelector("#session-toggle-all").addEventListener("click", () => {
            toggleAll("session", true);
        });

        document.querySelector("#session-toggle-none").addEventListener("click", () => {
            toggleAll("session", false);
        });

        document.querySelector("#daily-toggle-all").addEventListener("click", () => {
            toggleAll("daily", true);
        });

        document.querySelector("#daily-toggle-none").addEventListener("click", () => {
            toggleAll("daily", false);
        });

        window.settingsAPI.onUpdate((updatedSettings) => {
            console.log("Settings Syncing", updatedSettings);
        });

        window.settingsAPI.onAttributesUpdate(async () => {
            console.log("🔔 New attributes detected! Refreshing settings...");
            await loadAttributeFilters("session", "session-filters");
            await loadAttributeFilters("daily", "daily-filters");
        });

        const defaultTab = document.querySelector(".tablinks.active");
        if (defaultTab) {
            openTab(null, defaultTab.getAttribute("onclick").match(/'(\w+)'/)[1]);
        } else {
            const firstTab = document.querySelector(".tablinks");
            if (firstTab) openTab(null, firstTab.getAttribute("onclick").match(/'(\w+)'/)[1]);
        }
    } catch (error) {
        console.error("Initialization error:", error);
    }
});

function initializeGeneralSection() {
    console.log("Initializing General Section");
}

function initializeTopSection() {
    if (!window.settings || !window.settings.top) {
        console.error("`settings.top` is missing! Skipping initialization.");
        return;
    }

    console.log("🔍 Checking loaded settings:", window.settings.top);

    const minPriceInput = document.getElementById("min-price");
    const maxPriceInput = document.getElementById("max-price");
    const minVolumeInput = document.getElementById("min-volume");
    const maxVolumeInput = document.getElementById("max-volume");
    const minFloatInput = document.getElementById("min-float");
    const maxFloatInput = document.getElementById("max-float");
    const minScoreInput = document.getElementById("min-score");
    const maxScoreInput = document.getElementById("max-score");
    const topTransparentToggle = document.getElementById("top-transparent-toggle");
    const sessionLengthInput = document.getElementById("session-length");
    const dailyLengthInput = document.getElementById("daily-length");

    if (
        !minPriceInput ||
        !maxPriceInput ||
        !minFloatInput ||
        !maxFloatInput ||
        !minScoreInput ||
        !maxScoreInput ||
        !minVolumeInput ||
        !maxVolumeInput ||
        !topTransparentToggle ||
        !sessionLengthInput ||
        !dailyLengthInput
    ) {
        console.error("One or more input elements not found!");
        return;
    }

    // ✅ Set placeholder to reflect "No limit" if 0 is set
    minPriceInput.placeholder = minPriceInput.value === "0" ? "No limit" : "";
    maxPriceInput.placeholder = maxPriceInput.value === "0" ? "No limit" : "";
    minFloatInput.placeholder = minFloatInput.value === "0" ? "No limit" : "";
    maxFloatInput.placeholder = maxFloatInput.value === "0" ? "No limit" : "";
    minScoreInput.placeholder = minScoreInput.value === "0" ? "No limit" : "";
    maxScoreInput.placeholder = maxScoreInput.value === "0" ? "No limit" : "";
    minVolumeInput.placeholder = minVolumeInput.value === "0" ? "No limit" : "";
    maxVolumeInput.placeholder = maxVolumeInput.value === "0" ? "No limit" : "";

    // ✅ Load saved values from `settings.top`
    if (window.settings.top.minPrice !== undefined) minPriceInput.value = window.settings.top.minPrice;
    if (window.settings.top.maxPrice !== undefined) maxPriceInput.value = window.settings.top.maxPrice;

    if (window.settings.top.minFloat !== undefined) minFloatInput.value = window.settings.top.minFloat;
    if (window.settings.top.maxFloat !== undefined) maxFloatInput.value = window.settings.top.maxFloat;

    if (window.settings.top.minScore !== undefined) minScoreInput.value = window.settings.top.minScore;
    if (window.settings.top.maxScore !== undefined) maxScoreInput.value = window.settings.top.maxScore;

    if (window.settings.top.minVolume !== undefined) minVolumeInput.value = window.settings.top.minVolume;
    if (window.settings.top.maxVolume !== undefined) maxVolumeInput.value = window.settings.top.maxVolume;

    if (window.settings.top.transparent !== undefined) topTransparentToggle.checked = window.settings.top.transparent;

    // ✅ Load saved length settings
    sessionLengthInput.value = window.settings.top.lists?.session?.length ?? 10;
    dailyLengthInput.value = window.settings.top.lists?.daily?.length ?? 10;

    console.log("✅ Applied topSettings:", {
        minPrice: minPriceInput.value,
        maxPrice: maxPriceInput.value,
        minVolume: minVolumeInput.value,
        maxVolume: maxVolumeInput.value,
        minFloat: minFloatInput.value,
        maxFloat: maxFloatInput.value,
        minScore: minScoreInput.value,
        maxScore: maxScoreInput.value,
        transparent: topTransparentToggle.checked,
        sessionLength: sessionLengthInput.value,
        dailyLength: dailyLengthInput.value,
    });

    function updatePriceFilter() {
        let newMinPrice = parseFloat(minPriceInput.value) || 0;
        let newMaxPrice = parseFloat(maxPriceInput.value) || 0;

        // ✅ Preserve existing float and score filters
        let currentMinFloat = parseFloat(minFloatInput.value) || 0;
        let currentMaxFloat = parseFloat(maxFloatInput.value) || 0;
        let currentMinScore = parseFloat(minScoreInput.value) || 0;
        let currentMaxScore = parseFloat(maxScoreInput.value) || 0;
        let currentMinVolume = parseFloat(minVolumeInput.value) || 0;
        let currentMaxVolume = parseFloat(maxVolumeInput.value) || 0;

        const updatedSettings = {
            ...window.settings.top,
            minPrice: newMinPrice,
            maxPrice: newMaxPrice,
            minFloat: currentMinFloat,
            maxFloat: currentMaxFloat,
            minScore: currentMinScore,
            maxScore: currentMaxScore,
            minVolume: currentMinVolume,
            maxVolume: currentMaxVolume,
        };

        console.log("Updated price filter with preserved float and score settings:", updatedSettings);
        applyAllFilters(updatedSettings);
    }

    function updateVolumeFilter() {
        let newMinVolume = parseFloat(minVolumeInput.value) || 0;
        let newMaxVolume = parseFloat(maxVolumeInput.value) || 0;

        // ✅ Preserve existing price and score filters
        let currentMinPrice = parseFloat(minPriceInput.value) || 0;
        let currentMaxPrice = parseFloat(maxPriceInput.value) || 0;
        let currentMinScore = parseFloat(minScoreInput.value) || 0;
        let currentMaxScore = parseFloat(maxScoreInput.value) || 0;
        let currentMinFloat = parseFloat(minFloatInput.value) || 0;
        let currentMaxFloat = parseFloat(maxFloatInput.value) || 0;

        const updatedSettings = {
            ...window.settings.top,
            minVolume: newMinVolume,
            maxVolume: newMaxVolume,
            minPrice: currentMinPrice,
            maxPrice: currentMaxPrice,
            minScore: currentMinScore,
            maxScore: currentMaxScore,
            minFloat: currentMinFloat,
            maxFloat: currentMaxFloat,
        };

        console.log("Updated float filter with preserved price and score settings:", updatedSettings);
        applyAllFilters(updatedSettings);
    }

    function updateFloatFilter() {
        let newMinFloat = parseFloat(minFloatInput.value) || 0;
        let newMaxFloat = parseFloat(maxFloatInput.value) || 0;

        // ✅ Preserve existing price and score filters
        let currentMinPrice = parseFloat(minPriceInput.value) || 0;
        let currentMaxPrice = parseFloat(maxPriceInput.value) || 0;
        let currentMinScore = parseFloat(minScoreInput.value) || 0;
        let currentMaxScore = parseFloat(maxScoreInput.value) || 0;
        let currentMinVolume = parseFloat(minVolumeInput.value) || 0;
        let currentMaxVolume = parseFloat(maxVolumeInput.value) || 0;

        const updatedSettings = {
            ...window.settings.top,
            minFloat: newMinFloat,
            maxFloat: newMaxFloat,
            minPrice: currentMinPrice,
            maxPrice: currentMaxPrice,
            minScore: currentMinScore,
            maxScore: currentMaxScore,
            minVolume: currentMinVolume,
            maxVolume: currentMaxVolume,
        };

        console.log("Updated float filter with preserved price and score settings:", updatedSettings);
        applyAllFilters(updatedSettings);
    }

    function updateScoreFilter() {
        let newMinScore = parseFloat(minScoreInput.value) || 0;
        let newMaxScore = parseFloat(maxScoreInput.value) || 0;

        // ✅ Preserve existing price and float filters
        let currentMinPrice = parseFloat(minPriceInput.value) || 0;
        let currentMaxPrice = parseFloat(maxPriceInput.value) || 0;
        let currentMinFloat = parseFloat(minFloatInput.value) || 0;
        let currentMaxFloat = parseFloat(maxFloatInput.value) || 0;
        let currentMinVolume = parseFloat(minVolumeInput.value) || 0;
        let currentMaxVolume = parseFloat(maxVolumeInput.value) || 0;

        const updatedSettings = {
            ...window.settings.top,
            minScore: newMinScore,
            maxScore: newMaxScore,
            minPrice: currentMinPrice,
            maxPrice: currentMaxPrice,
            minFloat: currentMinFloat,
            maxFloat: currentMaxFloat,
            minVolume: currentMinVolume,
            maxVolume: currentMaxVolume,
        };

        console.log("Updated score filter with preserved price and float settings:", updatedSettings);
        applyAllFilters(updatedSettings);
    }

    function updateTransparency() {
        const updatedSettings = {
            ...window.settings.top,
            transparent: topTransparentToggle.checked,
        };

        console.log("Updated transparency setting:", updatedSettings);
        window.settingsAPI.update({ top: updatedSettings });
        window.topAPI.refresh(); // ✅ Refresh top window UI
    }

    async function updateListLength(type, input) {
        const newLength = parseInt(input.value, 10) || 10;

        try {
            // 🔄 Get latest settings before making changes
            const latestSettings = await window.settingsAPI.get();

            if (!latestSettings || !latestSettings.top) {
                console.error("❌ Latest settings not found! Skipping update.");
                return;
            }

            // ✅ Preserve all previous attributes while updating length
            const updatedSettings = {
                ...latestSettings.top,
                lists: {
                    ...latestSettings.top.lists,
                    [type]: {
                        ...latestSettings.top.lists?.[type], // Preserve existing checkboxes
                        length: newLength, // Only update length
                    },
                },
            };

            console.log(`✅ Updated ${type} list length:`, newLength);

            // ✅ Save updated settings & apply filters
            await window.settingsAPI.update({ top: updatedSettings });
            applyAllFilters(updatedSettings);
        } catch (error) {
            console.error("❌ Error updating list length:", error);
        }
    }

    minPriceInput.addEventListener("input", updatePriceFilter);
    maxPriceInput.addEventListener("input", updatePriceFilter);
    minVolumeInput.addEventListener("input", updateVolumeFilter);
    maxVolumeInput.addEventListener("input", updateVolumeFilter);
    minFloatInput.addEventListener("input", updateFloatFilter);
    maxFloatInput.addEventListener("input", updateFloatFilter);
    minScoreInput.addEventListener("input", updateScoreFilter);
    maxScoreInput.addEventListener("input", updateScoreFilter);

    topTransparentToggle.addEventListener("change", updateTransparency);
    sessionLengthInput.addEventListener("input", () => updateListLength("session", sessionLengthInput));
    dailyLengthInput.addEventListener("input", () => updateListLength("daily", dailyLengthInput));

    console.log("✅ Applied topSettings:", {
        minPrice: minPriceInput.value,
        maxPrice: maxPriceInput.value,
        minVolume: minVolumeInput.value,
        maxVolume: maxVolumeInput.value,
        minFloat: minFloatInput.value,
        maxFloat: maxFloatInput.value,
        minScore: minScoreInput.value,
        maxScore: maxScoreInput.value,
        transparent: topTransparentToggle.checked,
        sessionLength: sessionLengthInput.value,
        dailyLength: dailyLengthInput.value,
    });
}

async function loadAttributeFilters(listType, containerId) {
    try {
        console.log(`📥 Loading attributes for ${listType}...`);
        console.log("HARDCODED_ATTRIBUTES:", HARDCODED_ATTRIBUTES);
        console.log("window.settings.top.lists:", window.settings.top.lists);

        const attributes = Object.keys(HARDCODED_ATTRIBUTES[listType]);
        const container = document.getElementById(containerId);

        if (!container) {
            console.error(`❌ Container ${containerId} not found!`);
            return;
        }

        container.innerHTML = ""; // Clear previous checkboxes

        const selectedFilters = HARDCODED_ATTRIBUTES[listType]; // Use hardcoded attributes

        attributes.forEach((attr) => {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.name = listType;
            checkbox.value = attr;
            checkbox.checked = selectedFilters[attr];

            checkbox.addEventListener("change", () => {
                updateFilters(window.settings); // Update filters as usual
            });

            label.appendChild(checkbox);
            label.append(` ${attr}`);
            container.appendChild(label);
        });

        console.log(`✅ Hardcoded attributes loaded for ${listType}!`);
    } catch (error) {
        console.error(`❌ Error loading ${listType} attributes:`, error);
    }
}

async function updateFilters() {
    if (!window.settings || !window.settings.top) {
        console.error("❌ `settings.top` is missing! Skipping update.");
        return;
    }

    try {
        // 🔄 Fetch latest settings to ensure we don’t overwrite existing values
        const latestSettings = await window.settingsAPI.get();
        if (!latestSettings || !latestSettings.top) {
            console.error("❌ Latest settings not found! Skipping update.");
            return;
        }

        // ✅ Preserve previous attributes and merge with updates
        const updatedSettings = {
            ...latestSettings,  // Preserve top-level settings
            top: {
                ...latestSettings.top,  // Preserve all existing top settings
                lists: {
                    session: {
                        ...latestSettings.top.lists?.session, // Keep session settings
                        length: latestSettings.top.lists?.session?.length ?? 10
                    },
                    daily: {
                        ...latestSettings.top.lists?.daily, // Keep daily settings
                        length: latestSettings.top.lists?.daily?.length ?? 10
                    }
                }
            },
            news: {
                ...latestSettings.news, // Keep news settings
                blockList: [...(latestSettings.news?.blockList || [])], // Ensure lists persist
                goodList: [...(latestSettings.news?.goodList || [])],
                badList: [...(latestSettings.news?.badList || [])],
            }
        };

        // ✅ Capture new attribute selections without wiping lengths
        document.querySelectorAll("input[name='session']").forEach((checkbox) => {
            updatedSettings.top.lists.session[checkbox.value] = checkbox.checked;
        });

        document.querySelectorAll("input[name='daily']").forEach((checkbox) => {
            updatedSettings.top.lists.daily[checkbox.value] = checkbox.checked;
        });

        console.log("💾 Saving updated filters (attributes + length preserved):", updatedSettings);

        // ✅ Save settings and apply changes
        await window.settingsAPI.update(updatedSettings);
        applyAllFilters(updatedSettings.top);
    } catch (error) {
        console.error("Error updating filters:", error);
    }
}


function applyAllFilters(updatedTopSettings) {
    console.log("Applying filters");

    // ✅ Ensure all filters persist
    updatedTopSettings.minPrice = updatedTopSettings.minPrice ?? window.settings.top.minPrice;
    updatedTopSettings.maxPrice = updatedTopSettings.maxPrice ?? window.settings.top.maxPrice;
    updatedTopSettings.minFloat = updatedTopSettings.minFloat ?? window.settings.top.minFloat;
    updatedTopSettings.maxFloat = updatedTopSettings.maxFloat ?? window.settings.top.maxFloat;
    updatedTopSettings.minScore = updatedTopSettings.minScore ?? window.settings.top.minScore;
    updatedTopSettings.maxScore = updatedTopSettings.maxScore ?? window.settings.top.maxScore;
    updatedTopSettings.minVolume = updatedTopSettings.minVolume ?? window.settings.top.minVolume;
    updatedTopSettings.maxVolume = updatedTopSettings.maxVolume ?? window.settings.top.maxVolume;

    // ✅ Update settings in UI
    window.settingsAPI.update({ top: updatedTopSettings });

    if (window.topAPI.applyFilters) {
        window.topAPI.applyFilters(updatedTopSettings); // ✅ Send everything
    } else {
        console.warn("⚠️ window.topAPI.applyFilters is not defined!");
    }
}

function toggleAll(listType, state) {
    if (!window.settings || !window.settings.top) {
        console.error("❌ `settings.top` is missing! Skipping toggle.");
        return;
    }

    document.querySelectorAll(`input[name='${listType}']`).forEach((checkbox) => {
        checkbox.checked = state;
    });

    updateFilters(window.settings); // ✅ Pass the updated settings object
}

/**
 * ✅ Initialize the News Section with BlockList, GoodList, and BadList
 */
function initializeNewsSection() {
    if (!window.settings.news) {
        console.warn("⚠️ `window.settings.news` was missing, initializing default values.");
        window.settings.news = { blockList: [], goodList: [], badList: [], allowMultiSymbols: true };
    } else {
        // ✅ Ensure each list exists before using it
        window.settings.news.blockList = window.settings.news.blockList || [];
        window.settings.news.goodList = window.settings.news.goodList || [];
        window.settings.news.badList = window.settings.news.badList || [];
    }

    console.log("🔍 Checking loaded news settings:", window.settings.news);

    console.log("🔍 Checking loaded news settings:", window.settings.news);

    const showTrackedTickersToggle = document.getElementById("show-tracked-tickers");
    const allowMultiSymbolsToggle = document.getElementById("allow-multi-symbols");

    if (!showTrackedTickersToggle || !allowMultiSymbolsToggle) {
        console.error("❌ 'Show Only Tracked Tickers' or 'Allow Multi-Symbol Headlines' toggle not found!");
        return;
    }

    // ✅ Load saved settings
    showTrackedTickersToggle.checked = window.settings.news.showTrackedTickers ?? false;
    allowMultiSymbolsToggle.checked = window.settings.news.allowMultiSymbols ?? true;

    // ✅ Save setting on toggle
    showTrackedTickersToggle.addEventListener("change", async () => {
        window.settings.news.showTrackedTickers = showTrackedTickersToggle.checked;
        await saveSettings();
        console.log("✅ Updated 'Show Only Tracked Tickers' setting:", showTrackedTickersToggle.checked);
    });

    allowMultiSymbolsToggle.addEventListener("change", async () => {
        window.settings.news.allowMultiSymbols = allowMultiSymbolsToggle.checked;
        await saveSettings();
        console.log("✅ Updated 'Allow Multi-Symbol Headlines' setting:", allowMultiSymbolsToggle.checked);
    });

    // ✅ Initialize keyword management
    setupKeywordManagement();
}

/**
 * ✅ Handles adding and removing keywords for BlockList, GoodList, and BadList
 */
function setupKeywordManagement() {
    const keywordType = document.getElementById("keyword-type");
    const keywordInput = document.getElementById("keyword-input");
    const addKeywordBtn = document.getElementById("add-keyword");

    const blockListEl = document.getElementById("block-list");
    const goodListEl = document.getElementById("good-list");
    const badListEl = document.getElementById("bad-list");

    function updateLists() {
        renderList(blockListEl, window.settings.news.blockList);
        renderList(goodListEl, window.settings.news.goodList);
        renderList(badListEl, window.settings.news.badList);
    }

    function renderList(element, items) {
        if (!Array.isArray(items)) {
            console.error(`❌ Expected an array but got:`, items);
            items = []; // Fallback to an empty array
        }
    
        element.innerHTML = "";
        items.forEach((keyword, index) => {
            const li = document.createElement("li");
            li.textContent = keyword;
    
            // ✅ Remove button for each keyword
            const removeBtn = document.createElement("button");
            removeBtn.textContent = "X";
            removeBtn.addEventListener("click", async () => {
                items.splice(index, 1);
                await saveSettings();
                updateLists();
            });
    
            li.appendChild(removeBtn);
            element.appendChild(li);
        });
    }
    

    // ✅ Add new keyword to the selected list
    addKeywordBtn.addEventListener("click", async () => {
        const keyword = keywordInput.value.trim();
        if (!keyword) return;

        const listType = keywordType.value;

        if (!window.settings.news[listType].includes(keyword)) {
            window.settings.news[listType].push(keyword);
            await saveSettings();
            updateLists();
        }

        keywordInput.value = ""; // Clear input field
    });

    // ✅ Initialize UI with existing data
    updateLists();
}

/**
 * ✅ Saves updated settings globally
 */
async function saveSettings(updatedSettings = {}) {
    try {
        // 🔄 Fetch the latest settings first to prevent overwriting
        const latestSettings = await window.settingsAPI.get();
        if (!latestSettings) {
            console.error("❌ Error fetching latest settings, using defaults.");
            latestSettings = { ...DEFAULT_SETTINGS };
        }

        // ✅ Merge the updated settings while preserving existing values
        const mergedSettings = {
            ...latestSettings, // Preserve everything
            top: {
                ...latestSettings.top, // Preserve top filters
                ...updatedSettings.top, // Apply top updates if any
                lists: {
                    session: {
                        ...latestSettings.top?.lists?.session,
                        ...updatedSettings.top?.lists?.session,
                    },
                    daily: {
                        ...latestSettings.top?.lists?.daily,
                        ...updatedSettings.top?.lists?.daily,
                    }
                }
            },
            news: {
                ...latestSettings.news, // Preserve news filters
                ...updatedSettings.news, // Apply news updates if any
                blockList: [...(updatedSettings.news?.blockList || latestSettings.news?.blockList || [])],
                goodList: [...(updatedSettings.news?.goodList || latestSettings.news?.goodList || [])],
                badList: [...(updatedSettings.news?.badList || latestSettings.news?.badList || [])]
            }
        };

        console.log("💾 Merged settings before saving:", mergedSettings);
        await window.settingsAPI.update(mergedSettings);
    } catch (error) {
        console.error("❌ Error saving settings:", error);
    }
}

