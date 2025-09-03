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
        
        // Fetch window settings from electron store
        console.log("Fetching window settings...");
        window.windowSettings = await window.windowSettingsAPI.getAll();
        console.log("Retrieved window settings:", window.windowSettings);

        initializeGeneralSection();
        initializeScannerSection();
        initializeTopSection();
        initializeNewsSection();
        initializeAdminSection();
        initializeXpSettingsSection();
        initializeStatsSettingsSection();
        
        // Set up settings update handler to reload test settings
        window.settingsAPI.onUpdate(async (updated) => {
            window.settings = updated || {};
        });

        // Set up window settings update handler
        window.windowSettingsAPI.onUpdate(async (updated) => {
            window.windowSettings = updated || {};
            // Re-initialize general section to update window toggles
            initializeGeneralSection();
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

function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}

function initializeGeneralSection() {
    console.log("Initializing General Section");

    // document.getElementById("show-bonuses-legend-board").addEventListener("click", () => {
    //     window.legendAPI.toggle();
    // });

    const showEventsToggle = document.getElementById("show-events");
    const showFrontlineToggle = document.getElementById("show-frontline");
    const showHeroesToggle = document.getElementById("show-heroes");
    showEventsToggle.checked = window.windowSettings.eventsWindow?.isOpen ?? false;
    showFrontlineToggle.checked = window.windowSettings.frontlineWindow?.isOpen ?? false;
    showHeroesToggle.checked = window.windowSettings.heroesWindow?.isOpen ?? false;

    const showActiveToggle = document.getElementById("show-active");
    showActiveToggle.checked = window.windowSettings.activeWindow?.isOpen ?? false;

    const showScrollXpToggle = document.getElementById("show-scrollXp");
    showScrollXpToggle.checked = window.windowSettings.scrollXpWindow?.isOpen ?? false;
    const showScrollStatsToggle = document.getElementById("show-scrollStats");
    showScrollStatsToggle.checked = window.windowSettings.scrollStatsWindow?.isOpen ?? false;
    const showScrollHodToggle = document.getElementById("show-scrollHod");
    showScrollHodToggle.checked = window.windowSettings.scrollHodWindow?.isOpen ?? false;

    const showInfobarToggle = document.getElementById("show-infobar");
    showInfobarToggle.checked = window.windowSettings.infobarWindow?.isOpen ?? false;

    const showProgressToggle = document.getElementById("show-progress");
    const showWizardToggle = document.getElementById("show-wizard");
    showProgressToggle.checked = window.windowSettings.progressWindow?.isOpen ?? false;
    showWizardToggle.checked = window.windowSettings.wizardWindow?.isOpen ?? false;

    const showNewsToggle = document.getElementById("show-news");
    showNewsToggle.checked = window.windowSettings.newsWindow?.isOpen ?? false;

    const showSessionHistoryToggle = document.getElementById("show-sessionHistory");
    showSessionHistoryToggle.checked = window.windowSettings.sessionHistoryWindow?.isOpen ?? false;

    showEventsToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.eventsAPI.activate();
        } else {
            window.eventsAPI.deactivate();
        }

        await window.windowSettingsAPI.setOpenState("eventsWindow", event.target.checked);
    });

    showFrontlineToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.frontlineAPI.activate();
        } else {
            window.frontlineAPI.deactivate();
        }

        await window.windowSettingsAPI.setOpenState("frontlineWindow", event.target.checked);
    });

    showHeroesToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.heroesAPI.activate();
        } else {
            window.heroesAPI.deactivate();
        }

        await window.windowSettingsAPI.setOpenState("heroesWindow", event.target.checked);
    });

    showActiveToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.activeAPI.activate();
        } else {
            window.activeAPI.deactivate();
        }

        await window.windowSettingsAPI.setOpenState("activeWindow", event.target.checked);
    });

    showScrollXpToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.scrollXpAPI.activate();
        } else {
            window.scrollXpAPI.deactivate();
        }

        await window.windowSettingsAPI.setOpenState("scrollXpWindow", event.target.checked);
    });

    showScrollStatsToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.scrollStatsAPI.activate();
        } else {
            window.scrollStatsAPI.deactivate();
        }

        await window.windowSettingsAPI.setOpenState("scrollStatsWindow", event.target.checked);
    });

    showScrollHodToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.scrollHodAPI.activate();
        } else {
            window.scrollHodAPI.deactivate();
        }
        await window.windowSettingsAPI.setOpenState("scrollHodWindow", event.target.checked);
    });

    showInfobarToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.infobarAPI.activate();
        } else {
            window.infobarAPI.deactivate();
        }

        await window.windowSettingsAPI.setOpenState("infobarWindow", event.target.checked);
    });

    showProgressToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.progressAPI.activate();
        } else {
            window.progressAPI.deactivate();
        }

        // ✅ Persist the new state
        await window.windowSettingsAPI.setOpenState("progressWindow", event.target.checked);
    });

    showWizardToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.wizardAPI.activate();
        } else {
            window.wizardAPI.deactivate();
        }

        // ✅ Persist the new state
        await window.windowSettingsAPI.setOpenState("wizardWindow", event.target.checked);
    });

    showNewsToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.newsAPI.activate();
        } else {
            window.newsAPI.deactivate();
        }

        // ✅ Persist the new state
        await window.windowSettingsAPI.setOpenState("newsWindow", event.target.checked);
    });

    showSessionHistoryToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.sessionHistoryAPI.activate();
        } else {
            window.sessionHistoryAPI.deactivate();
        }

        await window.windowSettingsAPI.setOpenState("sessionHistoryWindow", event.target.checked);
    });

    // Reset All Windows Button
    const resetAllWindowsBtn = document.getElementById("reset-all-windows-btn");
    resetAllWindowsBtn.addEventListener("click", async () => {
        try {
            // Show confirmation dialog
            const confirmed = confirm("⚠️ This will reset ALL windows to their default positions.\n\nThis is useful if windows are off-screen or on non-existent monitors.\n\nAre you sure you want to continue?");
            
            if (!confirmed) return;

            // Show loading state
            resetAllWindowsBtn.textContent = "🔄 Resetting...";
            resetAllWindowsBtn.disabled = true;

            // Call the reset function
            await window.windowSettingsAPI.resetAll();

            // Show success message
            resetAllWindowsBtn.textContent = "✅ Reset Complete!";
            resetAllWindowsBtn.style.backgroundColor = "#4caf50";
            
            // Reset button after 3 seconds
            setTimeout(() => {
                resetAllWindowsBtn.textContent = "🔄 Reset All Windows to Default Positions";
                resetAllWindowsBtn.style.backgroundColor = "#d32f2f";
                resetAllWindowsBtn.disabled = false;
            }, 3000);

        } catch (error) {
            console.error("Failed to reset windows:", error);
            resetAllWindowsBtn.textContent = "❌ Reset Failed";
            resetAllWindowsBtn.style.backgroundColor = "#f44336";
            
            // Reset button after 3 seconds
            setTimeout(() => {
                resetAllWindowsBtn.textContent = "🔄 Reset All Windows to Default Positions";
                resetAllWindowsBtn.style.backgroundColor = "#d32f2f";
                resetAllWindowsBtn.disabled = false;
            }, 3000);
        }
    });

    // 🪞 Trader's View Subsettings
    const enableHeroesToggle = document.getElementById("enableHeroes");
    // const enableFrontlineToggle = document.getElementById("enableFrontline");
    const autoCloseTraderviewToggle = document.getElementById("autoCloseTraderview");

    enableHeroesToggle.checked = window.settings.traderview?.enableHeroes ?? true;
    // enableFrontlineToggle.checked = window.settings.traderview?.enableFrontline ?? false;
    autoCloseTraderviewToggle.checked = window.settings.traderview?.autoClose ?? true;

    enableHeroesToggle.addEventListener("change", async (e) => {
        const enableHeroes = e.target.checked;
        window.settings.traderview = { ...window.settings.traderview, enableHeroes };
        await window.settingsAPI.update(window.settings);

        if (enableHeroes && window.heroesAPI?.getCurrentHeroes) {
            const currentHeroes = await window.heroesAPI.getCurrentHeroes();
            if (Array.isArray(currentHeroes) && currentHeroes.length > 0) {
                window.traderviewAPI.openTickersNow(currentHeroes);
            } else {
                console.warn("⚠️ No current heroes available when toggling enableHeroes.");
            }
        }
    });

    // enableFrontlineToggle.addEventListener("change", async (e) => {
    //     window.settings.traderview = { ...window.settings.traderview, enableFrontline: e.target.checked };
    //     await window.settingsAPI.update(window.settings);
    // });

    autoCloseTraderviewToggle.addEventListener("change", async (e) => {
        window.settings.traderview = { ...window.settings.traderview, autoClose: e.target.checked };
        await window.settingsAPI.update(window.settings);
    });

    // elements
    const hodChimeVolumeSlider = document.getElementById("hod-chime-volume");
    const hodTickVolumeSlider = document.getElementById("hod-tick-volume");
    const hodChimeValue = document.getElementById("hod-chime-volume-value");
    const hodTickValue = document.getElementById("hod-tick-volume-value");
    const eventsComboVolumeSlider = document.getElementById("events-combo-volume");
    const eventsComboValue = document.getElementById("events-combo-volume-value");
    const newsAlertVolumeSlider = document.getElementById("news-alert-volume");
    const newsAlertValue = document.getElementById("news-alert-volume-value");

    // ensure settings structure + defaults
    window.settings ||= {};
    const before = JSON.stringify(window.settings);

    window.settings.hod ||= {};
    window.settings.events ||= {}; // ✅ this was missing

    if (typeof window.settings.hod.chimeVolume !== "number") {
        window.settings.hod.chimeVolume = 0.5;
        console.log(`[Settings] Setting default chime volume: 0.5`);
    }

    if (typeof window.settings.hod.tickVolume !== "number") window.settings.hod.tickVolume = 0.5;

    if (typeof window.settings.events.comboVolume !== "number") window.settings.events.comboVolume = 0.5;

    if (typeof window.settings.events.newsAlertVolume !== "number") window.settings.events.newsAlertVolume = 0.5;

    const after = JSON.stringify(window.settings);
    if (before !== after) {
        // only write if we actually added defaults
        window.settingsAPI.update(window.settings).catch(() => {});
    }

    // set UI from settings
    hodChimeVolumeSlider.value = window.settings.hod.chimeVolume;
    hodTickVolumeSlider.value = window.settings.hod.tickVolume;
    eventsComboVolumeSlider.value = window.settings.events.comboVolume;
    hodChimeValue.textContent = Math.round(window.settings.hod.chimeVolume * 100) + "%";
    hodTickValue.textContent = Math.round(window.settings.hod.tickVolume * 100) + "%";
    eventsComboValue.textContent = Math.round(window.settings.events.comboVolume * 100) + "%";
    newsAlertVolumeSlider.value = window.settings.events.newsAlertVolume;
    newsAlertValue.textContent = Math.round(window.settings.events.newsAlertVolume * 100) + "%";

    // wire inputs → settings (parse to number, clamp 0..1)
    hodChimeVolumeSlider.addEventListener("input", async (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, 0, 1);
        window.settings.hod.chimeVolume = v;
        hodChimeValue.textContent = Math.round(v * 100) + "%";
        console.log(`[Settings] Saving chime volume: ${v}`);
        await window.settingsAPI.update(window.settings);
    });

    hodTickVolumeSlider.addEventListener("input", async (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, 0, 1);
        window.settings.hod.tickVolume = v;
        hodTickValue.textContent = Math.round(v * 100) + "%";
        await window.settingsAPI.update(window.settings);
    });

    eventsComboVolumeSlider.addEventListener("input", async (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, 0, 1);
        window.settings.events.comboVolume = v;
        eventsComboValue.textContent = Math.round(v * 100) + "%";
        await window.settingsAPI.update(window.settings);
    });

    newsAlertVolumeSlider.addEventListener("input", async (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, 0, 1);
        window.settings.events.newsAlertVolume = v;
        newsAlertValue.textContent = Math.round(v * 100) + "%";
        await window.settingsAPI.update(window.settings);
    });

    // Test buttons for all audio types
    document.getElementById("test-chime-btn").addEventListener("click", () => {
        console.log("Testing chime...");
        if (window.hodChimeTest) {
            window.hodChimeTest();
        } else {
            console.warn("hodChimeTest function not available");
        }
    });

    document.getElementById("test-tick-btn").addEventListener("click", () => {
        console.log("Testing tick...");
        if (window.hodTickTest) {
            window.hodTickTest(0.5); // Test with medium proximity
        } else {
            console.warn("hodTickTest function not available");
        }
    });

    document.getElementById("test-combo-btn").addEventListener("click", () => {
        console.log("Testing combo alert...");
        if (window.testComboAlert) {
            window.testComboAlert();
        } else {
            console.warn("testComboAlert function not available");
        }
    });

    document.getElementById("test-news-btn").addEventListener("click", () => {
        console.log("Testing news alert...");
        if (window.testNewsAlert) {
            window.testNewsAlert();
        } else {
            console.warn("testNewsAlert function not available");
        }
    });

    document.getElementById("test-scanner-btn").addEventListener("click", () => {
        console.log("Testing scanner alert...");
        if (window.testScannerAlert) {
            window.testScannerAlert();
        } else {
            console.warn("testScannerAlert function not available");
        }
    });

    // Add a debug function to test audio file accessibility
    window.testAudioFiles = async () => {
        console.log("🔍 Testing audio file accessibility...");
        
        // Test events audio files
        try {
            const eventsResponse = await fetch("../events/short/1.mp3");
            console.log("✅ Events audio accessible:", eventsResponse.ok);
        } catch (error) {
            console.error("❌ Events audio not accessible:", error);
        }
        
        // Test HOD audio files
        try {
            const hodResponse = await fetch("../scrolls/magic.mp3");
            console.log("✅ HOD magic audio accessible:", hodResponse.ok);
        } catch (error) {
            console.error("❌ HOD magic audio not accessible:", error);
        }
        
        // Test news audio files
        try {
            const newsResponse = await fetch("../infobar/metal.wav");
            console.log("✅ News audio accessible:", newsResponse.ok);
        } catch (error) {
            console.error("❌ News audio not accessible:", error);
        }
    };
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
    const frontlineLengthInput = document.getElementById("frontline-length");
    const heroesLengthInput = document.getElementById("heroes-length");

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
    frontlineLengthInput.value = window.settings.top.frontlineListLength ?? 10;
    heroesLengthInput.value = window.settings.top.heroesListLength ?? 3;

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
                    [`${type}ListLength`]: newLength, // ✅ Updates frontlineListLength or heroesListLength at the root
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
    frontlineLengthInput.addEventListener("input", () => updateListLength("frontline", frontlineLengthInput));
    heroesLengthInput.addEventListener("input", () => updateListLength("heroes", heroesLengthInput));
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

