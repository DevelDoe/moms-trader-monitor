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
    live: {
        Price: false,
        alertChangePercent: false,
        cumulativeUpChange: false,
        cumulativeDownChange: false,
        fiveMinVolume: false,
        Score: false,
        Bonuses: false,
    },
    focus: {
        Price: false,
        alertChangePercent: false,
        cumulativeUpChange: false,
        cumulativeDownChange: false,
        fiveMinVolume: false,
        Score: false,
        Bonuses: false,
    },
    daily: {
        Price: false,
        alertChangePercent: false,
        cumulativeUpChange: false,
        cumulativeDownChange: false,
        fiveMinVolume: false,
        Score: false,
        Bonuses: false,
    },
};

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ DOMContentLoaded event fired!");

    try {
        console.log("Fetching settings...");
        window.settings = await window.settingsAPI.get(); // ✅ Store settings globally
        console.log("Retrieved settings:", window.settings);

        initializeGeneralSection();
        initializeScannerSection();
        initializeTopSection();
        initializeNewsSection();
        initializeAdminSection();

        await loadAttributeFilters("live", "live-filters");
        await loadAttributeFilters("focus", "focus-filters");
        await loadAttributeFilters("daily", "daily-filters");

        // ✅ Update toggle buttons to pass settings
        document.querySelector("#live-toggle-all").addEventListener("click", () => {
            toggleAll("live", true);
        });

        document.querySelector("#live-toggle-none").addEventListener("click", () => {
            toggleAll("live", false);
        });

        document.querySelector("#focus-toggle-all").addEventListener("click", () => {
            toggleAll("focus", true);
        });

        document.querySelector("#focus-toggle-none").addEventListener("click", () => {
            toggleAll("focus", false);
        });

        document.querySelector("#daily-toggle-all").addEventListener("click", () => {
            toggleAll("daily", true);
        });

        document.querySelector("#daily-toggle-none").addEventListener("click", () => {
            toggleAll("daily", false);
        });

        // window.settingsAPI.onUpdate((updatedSettings) => {
        //     console.log("Settings Syncing", updatedSettings);
        // });

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

    // document.getElementById("show-bonuses-legend-board").addEventListener("click", () => {
    //     window.legendAPI.toggle();
    // });

    const showEventsToggle = document.getElementById("show-events");
    const showFrontlineToggle = document.getElementById("show-frontline");
    const showHeroesToggle = document.getElementById("show-heroes");
    showEventsToggle.checked = window.settings.windows.scannerWindow?.isOpen ?? false;
    showFrontlineToggle.checked = window.settings.windows.frontlineWindow?.isOpen ?? false;
    showHeroesToggle.checked = window.settings.windows.focusWindow?.isOpen ?? false;

    const showActiveToggle = document.getElementById("show-active");
    showActiveToggle.checked = window.settings.windows.activeWindow?.isOpen ?? false;

    const showScrollXpToggle = document.getElementById("show-scrollXp");
    showScrollXpToggle.checked = window.settings.windows.scrollXpWindow?.isOpen ?? false;
    const showScrollStatsToggle = document.getElementById("show-scrollStats");
    showScrollStatsToggle.checked = window.settings.windows.scrollStatsWindow?.isOpen ?? false;

    const showInfobarToggle = document.getElementById("show-infobar");
    showInfobarToggle.checked = window.settings.windows.infobarWindow?.isOpen ?? false;

    const showTraderviewsToggle = document.getElementById("show-traderviews");
    const showProgressToggle = document.getElementById("show-progress");
    const showWizardToggle = document.getElementById("show-wizard");
    showTraderviewsToggle.checked = window.settings.traderview?.visibility ?? false;
    showProgressToggle.checked = window.settings.windows.progressWindow?.isOpen ?? false;
    showWizardToggle.checked = window.settings.windows.wizardWindow?.isOpen ?? false;

    showEventsToggle.addEventListener("change", (event) => {
        if (event.target.checked) {
            window.eventsAPI.activate();
        } else {
            window.eventsAPI.deactivate();
        }
    });

    showFrontlineToggle.addEventListener("change", (event) => {
        if (event.target.checked) {
            window.frontlineAPI.activate();
        } else {
            window.frontlineAPI.deactivate();
        }
    });

    showHeroesToggle.addEventListener("change", (event) => {
        if (event.target.checked) {
            window.heroesAPI.activate();
        } else {
            window.heroesAPI.deactivate();
        }
    });

    showActiveToggle.addEventListener("change", (event) => {
        if (event.target.checked) {
            window.activeAPI.activate();
        } else {
            window.activeAPI.deactivate();
        }
    });

    showScrollXpToggle.addEventListener("change", (event) => {
        if (event.target.checked) {
            window.scrollXpAPI.activate();
        } else {
            window.scrollXpAPI.deactivate();
        }
    });

    showScrollStatsToggle.addEventListener("change", (event) => {
        if (event.target.checked) {
            window.scrollStatsAPI.activate();
        } else {
            window.scrollStatsAPI.deactivate();
        }
    });

    showInfobarToggle.addEventListener("change", (event) => {
        if (event.target.checked) {
            window.infobarAPI.activate();
        } else {
            window.infobarAPI.deactivate();
        }
    });

    showTraderviewsToggle.addEventListener("change", async (event) => {
        const visibility = event.target.checked;

        // 1. Update runtime behavior
        window.traderviewAPI.setVisibility(visibility);

        // 2. Modify in-memory settings and persist
        window.settings.traderview = {
            ...(window.settings.traderview || {}),
            visibility,
        };

        await window.settingsAPI.update(window.settings);
    });

    showProgressToggle.addEventListener("change", (event) => {
        if (event.target.checked) {
            window.progressAPI.activate();
        } else {
            window.progressAPI.deactivate();
        }
    });

    showWizardToggle.addEventListener("change", (event) => {
        if (event.target.checked) {
            window.wizardAPI.activate();
        } else {
            window.wizardAPI.deactivate();
        }
    });
}

