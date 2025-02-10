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

        // Ensure settings.top exists
        if (!settings.top || typeof settings.top !== "object") {
            settings.top = {}; // Initialize if missing
        }

        // Listen for global settings updates
        window.settingsAPI.onUpdate((updatedSettings) => {
            console.log("Settings Syncing", updatedSettings);
            // TODO: Update UI when settings change
        });

        // ✅ Transparency Toggle
        const topTransparentToggle = document.getElementById("top-transparent-toggle");
        topTransparentToggle.checked = settings.top.transparent === "true";

        topTransparentToggle.addEventListener("change", () => {
            settings.top.transparent = topTransparentToggle.checked;
            window.settingsAPI.update(settings);
            console.log("Updating settings: ", settings);
            window.topAPI.refresh();
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

function initializeGeneralSection(settings) {
    console.log("Initializing General Section:", settings);
}

function initializeTopSection(settings) {
    console.log("Initializing Top Section:", settings);

    // ✅ Ensure `settings.top` exists
    if (!settings.top || typeof settings.top !== "object") {
        settings.top = { minPrice: 0, maxPrice: 1000 };
    }

    // ✅ Get elements
    const minPriceInput = document.getElementById("min-price");
    const maxPriceInput = document.getElementById("max-price");

    // ✅ Load saved values from settings.top
    minPriceInput.value = settings.top.minPrice ?? 0;
    maxPriceInput.value = settings.top.maxPrice ?? 1000;

    function updatePriceFilter() {
        const newMin = parseFloat(minPriceInput.value) || 0;
        const newMax = parseFloat(maxPriceInput.value) || 1000;

        // ✅ Ensure settings are correctly structured
        settings.top.minPrice = newMin;
        settings.top.maxPrice = newMax;

        window.settingsAPI.update(settings);
        console.log("Updated price filter:", { min: newMin, max: newMax });

        // ✅ Ensure `applyFilters` exists before calling it
        if (window.topAPI.applyFilters) {
            window.topAPI.applyFilters(newMin, newMax);
        } else {
            console.warn("window.topAPI.applyFilters is not defined!");
        }
    }

    minPriceInput.addEventListener("input", updatePriceFilter);
    maxPriceInput.addEventListener("input", updatePriceFilter);
}


function saveSettings(newSettings) {
    console.log("Saving settings:", newSettings);
    window.settingsAPI.update(newSettings);
    window.topAPI.refresh();
}
