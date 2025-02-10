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

function initializeGeneralSection(settings) {
    console.log("Initializing General Section:", settings);
}

function initializeTopSection(settings) {
    console.log("Initializing Top Section:", settings);

    // ✅ Ensure `settings.top` exists correctly
    if (!settings.top || typeof settings.top !== "object") {
        settings.top = { transparent: false, minPrice: 0, maxPrice: 1000 };
    }

    // ✅ Directly assign values
    document.getElementById("min-price").value = settings.top.minPrice ;
    document.getElementById("max-price").value = settings.top.maxPrice ;
    document.getElementById("top-transparent-toggle").checked = settings.top.transparent ?? false;

    function updatePriceFilter() {
        settings.top.minPrice = parseFloat(document.getElementById("min-price").value) || 0;
        settings.top.maxPrice = parseFloat(document.getElementById("max-price").value) || 1000;

        window.settingsAPI.update(settings);
        console.log("✅ Updated price filter:", settings.top);

        if (window.topAPI.applyFilters) {
            window.topAPI.applyFilters(settings.top.minPrice, settings.top.maxPrice);
        } else {
            console.warn("⚠️ window.topAPI.applyFilters is not defined!");
        }
    }

    document.getElementById("min-price").addEventListener("change", updatePriceFilter);
    document.getElementById("max-price").addEventListener("change", updatePriceFilter);

    // ✅ Ensure transparency setting is updated
    document.getElementById("top-transparent-toggle").addEventListener("change", () => {
        settings.top.transparent = document.getElementById("top-transparent-toggle").checked;

        window.settingsAPI.update(settings);
        console.log("✅ Updated transparency:", settings.top);
        window.topAPI.refresh();
    });
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
