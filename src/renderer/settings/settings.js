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
    const topTransparentToggle = document.getElementById("top-transparent-toggle");
    const sessionLengthInput = document.getElementById("session-length");
    const dailyLengthInput = document.getElementById("daily-length");

    if (!minPriceInput || !maxPriceInput || !topTransparentToggle || !sessionLengthInput || !dailyLengthInput) {
        console.error("One or more input elements not found!");
        return;
    }

    // ✅ Load saved values from `settings.top`
    if (window.settings.top.minPrice !== undefined) minPriceInput.value = window.settings.top.minPrice;
    if (window.settings.top.maxPrice !== undefined) maxPriceInput.value = window.settings.top.maxPrice;
    if (window.settings.top.transparent !== undefined) topTransparentToggle.checked = window.settings.top.transparent;

    // ✅ Load saved length settings
    sessionLengthInput.value = window.settings.top.lists?.session?.length ?? 10;
    dailyLengthInput.value = window.settings.top.lists?.daily?.length ?? 10;

    console.log("✅ Applied topSettings:", {
        minPrice: minPriceInput.value,
        maxPrice: maxPriceInput.value,
        transparent: topTransparentToggle.checked,
        sessionLength: sessionLengthInput.value,
        dailyLength: dailyLengthInput.value,
    });

    function updatePriceFilter() {
        const newMin = parseFloat(minPriceInput.value) || 0;
        const newMax = parseFloat(maxPriceInput.value) || 1000;

        const updatedSettings = {
            ...window.settings.top, // Preserve other settings
            minPrice: newMin,
            maxPrice: newMax,
        };

        console.log("Updated price filter:", updatedSettings);
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
    topTransparentToggle.addEventListener("change", updateTransparency);
    sessionLengthInput.addEventListener("input", () => updateListLength("session", sessionLengthInput));
    dailyLengthInput.addEventListener("input", () => updateListLength("daily", dailyLengthInput));
}

function initializeNewsSection() {
    if (!window.settings.news) {
        window.settings.news = {}; // ✅ Ensure the "news" key exists
    }

    console.log("🔍 Checking loaded news settings:", window.settings.news);

    const showTrackedTickersToggle = document.getElementById("show-tracked-tickers");

    if (!showTrackedTickersToggle) {
        console.error("❌ 'Show Only Tracked Tickers' toggle not found!");
        return;
    }

    // ✅ Load saved setting
    showTrackedTickersToggle.checked = window.settings.news.showTrackedTickers ?? false;

    // ✅ Save setting on toggle
    showTrackedTickersToggle.addEventListener("change", async () => {
        window.settings.news.showTrackedTickers = showTrackedTickersToggle.checked;

        await window.settingsAPI.update(window.settings);
        console.log("✅ Updated 'Show Only Tracked Tickers' setting:", showTrackedTickersToggle.checked);
    });
}

async function loadAttributeFilters(listType, containerId) {
    try {
        console.log(`📥 Fetching attributes for ${listType}...`);
        let attributes = await window.settingsAPI.getAttributes(listType);

        if (attributes.length === 0) {
            console.log(`⚠️ No attributes for ${listType}. Waiting for updates...`);
            return;
        }

        console.log(`✅ Received attributes for ${listType}:`, attributes);
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`❌ Container ${containerId} not found!`);
            return;
        }

        container.innerHTML = ""; // ✅ Clear previous checkboxes

        // ✅ Ensure `settings.top` exists
        if (!window.settings || !window.settings.top) {
            console.error("❌ `settings.top` is missing while loading attributes!");
            return;
        }

        const selectedFilters = window.settings.top.lists?.[listType] || {}; // ✅ Use structured storage

        attributes.forEach((attr) => {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.name = listType;
            checkbox.value = attr;
            checkbox.checked = selectedFilters[attr] ?? true; // ✅ Preserve saved state

            checkbox.addEventListener("change", () => {
                updateFilters(window.settings); // ✅ Pass settings to updateFilters()
            });

            label.appendChild(checkbox);
            label.append(` ${attr}`);
            container.appendChild(label);
        });

        console.log(`✅ UI updated for ${listType}!`);
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
        // 🔄 Fetch latest settings to ensure we don’t overwrite anything
        const latestSettings = await window.settingsAPI.get();
        if (!latestSettings || !latestSettings.top) {
            console.error("❌ Latest settings not found! Skipping update.");
            return;
        }

        // ✅ Preserve the latest session & daily lengths
        const sessionLength = latestSettings.top.lists?.session?.length ?? 10;
        const dailyLength = latestSettings.top.lists?.daily?.length ?? 10;

        // ✅ Preserve all filters + length
        const updatedSettings = {
            ...latestSettings.top, // Keep all settings
            lists: {
                session: { ...latestSettings.top.lists?.session, length: sessionLength },
                daily: { ...latestSettings.top.lists?.daily, length: dailyLength },
            },
        };

        // ✅ Capture new attribute selections without wiping lengths
        document.querySelectorAll("input[name='session']").forEach((checkbox) => {
            updatedSettings.lists.session[checkbox.value] = checkbox.checked;
        });

        document.querySelectorAll("input[name='daily']").forEach((checkbox) => {
            updatedSettings.lists.daily[checkbox.value] = checkbox.checked;
        });

        console.log("💾 Saving updated filters (attributes + length preserved):", updatedSettings);

        // ✅ Save settings and apply changes
        await window.settingsAPI.update({ top: updatedSettings });
        applyAllFilters(updatedSettings.top);
    } catch (error) {
        console.error("Error updating filters:", error);
    }
}


function applyAllFilters(updatedTopSettings) {
    console.log("Applying filters");
    window.settingsAPI.update({ top: updatedTopSettings });

    if (window.topAPI.applyFilters) {
        window.topAPI.applyFilters(updatedTopSettings); // ✅ Send everything
    } else {
        console.warn("⚠️ window.topAPI.applyFilters is not defined!");
    }
}

function saveSettings(newSettings) {
    // ✅ Ensure `top` object structure is correct before saving
    if (!newSettings.top || typeof newSettings.top !== "object") {
        newSettings.top = { minPrice: 0, maxPrice: 1000 };
    }

    console.log("Saving settings:", newSettings);
    window.settingsAPI.update(newSettings);
    window.topAPI.refresh();
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