function initializeAdminSection() {
    document.getElementById("fetchNewsBtn").addEventListener("click", () => {
        console.log("📰 Fetch News button clicked");
        window.settingsAPI.fetchNews();
        window.infobarAPI.refresh();
    });

    document.getElementById("nukeBtn").addEventListener("click", () => {
        console.log("💣 Admin Nuke button clicked");
        window.electronAPI.nukeState(); // Sends to ipcMain → then triggers store:nuke
    });
}

function initializeScannerSection() {
    if (!window.settings) window.settings = {};
    if (!window.settings.scanner) window.settings.scanner = {};

    const minPriceInput = document.getElementById("alerts-min-price");
    const maxPriceInput = document.getElementById("alerts-max-price");
    const directionSelect = document.getElementById("filter-direction");
    const minChangePercentInput = document.getElementById("filter-change-percent");
    const minVolumeInput = document.getElementById("filter-volume");
    const maxAlertsInput = document.getElementById("max-alerts");
    const volumeSlider = document.getElementById("scanner-volume");
    const volumeValueDisplay = document.getElementById("scanner-volume-value");

    // Ensure all elements exist
    if (!minPriceInput || !maxPriceInput || !directionSelect || !minChangePercentInput || !minVolumeInput || !maxAlertsInput || !volumeSlider || !volumeValueDisplay) {
        console.error("❌ Scanner initialization error. Missing inputs:", {
            minPriceInput,
            maxPriceInput,
            directionSelect,
            minChangePercentInput,
            minVolumeInput,
            maxAlertsInput,
            volumeSlider,
            volumeValueDisplay,
        });
        return;
    }

    // Load initial values safely
    minPriceInput.value = window.settings.scanner.minPrice ?? "";
    maxPriceInput.value = window.settings.scanner.maxPrice ?? "";
    directionSelect.value = window.settings.scanner.direction ?? "";
    minChangePercentInput.value = window.settings.scanner.minChangePercent ?? "";
    minVolumeInput.value = window.settings.scanner.minVolume ?? "";
    maxAlertsInput.value = window.settings.scanner.maxAlerts ?? 50;
    volumeSlider.value = window.settings.scanner.scannerVolume ?? 1;

    async function updateScannerSettings() {
        0;
        try {
            const latestSettings = await window.settingsAPI.get();
            if (!latestSettings) {
                console.error("❌ Failed to fetch latest settings.");
                return;
            }

            const newSettings = {
                ...latestSettings,
                scanner: {
                    minPrice: parseFloat(minPriceInput.value) || 0,
                    maxPrice: parseFloat(maxPriceInput.value) || 0,
                    direction: directionSelect.value || null,
                    minChangePercent: parseFloat(minChangePercentInput.value) || 0,
                    minVolume: parseInt(minVolumeInput.value, 10) || 0,
                    maxAlerts: parseInt(maxAlertsInput.value, 10) || 50,
                    scannerVolume: parseFloat(volumeSlider.value) ?? 0.5, // ✅ Volume setting added
                },
            };

            await window.settingsAPI.update(newSettings);
            window.settings = newSettings;

            console.log("✅ Scanner settings updated:", newSettings.scanner);
        } catch (error) {
            console.error("❌ Error updating scanner settings:", error);
        }
    }

    // ✅ Event listeners for all scanner settings
    minPriceInput.addEventListener("input", updateScannerSettings);
    maxPriceInput.addEventListener("input", updateScannerSettings);
    directionSelect.addEventListener("change", updateScannerSettings);
    minChangePercentInput.addEventListener("input", updateScannerSettings);
    minVolumeInput.addEventListener("input", updateScannerSettings);
    maxAlertsInput.addEventListener("input", updateScannerSettings);
    volumeSlider.addEventListener("input", (event) => {
        volumeValueDisplay.textContent = `${Math.round(event.target.value * 100)}%`;
        updateScannerSettings();
    });
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
    // const topTransparentToggle = document.getElementById("top-transparent-toggle");
    const liveLengthInput = document.getElementById("live-length");
    const focusLengthInput = document.getElementById("focus-length");
    const dailyLengthInput = document.getElementById("daily-length");

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

    // if (window.settings.top.transparent !== undefined) topTransparentToggle.checked = window.settings.top.transparent;

    // ✅ Load saved length settings
    liveLengthInput.value = window.settings.top.liveListLength ?? 10;
    focusLengthInput.value = window.settings.top.focusListLength ?? 3;
    focusLengthInput.value = window.settings.top.focusListLength ?? 10;

    async function updatePriceFilter() {
        try {
            const latestSettings = await window.settingsAPI.get();

            if (!latestSettings || !latestSettings.top) {
                console.error("❌ Failed to fetch latest settings. Skipping update.");
                return;
            }

            const newSettings = {
                ...latestSettings,
                top: {
                    ...latestSettings.top,
                    minPrice: parseFloat(document.getElementById("min-price").value) || 0,
                    maxPrice: parseFloat(document.getElementById("max-price").value) || 0,
                },
            };

            await window.settingsAPI.update(newSettings);
        } catch (error) {
            console.error("❌ Error updating Price filter:", error);
        }
    }

    async function updateVolumeFilter() {
        try {
            const latestSettings = await window.settingsAPI.get();
            if (!latestSettings || !latestSettings.top) {
                console.error("❌ Failed to fetch latest settings. Skipping update.");
                return;
            }

            let newMinVolume = parseFloat(document.getElementById("min-volume").value) || 0;
            let newMaxVolume = parseFloat(document.getElementById("max-volume").value) || 0;

            const newSettings = {
                ...latestSettings,
                top: {
                    ...latestSettings.top,
                    minVolume: newMinVolume,
                    maxVolume: newMaxVolume,
                },
            };

            console.log("✅ Saving updated Volume filter:", newSettings);
            await window.settingsAPI.update(newSettings);
        } catch (error) {
            console.error("❌ Error updating Volume filter:", error);
        }
    }

    async function updateFloatFilter() {
        try {
            const latestSettings = await window.settingsAPI.get();
            if (!latestSettings || !latestSettings.top) {
                console.error("❌ Failed to fetch latest settings. Skipping update.");
                return;
            }

            let newMinFloat = parseFloat(document.getElementById("min-float").value) || 0;
            let newMaxFloat = parseFloat(document.getElementById("max-float").value) || 0;

            const newSettings = {
                ...latestSettings,
                top: {
                    ...latestSettings.top,
                    minFloat: newMinFloat,
                    maxFloat: newMaxFloat,
                },
            };

            console.log("✅ Saving updated Float filter:", newSettings);
            await window.settingsAPI.update(newSettings);
        } catch (error) {
            console.error("❌ Error updating Float filter:", error);
        }
    }

    async function updateScoreFilter() {
        try {
            const latestSettings = await window.settingsAPI.get();
            if (!latestSettings || !latestSettings.top) {
                console.error("❌ Failed to fetch latest settings. Skipping update.");
                return;
            }

            let newMinScore = parseFloat(document.getElementById("min-score").value) || 0;
            let newMaxScore = parseFloat(document.getElementById("max-score").value) || 0;

            const newSettings = {
                ...latestSettings,
                top: {
                    ...latestSettings.top,
                    minScore: newMinScore,
                    maxScore: newMaxScore,
                },
            };

            console.log("✅ Saving updated Score filter:", newSettings);
            await window.settingsAPI.update(newSettings);
        } catch (error) {
            console.error("❌ Error updating Score filter:", error);
        }
    }

    // async function updateTransparency() {
    //     try {
    //         const latestSettings = await window.settingsAPI.get();
    //         if (!latestSettings || !latestSettings.top) {
    //             console.error("❌ Failed to fetch latest settings.");
    //             return;
    //         }

    //         const newSettings = {
    //             ...latestSettings, // ✅ Spread entire settings
    //             top: {
    //                 ...latestSettings.top, // ✅ Preserve other top settings
    //                 transparent: topTransparentToggle.checked, // ✅ Update only transparency
    //             },
    //         };

    //         await window.settingsAPI.update(newSettings);
    //         console.log("✅ Updated transparency setting:", newSettings.top);
    //         window.topAPI.refresh(); // ✅ Refresh UI
    //     } catch (error) {
    //         console.error("❌ Error updating transparency:", error);
    //     }
    // }

    async function updateListLength(type, input) {
        const newLength = parseInt(input.value, 10) || 10;

        try {
            // 🔄 Get latest settings before making changes
            const latestSettings = await window.settingsAPI.get();
            if (!latestSettings || !latestSettings.top) {
                console.error("❌ Latest settings not found! Skipping update.");
                return;
            }

            // ✅ Preserve all previous settings while updating the correct list length
            const newSettings = {
                ...latestSettings,
                top: {
                    ...latestSettings.top,
                    [`${type}ListLength`]: newLength, // ✅ Updates liveListLength or focusListLength at the root
                },
            };

            console.log(`✅ Updated ${type} list length:`, newLength);

            // ✅ Save settings correctly
            await window.settingsAPI.update(newSettings);

            console.log("✅ Settings successfully updated:", newSettings);
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

    // topTransparentToggle.addEventListener("change", updateTransparency);
    liveLengthInput.addEventListener("input", () => updateListLength("live", liveLengthInput));
    liveLengthInput.addEventListener("input", () => updateListLength("frontline", liveLengthInput));
    focusLengthInput.addEventListener("input", () => updateListLength("focus", focusLengthInput));
    dailyLengthInput.addEventListener("input", () => updateListLength("daily", dailyLengthInput));
}

async function loadAttributeFilters(listType, containerId) {
    try {
        console.log(`📥 Loading attributes for ${listType}...`);
        console.log("HARDCODED_ATTRIBUTES:", HARDCODED_ATTRIBUTES);
        console.log("window.settings.top.lists:", window.settings.top.lists);

        const attributes = Object.keys(HARDCODED_ATTRIBUTES[listType]); // Only include predefined attributes
        const container = document.getElementById(containerId);

        if (!container) {
            console.error(`❌ Container ${containerId} not found!`);
            return;
        }

        container.innerHTML = ""; // Clear previous checkboxes

        // ✅ Ensure settings exist before using them
        const selectedFilters = window.settings.top.lists?.[listType] || {};

        attributes.forEach((attr) => {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.name = listType;
            checkbox.value = attr;
            checkbox.checked = selectedFilters[attr] ?? false; // ✅ Fetch value from settings

            checkbox.addEventListener("change", () => {
                updateAttributeFilters(); // ✅ Save updates correctly
            });

            label.appendChild(checkbox);
            label.append(` ${attr}`);
            container.appendChild(label);
        });

        console.log(`✅ Attributes loaded dynamically from settings for ${listType}!`);
    } catch (error) {
        console.error(`❌ Error loading ${listType} attributes:`, error);
    }
}

async function updateAttributeFilters() {
    try {
        console.log("🔄 Fetching latest settings before updating filters...");
        const latestSettings = await window.settingsAPI.get();
        if (!latestSettings || !latestSettings.top) {
            console.error("❌ Failed to fetch latest settings. Skipping update.");
            return;
        }

        // ✅ Update settings dynamically while preserving other lists
        const updatedLists = {
            ...latestSettings.top.lists,
            live: Object.fromEntries(Array.from(document.querySelectorAll("input[name='live']")).map((checkbox) => [checkbox.value, checkbox.checked])),
            focus: Object.fromEntries(Array.from(document.querySelectorAll("input[name='focus']")).map((checkbox) => [checkbox.value, checkbox.checked])),
            daily: Object.fromEntries(Array.from(document.querySelectorAll("input[name='daily']")).map((checkbox) => [checkbox.value, checkbox.checked])),
        };

        // ✅ Spread everything and only update `lists`
        const newSettings = {
            ...latestSettings,
            top: {
                ...latestSettings.top,
                lists: updatedLists,
            },
        };

        console.log("💾 Saving updated filters:", newSettings);
        await window.settingsAPI.update(newSettings);
    } catch (error) {
        console.error("❌ Error updating filters:", error);
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

    updateAttributeFilters(); // ✅ Remove argument (fetches latest settings itself)
}

function initializeNewsSection() {
    if (!window.settings.news) {
        window.settings.news = { blockList: [], bullish: [], bearishList: [], allowMultiSymbols: true };
    }

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

    // ✅ Save setting on toggle (using direct API update)
    showTrackedTickersToggle.addEventListener("change", async () => {
        try {
            const latestSettings = await window.settingsAPI.get();
            if (!latestSettings || !latestSettings.news) {
                console.error("❌ Failed to fetch latest settings. Skipping update.");
                return;
            }

            const newSettings = {
                ...latestSettings, // Preserve all settings
                news: {
                    ...latestSettings.news, // Preserve other news settings
                    showTrackedTickers: showTrackedTickersToggle.checked,
                },
            };

            await window.settingsAPI.update(newSettings);
            console.log("✅ Updated 'Show Only Tracked Tickers' setting:", showTrackedTickersToggle.checked);
        } catch (error) {
            console.error("❌ Error updating 'Show Only Tracked Tickers' setting:", error);
        }
    });

    allowMultiSymbolsToggle.addEventListener("change", async () => {
        try {
            const latestSettings = await window.settingsAPI.get();
            if (!latestSettings || !latestSettings.news) {
                console.error("❌ Failed to fetch latest settings. Skipping update.");
                return;
            }

            const newSettings = {
                ...latestSettings, // Preserve all settings
                news: {
                    ...latestSettings.news, // Preserve other news settings
                    allowMultiSymbols: allowMultiSymbolsToggle.checked,
                },
            };

            await window.settingsAPI.update(newSettings);
            console.log("✅ Updated 'Allow Multi-Symbol Headlines' setting:", allowMultiSymbolsToggle.checked);
        } catch (error) {
            console.error("❌ Error updating 'Allow Multi-Symbol Headlines' setting:", error);
        }
    });

    // ✅ Initialize keyword management
    setupKeywordManagement();
}

function setupKeywordManagement() {
    const keywordType = document.getElementById("keyword-type");
    const keywordInput = document.getElementById("keyword-input");
    const addKeywordBtn = document.getElementById("add-keyword");

    const blockListEl = document.getElementById("block-list");
    const bullishEl = document.getElementById("bullish-list");
    const bearishEl = document.getElementById("bearish-list");

    function updateLists(updatedSettings) {
        // 🔄 Use the latest settings (avoid stale data)
        const settings = updatedSettings || window.settings;

        renderList(blockListEl, settings.news.blockList, "blockList");
        renderList(bullishEl, settings.news.bullishList, "bullishList");
        renderList(bearishEl, settings.news.bearishList, "bearishList");
    }

    function renderList(element, items, listType) {
        if (!Array.isArray(items)) {
            console.error(`❌ Expected an array but got:`, items);
            items = []; // Fallback to an empty array
        }

        element.innerHTML = ""; // Clear previous UI
        items.forEach((keyword) => {
            const li = document.createElement("li");
            li.textContent = keyword;

            // ✅ Remove button for each keyword
            const removeBtn = document.createElement("button");
            removeBtn.textContent = "X";
            removeBtn.addEventListener("click", async () => {
                try {
                    const latestSettings = await window.settingsAPI.get();
                    if (!latestSettings || !latestSettings.news) {
                        console.error("❌ Failed to fetch latest settings. Skipping update.");
                        return;
                    }

                    // ✅ Remove the keyword by filtering (prevents index issues)
                    const updatedList = latestSettings.news[listType].filter((item) => item !== keyword);

                    // ✅ Preserve all other settings while updating only the target list
                    const updatedSettings = {
                        ...latestSettings,
                        news: {
                            ...latestSettings.news,
                            [listType]: updatedList,
                        },
                    };

                    await window.settingsAPI.update(updatedSettings);

                    // ✅ Keep local state updated
                    window.settings = updatedSettings;

                    // ✅ Update UI with the latest settings
                    updateLists(updatedSettings);

                    console.log(`✅ Removed keyword "${keyword}" from ${listType}`);
                } catch (error) {
                    console.error(`❌ Error removing keyword "${keyword}":`, error);
                }
            });

            li.appendChild(removeBtn);
            element.appendChild(li);
        });
    }

    // ✅ Add new keyword to the selected list
    addKeywordBtn.addEventListener("click", async () => {
        const keyword = keywordInput.value.trim();
        if (!keyword) return;

        try {
            const latestSettings = await window.settingsAPI.get();
            if (!latestSettings || !latestSettings.news) {
                console.error("❌ Failed to fetch latest settings. Skipping update.");
                return;
            }

            const listType = keywordType.value;

            if (!latestSettings.news[listType].includes(keyword)) {
                // ✅ Add keyword and preserve other settings
                const updatedSettings = {
                    ...latestSettings,
                    news: {
                        ...latestSettings.news,
                        [listType]: [...latestSettings.news[listType], keyword],
                    },
                };

                await window.settingsAPI.update(updatedSettings);

                // ✅ Keep local state updated
                window.settings = updatedSettings;

                // ✅ Update UI with the latest settings
                updateLists(updatedSettings);

                console.log(`✅ Added keyword "${keyword}" to ${listType}`);
            }
        } catch (error) {
            console.error(`❌ Error adding keyword "${keyword}":`, error);
        }

        keywordInput.value = ""; // Clear input field
    });

    // ✅ Initialize UI with the latest data
    updateLists();
}
