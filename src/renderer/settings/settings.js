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
        initializeTopSection(settings.top || {}); // ✅ Pass settings.top

        // Listen for global settings updates
        window.settingsAPI.onUpdate((updatedSettings) => {
            console.log("Settings Syncing", updatedSettings);
            // TODO: Update UI when settings change
        });

        // ✅ Set the default active tab
        const defaultTab = document.querySelector(".tablinks.active");
        if (defaultTab) {
            openTab(null, defaultTab.getAttribute("onclick").match(/'(\w+)'/)[1]); // Extract tab ID
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

function initializeTopSection(topSettings) {
    console.log("🔍 Checking loaded settings:", topSettings);

    // ✅ Get elements after DOM has loaded
    const minPriceInput = document.getElementById("min-price");
    const maxPriceInput = document.getElementById("max-price");
    const topTransparentToggle = document.getElementById("top-transparent-toggle");

    if (!minPriceInput || !maxPriceInput || !topTransparentToggle) {
        console.error("❌ One or more input elements not found!");
        return;
    }

    // ✅ Load saved values from `settings` (not `settings.top`)
    if (topSettings.minPrice !== undefined) minPriceInput.value = topSettings.minPrice;
    if (topSettings.maxPrice !== undefined) maxPriceInput.value = topSettings.maxPrice;
    if (topSettings.transparent !== undefined) topTransparentToggle.checked = topSettings.transparent;

    console.log("✅ Applied topSettings:", {
        minPrice: minPriceInput.value,
        maxPrice: maxPriceInput.value,
        transparent: topTransparentToggle.checked,
    });

    function updatePriceFilter() {
        const newMin = parseFloat(minPriceInput.value) || 0;
        const newMax = parseFloat(maxPriceInput.value) || 1000;

        // ✅ Send only the updated top settings, not overwriting full settings object
        const updatedSettings = {
            top: {
                ...topSettings, // Preserve existing settings
                minPrice: newMin,
                maxPrice: newMax,
            },
        };

        window.settingsAPI.update(updatedSettings);
        console.log("✅ Updated price filter:", updatedSettings.top);

        if (window.topAPI.applyFilters) {
            window.topAPI.applyFilters(newMin, newMax);
        } else {
            console.warn("⚠️ window.topAPI.applyFilters is not defined!");
        }
    }

    function updateTransparency() {
        // ✅ Same fix, ensure only top settings are updated
        const updatedSettings = {
            top: {
                ...topSettings,
                transparent: topTransparentToggle.checked,
            },
        };

        window.settingsAPI.update(updatedSettings);
        console.log("✅ Updated transparency:", updatedSettings.top);
        window.topAPI.refresh();
    }

    // ✅ Prevent empty values by using 'input' instead of 'change'
    minPriceInput.addEventListener("input", updatePriceFilter);
    maxPriceInput.addEventListener("input", updatePriceFilter);
    topTransparentToggle.addEventListener("change", updateTransparency);
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