function initializeXpSettingsSection() {
    console.log("Initializing XP Settings Section");

    const xpListLengthInput = document.getElementById("xp-list-length");
    const hodListLengthInput = document.getElementById("hod-list-length");
    const xpShowHeadersToggle = document.getElementById("xp-show-headers");
    const xpShowUpXpBtn = document.getElementById("xp-show-up-xp");
    const xpShowDownXpBtn = document.getElementById("xp-show-down-xp");
    const xpShowRatioBtn = document.getElementById("xp-show-ratio");
    const xpShowTotalBtn = document.getElementById("xp-show-total");
    const xpShowNetBtn = document.getElementById("xp-show-net");
    const xpShowPriceBtn = document.getElementById("xp-show-price");
    const xpShowTotalVolumeBtn = document.getElementById("xp-show-total-volume");
    const xpShowLevelBtn = document.getElementById("xp-show-level");
    
    if (!xpListLengthInput) {
        console.error("❌ XP list length input not found!");
        return;
    }

    if (!hodListLengthInput) {
        console.error("❌ HOD list length input not found!");
        return;
    }

    if (!xpShowHeadersToggle) {
        console.error("❌ XP show headers toggle not found!");
        return;
    }

    if (!xpShowUpXpBtn) {
        console.error("❌ XP show up XP button not found!");
        return;
    }

    if (!xpShowDownXpBtn) {
        console.error("❌ XP show down XP button not found!");
        return;
    }

    if (!xpShowRatioBtn) {
        console.error("❌ XP show ratio button not found!");
        return;
    }

    if (!xpShowTotalBtn) {
        console.error("❌ XP show total button not found!");
        return;
    }

    if (!xpShowNetBtn) {
        console.error("❌ XP show net button not found!");
        return;
    }

    if (!xpShowPriceBtn) {
        console.error("❌ XP show price button not found!");
        return;
    }

    if (!xpShowTotalVolumeBtn) {
        console.error("❌ XP show total volume button not found!");
        return;
    }

    if (!xpShowLevelBtn) {
        console.error("❌ XP show level button not found!");
        return;
    }

    // Load initial value from electron store
    async function loadXpSettings() {
        try {
            const xpSettings = await window.xpSettingsAPI.get();
            xpListLengthInput.value = xpSettings.listLength || 25;
            xpShowHeadersToggle.checked = xpSettings.showHeaders || false;
            updateButtonState(xpShowUpXpBtn, xpSettings.showUpXp !== false);
            updateButtonState(xpShowDownXpBtn, xpSettings.showDownXp !== false);
            updateButtonState(xpShowRatioBtn, xpSettings.showRatio !== false);
            updateButtonState(xpShowTotalBtn, xpSettings.showTotal !== false);
            updateButtonState(xpShowNetBtn, xpSettings.showNet !== false);
            updateButtonState(xpShowPriceBtn, xpSettings.showPrice !== false);
            updateButtonState(xpShowTotalVolumeBtn, xpSettings.showTotalVolume !== false);
            updateButtonState(xpShowLevelBtn, xpSettings.showLevel !== false);
            console.log("✅ Loaded XP settings:", xpSettings);
        } catch (error) {
            console.error("❌ Failed to load XP settings:", error);
            xpListLengthInput.value = 25; // fallback
            xpShowHeadersToggle.checked = false; // fallback
            updateButtonState(xpShowUpXpBtn, true); // fallback
            updateButtonState(xpShowDownXpBtn, true); // fallback
            updateButtonState(xpShowRatioBtn, true); // fallback
            updateButtonState(xpShowTotalBtn, true); // fallback
            updateButtonState(xpShowNetBtn, true); // fallback
            updateButtonState(xpShowPriceBtn, true); // fallback
            updateButtonState(xpShowTotalVolumeBtn, true); // fallback
            updateButtonState(xpShowLevelBtn, true); // fallback
        }
    }

    // Load initial HOD settings
    async function loadHodSettings() {
        try {
            const hodSettings = await window.hodSettingsAPI.get();
            hodListLengthInput.value = hodSettings.listLength || 10;
            console.log("✅ Loaded HOD settings:", hodSettings);
        } catch (error) {
            console.error("❌ Failed to load HOD settings:", error);
            hodListLengthInput.value = 10; // fallback
        }
    }

    // Save XP settings
    async function saveXpSettings() {
        try {
            const newLength = parseInt(xpListLengthInput.value, 10) || 25;
            const clampedLength = Math.max(1, Math.min(50, newLength));
            
            if (clampedLength !== newLength) {
                xpListLengthInput.value = clampedLength;
            }
            
            const currentShowHeaders = xpShowHeadersToggle.checked;
            await window.xpSettingsAPI.set({ listLength: clampedLength, showHeaders: currentShowHeaders });
            console.log("✅ Saved XP list length:", clampedLength);
        } catch (error) {
            console.error("❌ Failed to save XP settings:", error);
        }
    }

    // Save XP show headers setting
    async function saveXpShowHeaders() {
        try {
            const showHeaders = xpShowHeadersToggle.checked;
            const currentLength = parseInt(xpListLengthInput.value, 10) || 25;
            await window.xpSettingsAPI.set({ showHeaders, listLength: currentLength });
            console.log("✅ Saved XP show headers:", showHeaders);
        } catch (error) {
            console.error("❌ Failed to save XP show headers setting:", error);
        }
    }

    // Save XP show up XP setting
    async function saveXpShowUpXp() {
        try {
            const showUpXp = xpShowUpXpBtn.classList.contains('active');
            const currentLength = parseInt(xpListLengthInput.value, 10) || 25;
            await window.xpSettingsAPI.set({ showUpXp, listLength: currentLength });
            console.log("✅ Saved XP show up XP:", showUpXp);
        } catch (error) {
            console.error("❌ Failed to save XP show up XP setting:", error);
        }
    }

    // Save XP show down XP setting
    async function saveXpShowDownXp() {
        try {
            const showDownXp = xpShowDownXpBtn.classList.contains('active');
            const currentLength = parseInt(xpListLengthInput.value, 10) || 25;
            await window.xpSettingsAPI.set({ showDownXp, listLength: currentLength });
            console.log("✅ Saved XP show down XP:", showDownXp);
        } catch (error) {
            console.error("❌ Failed to save XP show down XP setting:", error);
        }
    }

    // Save XP show ratio setting
    async function saveXpShowRatio() {
        try {
            const showRatio = xpShowRatioBtn.classList.contains('active');
            const currentLength = parseInt(xpListLengthInput.value, 10) || 25;
            await window.xpSettingsAPI.set({ showRatio, listLength: currentLength });
            console.log("✅ Saved XP show ratio:", showRatio);
        } catch (error) {
            console.error("❌ Failed to save XP show ratio setting:", error);
        }
    }

    // Save XP show total setting
    async function saveXpShowTotal() {
        try {
            const showTotal = xpShowTotalBtn.classList.contains('active');
            const currentLength = parseInt(xpListLengthInput.value, 10) || 25;
            await window.xpSettingsAPI.set({ showTotal, listLength: currentLength });
            console.log("✅ Saved XP show total:", showTotal);
        } catch (error) {
            console.error("❌ Failed to save XP show total setting:", error);
        }
    }

    // Save XP show net setting
    async function saveXpShowNet() {
        try {
            const showNet = xpShowNetBtn.classList.contains('active');
            const currentLength = parseInt(xpListLengthInput.value, 10) || 25;
            await window.xpSettingsAPI.set({ showNet, listLength: currentLength });
            console.log("✅ Saved XP show net:", showNet);
        } catch (error) {
            console.error("❌ Failed to save XP show net setting:", error);
        }
    }

    // Save XP show price setting
    async function saveXpShowPrice() {
        try {
            const showPrice = xpShowPriceBtn.classList.contains('active');
            const currentLength = parseInt(xpListLengthInput.value, 10) || 25;
            await window.xpSettingsAPI.set({ showPrice, listLength: currentLength });
            console.log("✅ Saved XP show price:", showPrice);
        } catch (error) {
            console.error("❌ Failed to save XP show price setting:", error);
        }
    }

    // Save XP show total volume setting
    async function saveXpShowTotalVolume() {
        try {
            const showTotalVolume = xpShowTotalVolumeBtn.classList.contains('active');
            const currentLength = parseInt(xpListLengthInput.value, 10) || 25;
            await window.xpSettingsAPI.set({ showTotalVolume, listLength: currentLength });
            console.log("✅ Saved XP show total volume:", showTotalVolume);
        } catch (error) {
            console.error("❌ Failed to save XP show total volume setting:", error);
        }
    }

    // Save XP show level setting
    async function saveXpShowLevel() {
        try {
            const showLevel = xpShowLevelBtn.classList.contains('active');
            const currentLength = parseInt(xpListLengthInput.value, 10) || 25;
            await window.xpSettingsAPI.set({ showLevel, listLength: currentLength });
            console.log("✅ Saved XP show level:", showLevel);
        } catch (error) {
            console.error("❌ Failed to save XP show level setting:", error);
        }
    }

    // Save HOD settings
    async function saveHodSettings() {
        try {
            const newLength = parseInt(hodListLengthInput.value, 10) || 10;
            const clampedLength = Math.max(1, Math.min(50, newLength));
            
            if (clampedLength !== newLength) {
                hodListLengthInput.value = clampedLength;
            }
            
            await window.hodSettingsAPI.set({ listLength: clampedLength });
            console.log("✅ Saved HOD list length:", clampedLength);
        } catch (error) {
            console.error("❌ Failed to save HOD settings:", error);
        }
    }

    // Helper function to update button state
    function updateButtonState(button, isActive) {
        if (isActive) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    }

    // Toggle functions for column buttons
    async function toggleXpShowUpXp() {
        const isActive = xpShowUpXpBtn.classList.contains('active');
        updateButtonState(xpShowUpXpBtn, !isActive);
        await saveXpShowUpXp();
    }

    async function toggleXpShowDownXp() {
        const isActive = xpShowDownXpBtn.classList.contains('active');
        updateButtonState(xpShowDownXpBtn, !isActive);
        await saveXpShowDownXp();
    }

    async function toggleXpShowRatio() {
        const isActive = xpShowRatioBtn.classList.contains('active');
        updateButtonState(xpShowRatioBtn, !isActive);
        await saveXpShowRatio();
    }

    async function toggleXpShowTotal() {
        const isActive = xpShowTotalBtn.classList.contains('active');
        updateButtonState(xpShowTotalBtn, !isActive);
        await saveXpShowTotal();
    }

    async function toggleXpShowNet() {
        const isActive = xpShowNetBtn.classList.contains('active');
        updateButtonState(xpShowNetBtn, !isActive);
        await saveXpShowNet();
    }

    async function toggleXpShowPrice() {
        const isActive = xpShowPriceBtn.classList.contains('active');
        updateButtonState(xpShowPriceBtn, !isActive);
        await saveXpShowPrice();
    }

    async function toggleXpShowTotalVolume() {
        const isActive = xpShowTotalVolumeBtn.classList.contains('active');
        updateButtonState(xpShowTotalVolumeBtn, !isActive);
        await saveXpShowTotalVolume();
    }

    async function toggleXpShowLevel() {
        const isActive = xpShowLevelBtn.classList.contains('active');
        updateButtonState(xpShowLevelBtn, !isActive);
        await saveXpShowLevel();
    }

    // Load initial settings
    loadXpSettings();
    loadHodSettings();

    // Listen for changes
    xpListLengthInput.addEventListener("input", saveXpSettings);
    xpShowHeadersToggle.addEventListener("change", saveXpShowHeaders);
    xpShowUpXpBtn.addEventListener("click", toggleXpShowUpXp);
    xpShowDownXpBtn.addEventListener("click", toggleXpShowDownXp);
    xpShowRatioBtn.addEventListener("click", toggleXpShowRatio);
    xpShowTotalBtn.addEventListener("click", toggleXpShowTotal);
    xpShowNetBtn.addEventListener("click", toggleXpShowNet);
    xpShowPriceBtn.addEventListener("click", toggleXpShowPrice);
    xpShowTotalVolumeBtn.addEventListener("click", toggleXpShowTotalVolume);
    xpShowLevelBtn.addEventListener("click", toggleXpShowLevel);
    hodListLengthInput.addEventListener("input", saveHodSettings);

    // Listen for updates from other windows
    window.xpSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings) {
            if (updatedSettings.listLength !== undefined) {
                xpListLengthInput.value = updatedSettings.listLength;
                console.log("✅ XP list length updated from other window:", updatedSettings.listLength);
            }
            if (updatedSettings.showHeaders !== undefined) {
                xpShowHeadersToggle.checked = updatedSettings.showHeaders;
                console.log("✅ XP show headers updated from other window:", updatedSettings.showHeaders);
            }
            if (updatedSettings.showUpXp !== undefined) {
                updateButtonState(xpShowUpXpBtn, updatedSettings.showUpXp);
                console.log("✅ XP show up XP updated from other window:", updatedSettings.showUpXp);
            }
            if (updatedSettings.showDownXp !== undefined) {
                updateButtonState(xpShowDownXpBtn, updatedSettings.showDownXp);
                console.log("✅ XP show down XP updated from other window:", updatedSettings.showDownXp);
            }
            if (updatedSettings.showRatio !== undefined) {
                updateButtonState(xpShowRatioBtn, updatedSettings.showRatio);
                console.log("✅ XP show ratio updated from other window:", updatedSettings.showRatio);
            }
            if (updatedSettings.showTotal !== undefined) {
                updateButtonState(xpShowTotalBtn, updatedSettings.showTotal);
                console.log("✅ XP show total updated from other window:", updatedSettings.showTotal);
            }
            if (updatedSettings.showNet !== undefined) {
                updateButtonState(xpShowNetBtn, updatedSettings.showNet);
                console.log("✅ XP show net updated from other window:", updatedSettings.showNet);
            }
            if (updatedSettings.showPrice !== undefined) {
                updateButtonState(xpShowPriceBtn, updatedSettings.showPrice);
                console.log("✅ XP show price updated from other window:", updatedSettings.showPrice);
            }
            if (updatedSettings.showTotalVolume !== undefined) {
                updateButtonState(xpShowTotalVolumeBtn, updatedSettings.showTotalVolume);
                console.log("✅ XP show total volume updated from other window:", updatedSettings.showTotalVolume);
            }
            if (updatedSettings.showLevel !== undefined) {
                updateButtonState(xpShowLevelBtn, updatedSettings.showLevel);
                console.log("✅ XP show level updated from other window:", updatedSettings.showLevel);
            }
        }
    });

    window.hodSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings && updatedSettings.listLength !== undefined) {
            hodListLengthInput.value = updatedSettings.listLength;
            console.log("✅ HOD settings updated from other window:", updatedSettings);
        }
    });
}

