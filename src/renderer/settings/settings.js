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
        initializeChangeSettingsSection();
        initializeStatsSettingsSection();
        
        // Set up settings update handler to reload test settings
        window.settingsAPI.onUpdate(async (updated) => {
            window.settings = updated || {};
        });

        // Set up HOD settings update handler - moved to after initialization
        // window.hodSettingsAPI.onUpdate(async (updated) => {
        //     if (updated) {
        //         if (updated.chimeVolume !== undefined) {
        //         hodChimeVolumeSlider.value = updated.chimeVolume;
        //         hodChimeValue.textContent = Math.round(updated.chimeVolume * 100) + "%";
        //         }
        //         if (updated.tickVolume !== undefined) {
        //         hodTickVolumeSlider.value = updated.tickVolume;
        //         hodTickValue.textContent = Math.round(updated.tickVolume * 100) + "%";
        //         }
        //         if (updated.symbolLength !== undefined && hodSymbolLengthInput) {
        //         hodSymbolLengthInput.value = updated.symbolLength;
        //         }
        //         console.log("✅ HOD settings updated from other window:", updated);
        //         }
        // });

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
    
    const showScrollChangeToggle = document.getElementById("show-scrollChange");
    showScrollChangeToggle.checked = window.windowSettings.scrollChangeWindow?.isOpen ?? false;
    
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

    const showHaltsToggle = document.getElementById("show-halts");
    showHaltsToggle.checked = window.windowSettings.haltsWindow?.isOpen ?? false;

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

    showScrollChangeToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.scrollChangeAPI.activate();
        } else {
            window.scrollChangeAPI.deactivate();
        }

        await window.windowSettingsAPI.setOpenState("scrollChangeWindow", event.target.checked);
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

    showHaltsToggle.addEventListener("change", async (event) => {
        if (event.target.checked) {
            window.haltAPI.activate();
        } else {
            window.haltAPI.deactivate();
        }

        await window.windowSettingsAPI.setOpenState("haltsWindow", event.target.checked);
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
    const hodSymbolLengthInput = document.getElementById("hod-symbol-length");
    const eventsComboVolumeSlider = document.getElementById("events-combo-volume");
    const eventsComboValue = document.getElementById("events-combo-volume-value");
    const newsAlertVolumeSlider = document.getElementById("news-alert-volume");
    const newsAlertValue = document.getElementById("news-alert-volume-value");

    // Ensure all elements exist before proceeding
    if (!hodChimeVolumeSlider || !hodTickVolumeSlider || !hodChimeValue || !hodTickValue || !eventsComboVolumeSlider || !eventsComboValue || !newsAlertVolumeSlider || !newsAlertValue) {
        console.error("❌ Audio control elements not found:", {
            hodChimeVolumeSlider,
            hodTickVolumeSlider,
            hodChimeValue,
            hodTickValue,
            eventsComboVolumeSlider,
            eventsComboValue,
            newsAlertVolumeSlider,
            newsAlertValue
        });
        return;
    }

    // ensure events settings structure + defaults
    window.settings ||= {};
    const before = JSON.stringify(window.settings);

    window.settings.events ||= {}; // ✅ this was missing

    if (typeof window.settings.events.comboVolume !== "number") window.settings.events.comboVolume = 0.5;

    if (typeof window.settings.events.newsAlertVolume !== "number") window.settings.events.newsAlertVolume = 0.5;

    const after = JSON.stringify(window.settings);
    if (before !== after) {
        // only write if we actually added defaults
        window.settingsAPI.update(window.settings).catch(() => {});
    }

    // Load HOD settings from electron store
    async function loadHodSettings() {
        try {
            const hodSettings = await window.hodSettingsAPI.get();
            hodChimeVolumeSlider.value = hodSettings.chimeVolume || 0.05;
            hodTickVolumeSlider.value = hodSettings.tickVolume || 0.05;
            if (hodSymbolLengthInput) {
                hodSymbolLengthInput.value = hodSettings.symbolLength || 10;
            }
            hodChimeValue.textContent = Math.round((hodSettings.chimeVolume || 0.05) * 100) + "%";
            hodTickValue.textContent = Math.round((hodSettings.tickVolume || 0.05) * 100) + "%";
            console.log(`[Settings] Loaded HOD settings:`, hodSettings);
        } catch (error) {
            console.error(`[Settings] Failed to load HOD settings:`, error);
            // Set defaults
            hodChimeVolumeSlider.value = 0.05;
            hodTickVolumeSlider.value = 0.05;
            if (hodSymbolLengthInput) {
                hodSymbolLengthInput.value = 10;
            }
            hodChimeValue.textContent = "5%";
            hodTickValue.textContent = "5%";
        }
    }

    // Load initial HOD settings
    loadHodSettings();

    // set UI from settings
    eventsComboVolumeSlider.value = window.settings.events.comboVolume;
    eventsComboValue.textContent = Math.round(window.settings.events.comboVolume * 100) + "%";
    newsAlertVolumeSlider.value = window.settings.events.newsAlertVolume;
    newsAlertValue.textContent = Math.round(window.settings.events.newsAlertVolume * 100) + "%";

    // wire inputs → settings (parse to number, clamp 0..1)
    hodChimeVolumeSlider.addEventListener("input", async (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, 0, 1);
        hodChimeValue.textContent = Math.round(v * 100) + "%";
        console.log(`[Settings] Saving chime volume: ${v}`);
        await window.hodSettingsAPI.set({ chimeVolume: v });
    });

    hodTickVolumeSlider.addEventListener("input", async (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, 0, 1);
        hodTickValue.textContent = Math.round(v * 100) + "%";
        await window.hodSettingsAPI.set({ tickVolume: v });
    });

    // HOD symbol length input
    if (hodSymbolLengthInput) {
        hodSymbolLengthInput.addEventListener("input", async (e) => {
            const v = Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 10));
            await window.hodSettingsAPI.set({ symbolLength: v });
        });
    }

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
    document.getElementById("test-chime-btn").addEventListener("click", async () => {
        console.log("Testing chime...");
        try {
            if (window.audioTestAPI?.testChimeAlert) {
                const result = await window.audioTestAPI.testChimeAlert();
                console.log("Chime test result:", result);
            } else {
                console.warn("audioTestAPI.testChimeAlert not available");
            }
        } catch (error) {
            console.error("Error testing chime:", error);
        }
    });

    document.getElementById("test-tick-btn").addEventListener("click", async () => {
        console.log("Testing tick...");
        try {
            if (window.audioTestAPI?.testTickAlert) {
                const result = await window.audioTestAPI.testTickAlert();
                console.log("Tick test result:", result);
            } else {
                console.warn("audioTestAPI.testTickAlert not available");
            }
        } catch (error) {
            console.error("Error testing tick:", error);
        }
    });

    document.getElementById("test-combo-btn").addEventListener("click", async () => {
        console.log("Testing combo alert...");
        try {
            if (window.audioTestAPI?.testComboAlert) {
                const result = await window.audioTestAPI.testComboAlert();
                console.log("Combo test result:", result);
            } else {
                console.warn("audioTestAPI.testComboAlert not available");
            }
        } catch (error) {
            console.error("Error testing combo alert:", error);
        }
    });

    document.getElementById("test-news-btn").addEventListener("click", async () => {
        console.log("Testing news alert...");
        try {
            if (window.audioTestAPI?.testNewsAlert) {
                const result = await window.audioTestAPI.testNewsAlert();
                console.log("News test result:", result);
            } else {
                console.warn("audioTestAPI.testNewsAlert not available");
            }
        } catch (error) {
            console.error("Error testing news alert:", error);
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

    // Set up HOD settings update handler after elements are initialized
    window.hodSettingsAPI.onUpdate(async (updated) => {
        if (updated) {
            if (updated.chimeVolume !== undefined && hodChimeVolumeSlider) {
                hodChimeVolumeSlider.value = updated.chimeVolume;
                hodChimeValue.textContent = Math.round(updated.chimeVolume * 100) + "%";
            }
            if (updated.tickVolume !== undefined && hodTickVolumeSlider) {
                hodTickVolumeSlider.value = updated.tickVolume;
                hodTickValue.textContent = Math.round(updated.tickVolume * 100) + "%";
            }
            if (updated.symbolLength !== undefined && hodSymbolLengthInput) {
                hodSymbolLengthInput.value = updated.symbolLength;
            }
            console.log("✅ HOD settings updated from other window:", updated);
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
        window.settings.news = { filteredTickers: [] };
    }

    console.log("🔍 Checking loaded news settings:", window.settings.news);

    // ✅ News Settings (Max Length)
    const newsListLengthInput = document.getElementById("news-list-length");
    
    if (newsListLengthInput) {
        // Load initial news settings
        async function loadNewsSettings() {
            try {
                const newsSettings = await window.newsSettingsAPI.get();
                newsListLengthInput.value = newsSettings.listLength || 50;
                
                // Update the lists from news store
                updateLists(newsSettings);
                
                console.log("✅ Loaded News settings:", newsSettings);
            } catch (error) {
                console.error("❌ Failed to load News settings:", error);
                newsListLengthInput.value = 50; // fallback
            }
        }

        // Save news settings
        async function saveNewsSettings() {
            try {
                const newLength = parseInt(newsListLengthInput.value, 10) || 50;
                const clampedLength = Math.max(1, Math.min(200, newLength));
                
                if (clampedLength !== newLength) {
                    newsListLengthInput.value = clampedLength;
                }
                
                await window.newsSettingsAPI.set({ listLength: clampedLength });
                console.log("✅ Saved News list length:", clampedLength);
            } catch (error) {
                console.error("❌ Failed to save News settings:", error);
            }
        }

        // Load initial settings
        loadNewsSettings();

        // Listen for changes
        newsListLengthInput.addEventListener("input", saveNewsSettings);

        // Listen for updates from other windows
        window.newsSettingsAPI.onUpdate((updatedSettings) => {
            if (updatedSettings) {
                if (updatedSettings.listLength !== undefined) {
                    newsListLengthInput.value = updatedSettings.listLength;
                }
                
                // Update the lists if they're included in the update
                if (updatedSettings.blockList || updatedSettings.bullishList || updatedSettings.bearishList) {
                    updateLists(updatedSettings);
                }
                
                console.log("✅ News settings updated from other window:", updatedSettings);
            }
        });
    } else {
        console.warn("❌ News list length input not found in News section");
    }


    // ✅ Initialize keyword management
    setupKeywordManagement();
    
    // ✅ Initialize search functionality
    setupListSearch();
}

// Global function to render a list - accessible from updateLists
function renderList(element, items, listType) {
    if (!Array.isArray(items)) {
        console.error(`❌ Expected an array but got:`, items);
        items = []; // Fallback to an empty array
    }

    if (!element) {
        console.error(`❌ Element not found for list type: ${listType}`);
        return;
    }

    element.innerHTML = "";

    items.forEach((keyword) => {
        const li = document.createElement("li");
        li.textContent = keyword;

        // ✅ Remove button for each keyword
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "X";
        removeBtn.addEventListener("click", async () => {
            try {
                const latestNewsSettings = await window.newsSettingsAPI.get();
                if (!latestNewsSettings) {
                    console.error("❌ Failed to fetch latest news settings. Skipping update.");
                    return;
                }

                // ✅ Remove the keyword by filtering (prevents index issues)
                const currentList = latestNewsSettings[listType] || [];
                const updatedList = currentList.filter((item) => item !== keyword);

                // Update the specific list using the news store API
                if (listType === 'blockList') {
                    await window.newsSettingsAPI.setBlockList(updatedList);
                } else if (listType === 'bullishList') {
                    await window.newsSettingsAPI.setBullishList(updatedList);
                } else if (listType === 'bearishList') {
                    await window.newsSettingsAPI.setBearishList(updatedList);
                }

                console.log(`✅ Removed keyword "${keyword}" from ${listType}`);
            } catch (error) {
                console.error(`❌ Error removing keyword "${keyword}":`, error);
            }
        });

        li.appendChild(removeBtn);
        element.appendChild(li);
    });
}

// Global function to update lists - accessible from both news section and keyword management
function updateLists(updatedSettings) {
    const blockListEl = document.getElementById("block-list");
    const bullishEl = document.getElementById("bullish-list");
    const bearishEl = document.getElementById("bearish-list");
    
    if (!blockListEl || !bullishEl || !bearishEl) {
        console.warn("⚠️ List elements not found, skipping update");
        return;
    }
    
    // 🔄 Use the latest settings (avoid stale data)
    const settings = updatedSettings || window.settings || {};

    // Provide default empty arrays if lists are undefined
    const blockList = settings.blockList || [];
    const bullishList = settings.bullishList || [];
    const bearishList = settings.bearishList || [];

    renderList(blockListEl, blockList, "blockList");
    renderList(bullishEl, bullishList, "bullishList");
    renderList(bearishEl, bearishList, "bearishList");
}

function setupKeywordManagement() {
    const keywordType = document.getElementById("keyword-type");
    const keywordInput = document.getElementById("keyword-input");
    const addKeywordBtn = document.getElementById("add-keyword");

    const blockListEl = document.getElementById("block-list");
    const bullishEl = document.getElementById("bullish-list");
    const bearishEl = document.getElementById("bearish-list");

    // ✅ Add new keyword to the selected list
    addKeywordBtn.addEventListener("click", async () => {
        const keyword = keywordInput.value.trim();
        if (!keyword) return;

        try {
            const latestNewsSettings = await window.newsSettingsAPI.get();
            if (!latestNewsSettings) {
                console.error("❌ Failed to fetch latest news settings. Skipping update.");
                return;
            }

            const listType = keywordType.value;
            const currentList = latestNewsSettings[listType] || [];

            if (!currentList.includes(keyword)) {
                // ✅ Add keyword to the list
                const updatedList = [...currentList, keyword];
                
                // Update the specific list using the news store API
                if (listType === 'blockList') {
                    await window.newsSettingsAPI.setBlockList(updatedList);
                } else if (listType === 'bullishList') {
                    await window.newsSettingsAPI.setBullishList(updatedList);
                } else if (listType === 'bearishList') {
                    await window.newsSettingsAPI.setBearishList(updatedList);
                }

                console.log(`✅ Added keyword "${keyword}" to ${listType}`);
            }
        } catch (error) {
            console.error(`❌ Error adding keyword "${keyword}":`, error);
        }

        keywordInput.value = ""; // Clear input field
    });
}

// Utility functions for button state management
function updateButtonState(button, isActive) {
    if (isActive) {
        button.classList.add('active');
    } else {
        button.classList.remove('active');
    }
}

function toggleButtonState(button) {
    const isActive = button.classList.contains('active');
    updateButtonState(button, !isActive);
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
    const xpShowSessionChangeBtn = document.getElementById("xp-show-session-change");
    
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

    if (!xpShowSessionChangeBtn) {
        console.error("❌ XP show session change button not found!");
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
            updateButtonState(xpShowSessionChangeBtn, xpSettings.showSessionChange !== false);
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
            updateButtonState(xpShowSessionChangeBtn, true); // fallback
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
            
            // Get current settings to preserve all existing values
            const currentSettings = await window.xpSettingsAPI.get();
            const currentShowHeaders = xpShowHeadersToggle.checked;
            
            // Update only the list length and headers, preserve all other settings
            await window.xpSettingsAPI.set({ 
                ...currentSettings,
                listLength: clampedLength, 
                showHeaders: currentShowHeaders 
            });
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

    // Save XP show session change setting
    async function saveXpShowSessionChange() {
        try {
            const showSessionChange = xpShowSessionChangeBtn.classList.contains('active');
            const currentLength = parseInt(xpListLengthInput.value, 10) || 25;
            await window.xpSettingsAPI.set({ showSessionChange, listLength: currentLength });
            console.log("✅ Saved XP show session change:", showSessionChange);
        } catch (error) {
            console.error("❌ Failed to save XP show session change setting:", error);
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

    async function toggleXpShowSessionChange() {
        const isActive = xpShowSessionChangeBtn.classList.contains('active');
        updateButtonState(xpShowSessionChangeBtn, !isActive);
        await saveXpShowSessionChange();
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
    xpShowSessionChangeBtn.addEventListener("click", toggleXpShowSessionChange);
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
            if (updatedSettings.showSessionChange !== undefined) {
                updateButtonState(xpShowSessionChangeBtn, updatedSettings.showSessionChange);
                console.log("✅ XP show session change updated from other window:", updatedSettings.showSessionChange);
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

function initializeChangeSettingsSection() {
    console.log("Initializing Change Settings Section");

    const changeListLengthInput = document.getElementById("change-list-length");
    const changeShowHeadersToggle = document.getElementById("change-show-headers");
    const changeShowUpXpBtn = document.getElementById("change-show-up-xp");
    const changeShowDownXpBtn = document.getElementById("change-show-down-xp");
    const changeShowRatioBtn = document.getElementById("change-show-ratio");
    const changeShowTotalBtn = document.getElementById("change-show-total");
    const changeShowNetBtn = document.getElementById("change-show-net");
    const changeShowPriceBtn = document.getElementById("change-show-price");
    const changeShowTotalVolumeBtn = document.getElementById("change-show-total-volume");
    const changeShowLevelBtn = document.getElementById("change-show-level");
    const changeShowSessionChangeBtn = document.getElementById("change-show-session-change");
    
    if (!changeListLengthInput) {
        console.error("❌ Change list length input not found!");
        return;
    }

    if (!changeShowHeadersToggle) {
        console.error("❌ Change show headers toggle not found!");
        return;
    }

    if (!changeShowUpXpBtn) {
        console.error("❌ Change show up XP button not found!");
        return;
    }

    if (!changeShowDownXpBtn) {
        console.error("❌ Change show down XP button not found!");
        return;
    }

    if (!changeShowRatioBtn) {
        console.error("❌ Change show ratio button not found!");
        return;
    }

    if (!changeShowTotalBtn) {
        console.error("❌ Change show total button not found!");
        return;
    }

    if (!changeShowNetBtn) {
        console.error("❌ Change show net button not found!");
        return;
    }

    if (!changeShowPriceBtn) {
        console.error("❌ Change show price button not found!");
        return;
    }

    if (!changeShowTotalVolumeBtn) {
        console.error("❌ Change show total volume button not found!");
        return;
    }

    if (!changeShowLevelBtn) {
        console.error("❌ Change show level button not found!");
        return;
    }

    if (!changeShowSessionChangeBtn) {
        console.error("❌ Change show session change button not found!");
        return;
    }

    // Load initial value from electron store
    async function loadChangeSettings() {
        try {
            const changeSettings = await window.changeSettingsAPI.get();
            changeListLengthInput.value = changeSettings.listLength || 25;
            changeShowHeadersToggle.checked = changeSettings.showHeaders || false;
            updateButtonState(changeShowUpXpBtn, changeSettings.showUpXp !== false);
            updateButtonState(changeShowDownXpBtn, changeSettings.showDownXp !== false);
            updateButtonState(changeShowRatioBtn, changeSettings.showRatio !== false);
            updateButtonState(changeShowTotalBtn, changeSettings.showTotal !== false);
            updateButtonState(changeShowNetBtn, changeSettings.showNet !== false);
            updateButtonState(changeShowPriceBtn, changeSettings.showPrice !== false);
            updateButtonState(changeShowTotalVolumeBtn, changeSettings.showTotalVolume !== false);
            updateButtonState(changeShowLevelBtn, changeSettings.showLevel !== false);
            updateButtonState(changeShowSessionChangeBtn, changeSettings.showSessionChange !== false);
            console.log("✅ Loaded Change settings:", changeSettings);
        } catch (error) {
            console.error("❌ Failed to load Change settings:", error);
            changeListLengthInput.value = 25; // fallback
            changeShowHeadersToggle.checked = false; // fallback
            updateButtonState(changeShowUpXpBtn, true); // fallback
            updateButtonState(changeShowDownXpBtn, true); // fallback
            updateButtonState(changeShowRatioBtn, true); // fallback
            updateButtonState(changeShowTotalBtn, true); // fallback
            updateButtonState(changeShowNetBtn, true); // fallback
            updateButtonState(changeShowPriceBtn, true); // fallback
            updateButtonState(changeShowTotalVolumeBtn, true); // fallback
            updateButtonState(changeShowLevelBtn, true); // fallback
            updateButtonState(changeShowSessionChangeBtn, true); // fallback
        }
    }

    // Save Change settings
    async function saveChangeSettings() {
        try {
            const newLength = parseInt(changeListLengthInput.value, 10) || 25;
            const clampedLength = Math.max(1, Math.min(50, newLength));
            
            if (clampedLength !== newLength) {
                changeListLengthInput.value = clampedLength;
            }
            
            // Get current settings to preserve all existing values
            const currentSettings = await window.changeSettingsAPI.get();
            const currentShowHeaders = changeShowHeadersToggle.checked;
            
            // Update only the list length and headers, preserve all other settings
            await window.changeSettingsAPI.set({ 
                ...currentSettings,
                listLength: clampedLength, 
                showHeaders: currentShowHeaders 
            });
            console.log("✅ Saved Change list length:", clampedLength);
        } catch (error) {
            console.error("❌ Failed to save Change settings:", error);
        }
    }

    // Save Change show headers setting
    async function saveChangeShowHeaders() {
        try {
            const showHeaders = changeShowHeadersToggle.checked;
            const currentLength = parseInt(changeListLengthInput.value, 10) || 25;
            await window.changeSettingsAPI.set({ showHeaders, listLength: currentLength });
            console.log("✅ Saved Change show headers:", showHeaders);
        } catch (error) {
            console.error("❌ Failed to save Change show headers setting:", error);
        }
    }

    // Save Change show up XP setting
    async function saveChangeShowUpXp() {
        try {
            const showUpXp = changeShowUpXpBtn.classList.contains('active');
            const currentLength = parseInt(changeListLengthInput.value, 10) || 25;
            await window.changeSettingsAPI.set({ showUpXp, listLength: currentLength });
            console.log("✅ Saved Change show up XP:", showUpXp);
        } catch (error) {
            console.error("❌ Failed to save Change show up XP setting:", error);
        }
    }

    // Save Change show down XP setting
    async function saveChangeShowDownXp() {
        try {
            const showDownXp = changeShowDownXpBtn.classList.contains('active');
            const currentLength = parseInt(changeListLengthInput.value, 10) || 25;
            await window.changeSettingsAPI.set({ showDownXp, listLength: currentLength });
            console.log("✅ Saved Change show down XP:", showDownXp);
        } catch (error) {
            console.error("❌ Failed to save Change show down XP setting:", error);
        }
    }

    // Save Change show ratio setting
    async function saveChangeShowRatio() {
        try {
            const showRatio = changeShowRatioBtn.classList.contains('active');
            const currentLength = parseInt(changeListLengthInput.value, 10) || 25;
            await window.changeSettingsAPI.set({ showRatio, listLength: currentLength });
            console.log("✅ Saved Change show ratio:", showRatio);
        } catch (error) {
            console.error("❌ Failed to save Change show ratio setting:", error);
        }
    }

    // Save Change show total setting
    async function saveChangeShowTotal() {
        try {
            const showTotal = changeShowTotalBtn.classList.contains('active');
            const currentLength = parseInt(changeListLengthInput.value, 10) || 25;
            await window.changeSettingsAPI.set({ showTotal, listLength: currentLength });
            console.log("✅ Saved Change show total:", showTotal);
        } catch (error) {
            console.error("❌ Failed to save Change show total setting:", error);
        }
    }

    // Save Change show net setting
    async function saveChangeShowNet() {
        try {
            const showNet = changeShowNetBtn.classList.contains('active');
            const currentLength = parseInt(changeListLengthInput.value, 10) || 25;
            await window.changeSettingsAPI.set({ showNet, listLength: currentLength });
            console.log("✅ Saved Change show net:", showNet);
        } catch (error) {
            console.error("❌ Failed to save Change show net setting:", error);
        }
    }

    // Save Change show price setting
    async function saveChangeShowPrice() {
        try {
            const showPrice = changeShowPriceBtn.classList.contains('active');
            const currentLength = parseInt(changeListLengthInput.value, 10) || 25;
            await window.changeSettingsAPI.set({ showPrice, listLength: currentLength });
            console.log("✅ Saved Change show price:", showPrice);
        } catch (error) {
            console.error("❌ Failed to save Change show price setting:", error);
        }
    }

    // Save Change show total volume setting
    async function saveChangeShowTotalVolume() {
        try {
            const showTotalVolume = changeShowTotalVolumeBtn.classList.contains('active');
            const currentLength = parseInt(changeListLengthInput.value, 10) || 25;
            await window.changeSettingsAPI.set({ showTotalVolume, listLength: currentLength });
            console.log("✅ Saved Change show total volume:", showTotalVolume);
        } catch (error) {
            console.error("❌ Failed to save Change show total volume setting:", error);
        }
    }

    // Save Change show level setting
    async function saveChangeShowLevel() {
        try {
            const showLevel = changeShowLevelBtn.classList.contains('active');
            const currentLength = parseInt(changeListLengthInput.value, 10) || 25;
            await window.changeSettingsAPI.set({ showLevel, listLength: currentLength });
            console.log("✅ Saved Change show level:", showLevel);
        } catch (error) {
            console.error("❌ Failed to save Change show level setting:", error);
        }
    }

    // Save Change show session change setting
    async function saveChangeShowSessionChange() {
        try {
            const showSessionChange = changeShowSessionChangeBtn.classList.contains('active');
            const currentLength = parseInt(changeListLengthInput.value, 10) || 25;
            await window.changeSettingsAPI.set({ showSessionChange, listLength: currentLength });
            console.log("✅ Saved Change show session change:", showSessionChange);
        } catch (error) {
            console.error("❌ Failed to save Change show session change setting:", error);
        }
    }

    // Load initial settings
    loadChangeSettings();

    // Add event listeners
    changeListLengthInput.addEventListener("input", saveChangeSettings);
    changeShowHeadersToggle.addEventListener("change", saveChangeShowHeaders);
    changeShowUpXpBtn.addEventListener("click", () => {
        toggleButtonState(changeShowUpXpBtn);
        saveChangeShowUpXp();
    });
    changeShowDownXpBtn.addEventListener("click", () => {
        toggleButtonState(changeShowDownXpBtn);
        saveChangeShowDownXp();
    });
    changeShowRatioBtn.addEventListener("click", () => {
        toggleButtonState(changeShowRatioBtn);
        saveChangeShowRatio();
    });
    changeShowTotalBtn.addEventListener("click", () => {
        toggleButtonState(changeShowTotalBtn);
        saveChangeShowTotal();
    });
    changeShowNetBtn.addEventListener("click", () => {
        toggleButtonState(changeShowNetBtn);
        saveChangeShowNet();
    });
    changeShowPriceBtn.addEventListener("click", () => {
        toggleButtonState(changeShowPriceBtn);
        saveChangeShowPrice();
    });
    changeShowTotalVolumeBtn.addEventListener("click", () => {
        toggleButtonState(changeShowTotalVolumeBtn);
        saveChangeShowTotalVolume();
    });
    changeShowLevelBtn.addEventListener("click", () => {
        toggleButtonState(changeShowLevelBtn);
        saveChangeShowLevel();
    });
    changeShowSessionChangeBtn.addEventListener("click", () => {
        toggleButtonState(changeShowSessionChangeBtn);
        saveChangeShowSessionChange();
    });

    // Set up change settings update handler
    window.changeSettingsAPI.onUpdate(async (updatedSettings) => {
        if (updatedSettings) {
            changeListLengthInput.value = updatedSettings.listLength || 25;
            changeShowHeadersToggle.checked = updatedSettings.showHeaders || false;
            updateButtonState(changeShowUpXpBtn, updatedSettings.showUpXp !== false);
            updateButtonState(changeShowDownXpBtn, updatedSettings.showDownXp !== false);
            updateButtonState(changeShowRatioBtn, updatedSettings.showRatio !== false);
            updateButtonState(changeShowTotalBtn, updatedSettings.showTotal !== false);
            updateButtonState(changeShowNetBtn, updatedSettings.showNet !== false);
            updateButtonState(changeShowPriceBtn, updatedSettings.showPrice !== false);
            updateButtonState(changeShowTotalVolumeBtn, updatedSettings.showTotalVolume !== false);
            updateButtonState(changeShowLevelBtn, updatedSettings.showLevel !== false);
            updateButtonState(changeShowSessionChangeBtn, updatedSettings.showSessionChange !== false);
            console.log("✅ Change settings updated from other window:", updatedSettings);
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
            statsListLengthInput.value = statsSettings.listLength || 50;
            console.log("✅ Loaded Stats settings:", statsSettings);
        } catch (error) {
            console.error("❌ Failed to load Stats settings:", error);
            statsListLengthInput.value = 50; // fallback
        }
    }

    // Save Stats settings
    async function saveStatsSettings() {
        try {
            const newLength = parseInt(statsListLengthInput.value, 10) || 50;
            const clampedLength = Math.max(1, Math.min(100, newLength));
            
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

// Setup search functionality for each list
function setupListSearch() {
    const searchInputs = {
        'block-search': 'block-list',
        'bullish-search': 'bullish-list', 
        'bearish-search': 'bearish-list'
    };

    Object.entries(searchInputs).forEach(([searchId, listId]) => {
        const searchInput = document.getElementById(searchId);
        const listElement = document.getElementById(listId);
        
        if (searchInput && listElement) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                filterListItems(listElement, searchTerm);
            });
        }
    });
}

// Filter list items based on search term
function filterListItems(listElement, searchTerm) {
    const items = listElement.querySelectorAll('li');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const matches = searchTerm === '' || text.includes(searchTerm);
        
        if (matches) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
    
    // Show/hide empty state
    const visibleItems = Array.from(items).filter(item => item.style.display !== 'none');
    const emptyState = listElement.querySelector('.empty-state');
    
    if (visibleItems.length === 0 && searchTerm !== '') {
        if (!emptyState) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.textContent = 'No matching keywords found';
            emptyDiv.style.cssText = `
                color: #888;
                font-style: italic;
                text-align: center;
                padding: 20px;
                font-size: 14px;
            `;
            listElement.appendChild(emptyDiv);
        }
    } else if (emptyState) {
        emptyState.remove();
    }
}
