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
    evt.currentTarget.classList.add("active");
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ DOMContentLoaded event fired!");

    try {
        console.log("Fetching settings...");
        const settings = await window.settingsAPI.getSettings();
        console.log("Retrieved settings:", settings);

        initializeGeneralSection(settings.general || []);
        initializeTopSection(settings.top || []);

        // Ensure settings.top exists
        if (!settings.top || typeof settings.top !== "object") {
            settings.top = {}; // Initialize if missing
        }

        // Event listeners

        // Listen for global settings updates
        window.settingsAPI.onSettingsUpdated((updatedSettings) => {
            console.log("Settings Syncing", updatedSettings);
            // todo: update settings...
        });

        // Top Transparency
        const topTransparentToggle = document.getElementById("top-transparent-toggle");
        topTransparentToggle.checked = settings.top.transparent === "true";

        // ✅ Listen for changes and update settings
        topTransparentToggle.addEventListener("change", () => {
            if (!settings.top || typeof settings.top !== "object") settings.top = {}; // Ensure `settings.top` exists

            settings.top.transparent = topTransparentToggle.checked;

            window.settingsAPI.updateSettings(settings);
            console.log("Updating settings: ", settings);

            window.topAPI.refreshWindow();
        });

        // Set the default active tab
        const defaultTab = document.querySelector(".tablinks.active");
        if (defaultTab) {
            defaultTab.click();
        } else {
            // If no tab is marked as active, activate the first one
            const firstTab = document.querySelector(".tablinks");
            if (firstTab) firstTab.click();
        }
    } catch (error) {
        console.error("Initialization error:", error);
    }
});

function initializeGeneralSection() {}

function initializeTopSection() {}

function saveSettings(newSettings) {
    console.log("Saving settings:", newSettings);
    window.settingsAPI.updateSettings(newSettings);
    window.topAPI.refreshWindow(); // Ensure window updates after settings change
}
