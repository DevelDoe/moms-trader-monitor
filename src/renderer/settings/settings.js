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
        const settings = await window.settingsAPI.get();
        console.log("Retrieved settings:", settings);

        initializeGeneralSection(settings.general || {});
        initializeTopSection(settings || {});

        await loadAttributeFilters("session", "session-filters", settings);
        await loadAttributeFilters("daily", "daily-filters", settings);

        // ✅ Update toggle buttons to pass settings
        document.querySelector("#session-toggle-all").addEventListener("click", () => {
            toggleAll("session", true, settings);
        });

        document.querySelector("#session-toggle-none").addEventListener("click", () => {
            toggleAll("session", false, settings);
        });

        document.querySelector("#daily-toggle-all").addEventListener("click", () => {
            toggleAll("daily", true, settings);
        });

        document.querySelector("#daily-toggle-none").addEventListener("click", () => {
            toggleAll("daily", false, settings);
        });

        window.settingsAPI.onUpdate((updatedSettings) => {
            console.log("Settings Syncing", updatedSettings);
        });

        window.settingsAPI.onAttributesUpdate(async () => {
            console.log("🔔 New attributes detected! Refreshing settings...");
            await loadAttributeFilters("session", "session-filters", settings);
            await loadAttributeFilters("daily", "daily-filters", settings);
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


function initializeGeneralSection(topSettings) {
    console.log("Initializing General Section:", topSettings);
}

function initializeTopSection(settings) {
    if (!settings || !settings.top) {
        console.error("❌ `settings.top` is missing! Skipping initialization.");
        return;
    }

    console.log("🔍 Checking loaded settings:", settings.top);

    const minPriceInput = document.getElementById("min-price");
    const maxPriceInput = document.getElementById("max-price");
    const topTransparentToggle = document.getElementById("top-transparent-toggle");

    if (!minPriceInput || !maxPriceInput || !topTransparentToggle) {
        console.error("❌ One or more input elements not found!");
        return;
    }

    // ✅ Load saved values from `settings.top`
    if (settings.top.minPrice !== undefined) minPriceInput.value = settings.top.minPrice;
    if (settings.top.maxPrice !== undefined) maxPriceInput.value = settings.top.maxPrice;
    if (settings.top.transparent !== undefined) topTransparentToggle.checked = settings.top.transparent;

    console.log("✅ Applied topSettings:", {
        minPrice: minPriceInput.value,
        maxPrice: maxPriceInput.value,
        transparent: topTransparentToggle.checked,
    });

    function updatePriceFilter() {
        const newMin = parseFloat(minPriceInput.value) || 0;
        const newMax = parseFloat(maxPriceInput.value) || 1000;

        const updatedSettings = {
            ...settings.top, // Preserve other settings
            minPrice: newMin,
            maxPrice: newMax,
        };

        console.log("✅ Updated price filter:", updatedSettings);
        applyAllFilters(updatedSettings);
    }

    function updateTransparency() {
        const updatedSettings = {
            ...settings.top,
            transparent: topTransparentToggle.checked,
        };

        console.log("✅ Updated transparency setting:", updatedSettings);
        window.settingsAPI.update({ top: updatedSettings });

        window.topAPI.refresh(); // ✅ Refresh top window UI
    }

    // ✅ Prevent empty values by using 'input' instead of 'change'
    minPriceInput.addEventListener("input", updatePriceFilter);
    maxPriceInput.addEventListener("input", updatePriceFilter);
    topTransparentToggle.addEventListener("change", updateTransparency);
}


async function loadAttributeFilters(listType, containerId, settings) {
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
        if (!settings || !settings.top) {
            console.error("❌ `settings.top` is missing while loading attributes!");
            return;
        }

        const selectedFilters = settings.top.cells?.[listType] || {}; // ✅ Use structured storage

        attributes.forEach((attr) => {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.name = listType;
            checkbox.value = attr;
            checkbox.checked = selectedFilters[attr] ?? true; // ✅ Preserve saved state

            checkbox.addEventListener("change", () => {
                updateFilters(settings); // ✅ Pass settings to updateFilters()
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


function updateFilters(settings) {
    if (!settings || !settings.top) {
        console.error("❌ `settings.top` is missing! Skipping update.");
        return;
    }

    const updatedSettings = {
        ...settings, // ✅ Preserve everything else
        top: {
            ...settings.top, // ✅ Preserve other top settings
            cells: {
                session: {},
                daily: {},
            },
        },
    };

    document.querySelectorAll("input[name='session']").forEach((checkbox) => {
        updatedSettings.top.cells.session[checkbox.value] = checkbox.checked;
    });

    document.querySelectorAll("input[name='daily']").forEach((checkbox) => {
        updatedSettings.top.cells.daily[checkbox.value] = checkbox.checked;
    });

    console.log("💾 Saving updated filters:", updatedSettings);
    
    // ✅ Ensure settings file gets updated
    window.settingsAPI.update(updatedSettings);

    applyAllFilters(updatedSettings.top);
}


function applyAllFilters(updatedTopSettings) {
    console.log("📢 Applying filters:", updatedTopSettings);
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

function toggleAll(listType, state, settings) {
    if (!settings || !settings.top) {
        console.error("❌ `settings.top` is missing! Skipping toggle.");
        return;
    }

    document.querySelectorAll(`input[name='${listType}']`).forEach((checkbox) => {
        checkbox.checked = state;
    });

    updateFilters(settings); // ✅ Pass the updated settings object
}