function initializeStatsSettingsSection() {
    console.log("Initializing Stats Settings Section");

    const statsListLengthInput = document.getElementById("stats-list-length");
    
    if (!statsListLengthInput) {
        console.error("❌ Stats list length input not found!");
        return;
    }

    // Load initial value from electron store
    async function loadStatsSettings() {
        try {
            const statsSettings = await window.statsSettingsAPI.get();
            statsListLengthInput.value = statsSettings.listLength || 25;
            console.log("✅ Loaded Stats settings:", statsSettings);
        } catch (error) {
            console.error("❌ Failed to load Stats settings:", error);
            statsListLengthInput.value = 25; // fallback
        }
    }

    // Save Stats settings
    async function saveStatsSettings() {
        try {
            const newLength = parseInt(statsListLengthInput.value, 10) || 25;
            const clampedLength = Math.max(1, Math.min(50, newLength));
            
            if (clampedLength !== newLength) {
                statsListLengthInput.value = clampedLength;
            }
            
            await window.statsSettingsAPI.set({ listLength: clampedLength });
            console.log("✅ Saved Stats list length:", clampedLength);
        } catch (error) {
            console.error("❌ Failed to save Stats settings:", error);
        }
    }

    // Load initial settings
    loadStatsSettings();

    // Listen for changes
    statsListLengthInput.addEventListener("input", saveStatsSettings);

    // Listen for updates from other windows
    window.statsSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings && updatedSettings.listLength !== undefined) {
            statsListLengthInput.value = updatedSettings.listLength;
            console.log("✅ Stats settings updated from other window:", updatedSettings);
        }
    });
}
