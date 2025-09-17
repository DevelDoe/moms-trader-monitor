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
        console.log("Settings are now managed by Electron stores");
        
        // Fetch window settings from electron store
        console.log("Fetching window settings...");
        window.windowSettings = await window.windowSettingsAPI.getAll();
        console.log("Retrieved window settings:", window.windowSettings);

        await initializeGeneralSection();
        initializeWorldSettingsSection();
        initializeNewsSection();
        initializeAdminSection();
        initializeXpSettingsSection();
        initializeChangeSettingsSection();
        initializeFrontlineSettingsSection();
        initializeHeroesSettingsSection();
        initializeStatsSettingsSection();
        initializeFilingFiltersSection();
        
        // Settings are now managed by Electron stores

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
            await initializeGeneralSection();
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

async function initializeGeneralSection() {
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
    showProgressToggle.checked = window.windowSettings.progressWindow?.isOpen ?? false;

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

    // 🪞 Trader's View Subsettings - Exclusive Mode Selection
    const enableAutoModeToggle = document.getElementById("enableAutoMode");
    const traderviewModeSection = document.getElementById("traderview-mode-section");
    const heroesModeRadio = document.getElementById("heroesMode");
    const activeModeRadio = document.getElementById("activeMode");
    const enableAutoCloseToggle = document.getElementById("enableAutoClose");

    // Load initial values from traderview electron store
    let traderviewSettings = {};
    
    async function loadTraderviewSettings() {
        try {
            traderviewSettings = await window.traderviewSettingsAPI.get();
            const autoModeEnabled = traderviewSettings.enableHeroes || traderviewSettings.enableActiveChart;
            
            enableAutoModeToggle.checked = autoModeEnabled;
            
            // Set radio button based on which mode is enabled (exclusive)
            if (traderviewSettings.enableHeroes) {
                heroesModeRadio.checked = true;
            } else if (traderviewSettings.enableActiveChart) {
                activeModeRadio.checked = true;
            } else {
                // Default to active mode if neither is set but auto mode is enabled
                activeModeRadio.checked = autoModeEnabled;
            }
            
            enableAutoCloseToggle.checked = traderviewSettings.autoClose ?? true;
            
            console.log("✅ Loaded Traderview settings:", traderviewSettings);
        } catch (error) {
            console.error("❌ Failed to load Traderview settings:", error);
            // Fallback to defaults
            traderviewSettings = {
                visibility: false,
                enableHeroes: false,
                autoClose: true,
                enableActiveChart: true,
                autoCloseActive: true
            };
        }
    }
    
    // Load initial settings
    loadTraderviewSettings();

    // Show/hide mode section based on auto mode toggle
    function toggleModeSection() {
        if (enableAutoModeToggle.checked) {
            traderviewModeSection.style.display = 'block';
        } else {
            traderviewModeSection.style.display = 'none';
        }
    }
    
    toggleModeSection(); // Initial state

    // Auto Mode Toggle - Master switch
    enableAutoModeToggle.addEventListener("change", async (e) => {
        const autoModeEnabled = e.target.checked;
        
        try {
            if (!autoModeEnabled) {
                // Disable all modes when auto mode is turned off
                await window.traderviewSettingsAPI.set({
                    enableHeroes: false,
                    enableActiveChart: false
                });
                heroesModeRadio.checked = false;
                activeModeRadio.checked = false;
                
                // Close all TradingView windows when disabling auto mode
                if (window.traderviewAPI?.closeAllWindows) {
                    window.traderviewAPI.closeAllWindows();
                    console.log("🗑️ Closed all TradingView windows (auto mode disabled)");
                }
            } else {
                // When enabling auto mode, default to active mode
                activeModeRadio.checked = true;
                await window.traderviewSettingsAPI.set({
                    enableHeroes: false,
                    enableActiveChart: true
                });
            }
            
            toggleModeSection();
        } catch (error) {
            console.error("❌ Failed to save Traderview auto mode setting:", error);
        }
        console.log(`🔧 Auto TradingView Mode ${autoModeEnabled ? 'enabled' : 'disabled'}`);
    });

    // Mode selection - Exclusive radio buttons
    async function handleModeChange() {
        const isHeroesMode = heroesModeRadio.checked;
        const isActiveMode = activeModeRadio.checked;
        
        try {
            // Update settings with exclusive selection
            await window.traderviewSettingsAPI.set({
                enableHeroes: isHeroesMode,
                enableActiveChart: isActiveMode
            });
        } catch (error) {
            console.error("❌ Failed to save Traderview mode setting:", error);
        }
        
        if (isHeroesMode) {
            console.log(`🦸 Switched to Heroes TradingView Mode`);
            // Don't manually trigger openTickersNow - let the heroes window's natural update cycle handle it
            // This prevents closing all windows and reopening them
        } else if (isActiveMode) {
            console.log(`🎯 Switched to Active TradingView Mode`);
            // Don't manually trigger anything - let the active window's natural update cycle handle it
        }
    }

    heroesModeRadio.addEventListener("change", handleModeChange);
    activeModeRadio.addEventListener("change", handleModeChange);

    // Auto Close Toggle - Applies to both modes
    enableAutoCloseToggle.addEventListener("change", async (e) => {
        const autoClose = e.target.checked;
        
        try {
            await window.traderviewSettingsAPI.set({
                autoClose,
                autoCloseActive: autoClose // Use same setting for both
            });
            console.log(`🗑️ Auto-close TradingView windows ${autoClose ? 'enabled' : 'disabled'}`);
        } catch (error) {
            console.error("❌ Failed to save Traderview auto-close setting:", error);
        }
    });


    // elements
    const hodChimeVolumeSlider = document.getElementById("hod-chime-volume");
    const hodChimeValue = document.getElementById("hod-chime-volume-value");
    const hodSymbolLengthInput = document.getElementById("hod-symbol-length");
    const eventsComboVolumeSlider = document.getElementById("events-combo-volume");
    const eventsComboValue = document.getElementById("events-combo-volume-value");
    const newsAlertVolumeSlider = document.getElementById("news-alert-volume");
    const newsAlertValue = document.getElementById("news-alert-volume-value");
    const muteComboBtn = document.getElementById("mute-combo-btn");
    const muteNewsBtn = document.getElementById("mute-news-btn");
    const muteChimeBtn = document.getElementById("mute-chime-btn");

    // Ensure all elements exist before proceeding
    if (!hodChimeVolumeSlider || !hodChimeValue || !eventsComboVolumeSlider || !eventsComboValue || !newsAlertVolumeSlider || !newsAlertValue || !muteComboBtn || !muteNewsBtn || !muteChimeBtn) {
        console.error("❌ Audio control elements not found:", {
            hodChimeVolumeSlider,
            hodChimeValue,
            eventsComboVolumeSlider,
            eventsComboValue,
            newsAlertVolumeSlider,
            newsAlertValue,
            muteComboBtn,
            muteNewsBtn,
            muteChimeBtn
        });
        return;
    }

    // Audio settings now managed by centralized audio store
    let audioSettings = {};
    
    async function loadAudioSettings() {
        try {
            audioSettings = await window.audioSettingsAPI.get();
            console.log("🎵 Loaded audio settings:", audioSettings);
        } catch (error) {
            console.error("❌ Failed to load audio settings:", error);
            // Use fallback settings
            audioSettings = {
                comboVolume: 0.55,
                newsVolume: 0.8,
                hodChimeVolume: 0.05,
                comboMuted: false,
                newsMuted: false,
                chimeMuted: false
            };
        }
    }
    
    // Load initial audio settings
    await loadAudioSettings();

    // Load HOD settings from electron store (only symbol length now)
    async function loadHodSettings() {
        try {
            const hodSettings = await window.hodSettingsAPI.get();
            if (hodSymbolLengthInput) {
                hodSymbolLengthInput.value = hodSettings.symbolLength || 10;
            }
            console.log(`[Settings] Loaded HOD settings:`, hodSettings);
        } catch (error) {
            console.error(`[Settings] Failed to load HOD settings:`, error);
            // Set defaults
            if (hodSymbolLengthInput) {
                hodSymbolLengthInput.value = 10;
            }
        }
    }

    // Load initial HOD settings
    loadHodSettings();

    // set UI from centralized audio settings
    eventsComboVolumeSlider.value = audioSettings.comboVolume;
    eventsComboValue.textContent = Math.round(audioSettings.comboVolume * 100) + "%";
    newsAlertVolumeSlider.value = audioSettings.newsVolume;
    newsAlertValue.textContent = Math.round(audioSettings.newsVolume * 100) + "%";
    hodChimeVolumeSlider.value = audioSettings.hodChimeVolume;
    hodChimeValue.textContent = Math.round(audioSettings.hodChimeVolume * 100) + "%";
    
    // Update mute button states
    updateMuteButtonState(muteComboBtn, audioSettings.comboMuted || false);
    updateMuteButtonState(muteNewsBtn, audioSettings.newsMuted || false);
    updateMuteButtonState(muteChimeBtn, audioSettings.chimeMuted || false);

    // wire inputs → settings (parse to number, clamp 0..1)
    hodChimeVolumeSlider.addEventListener("input", async (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, 0, 1);
        audioSettings.hodChimeVolume = v;
        hodChimeValue.textContent = Math.round(v * 100) + "%";
        try {
            await window.audioSettingsAPI.set({ hodChimeVolume: v });
        } catch (error) {
            console.error("❌ Failed to save HOD chime volume:", error);
        }
    });


    // HOD symbol length input
    if (hodSymbolLengthInput) {
        hodSymbolLengthInput.addEventListener("input", async (e) => {
            const v = Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 10));
            await window.hodSettingsAPI.set({ symbolLength: v });
        });
    }

    eventsComboVolumeSlider.addEventListener("input", async (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, 0, 1);
        audioSettings.comboVolume = v;
        eventsComboValue.textContent = Math.round(v * 100) + "%";
        try {
            await window.audioSettingsAPI.set({ comboVolume: v });
        } catch (error) {
            console.error("❌ Failed to save combo volume:", error);
        }
    });

    newsAlertVolumeSlider.addEventListener("input", async (e) => {
        const v = clamp(parseFloat(e.target.value) || 0, 0, 1);
        audioSettings.newsVolume = v;
        newsAlertValue.textContent = Math.round(v * 100) + "%";
        try {
            await window.audioSettingsAPI.set({ newsVolume: v });
        } catch (error) {
            console.error("❌ Failed to save news volume:", error);
        }
    });

    function updateMuteButtonState(button, isMuted) {
        if (isMuted) {
            button.textContent = "🔊 Unmute";
            button.style.backgroundColor = "#f44336"; // Red when muted
        } else {
            button.textContent = "🔇 Mute";
            button.style.backgroundColor = "#4CAF50"; // Green when unmuted
        }
    }

    // Individual mute button event listeners
    muteComboBtn.addEventListener("click", async () => {
        const newMuted = !audioSettings.comboMuted;
        audioSettings.comboMuted = newMuted;
        updateMuteButtonState(muteComboBtn, newMuted);
        try {
            await window.audioSettingsAPI.set({ comboMuted: newMuted });
            console.log("🔇 Events combo mute setting saved:", newMuted);
        } catch (error) {
            console.error("❌ Failed to save combo mute setting:", error);
        }
    });

    muteNewsBtn.addEventListener("click", async () => {
        const newMuted = !audioSettings.newsMuted;
        audioSettings.newsMuted = newMuted;
        updateMuteButtonState(muteNewsBtn, newMuted);
        try {
            await window.audioSettingsAPI.set({ newsMuted: newMuted });
            console.log("🔇 News alert mute setting saved:", newMuted);
        } catch (error) {
            console.error("❌ Failed to save news mute setting:", error);
        }
    });

    muteChimeBtn.addEventListener("click", async () => {
        const newMuted = !audioSettings.chimeMuted;
        audioSettings.chimeMuted = newMuted;
        updateMuteButtonState(muteChimeBtn, newMuted);
        try {
            await window.audioSettingsAPI.set({ chimeMuted: newMuted });
            console.log("🔇 HOD chime mute setting saved:", newMuted);
        } catch (error) {
            console.error("❌ Failed to save chime mute setting:", error);
        }
    });

    // Test buttons for all audio types
    document.getElementById("test-chime-btn").addEventListener("click", async () => {
        console.log("Testing HOD chime...");
        try {
            if (window.audioAPI?.testHodChime) {
                await window.audioAPI.testHodChime();
                console.log("✅ HOD chime test completed");
            } else {
                console.warn("⚠️ audioAPI.testHodChime not available");
            }
        } catch (error) {
            console.error("❌ Error testing HOD chime:", error);
        }
    });


    document.getElementById("test-combo-btn").addEventListener("click", async () => {
        console.log("Testing events combo alert...");
        try {
            if (window.audioAPI?.testEventsCombo) {
                await window.audioAPI.testEventsCombo();
                console.log("✅ Events combo test completed");
            } else {
                console.warn("⚠️ audioAPI.testEventsCombo not available");
            }
        } catch (error) {
            console.error("❌ Error testing events combo:", error);
        }
    });

    document.getElementById("test-news-btn").addEventListener("click", async () => {
        console.log("Testing news alert...");
        try {
            if (window.audioAPI?.testNewsAlert) {
                await window.audioAPI.testNewsAlert();
                console.log("✅ News alert test completed");
            } else {
                console.warn("⚠️ audioAPI.testNewsAlert not available");
            }
        } catch (error) {
            console.error("❌ Error testing news alert:", error);
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

    // Set up HOD settings update handler after elements are initialized (only symbol length)
    window.hodSettingsAPI.onUpdate(async (updated) => {
        if (updated) {
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


function initializeWorldSettingsSection() {
    console.log("🌍 Initializing World Settings Section");

    const minPriceInput = document.getElementById("min-price");
    const maxPriceInput = document.getElementById("max-price");
    const minVolumeInput = document.getElementById("min-volume");
    const maxVolumeInput = document.getElementById("max-volume");
    const minFloatInput = document.getElementById("min-float");
    const maxFloatInput = document.getElementById("max-float");
    const minScoreInput = document.getElementById("min-score");
    const maxScoreInput = document.getElementById("max-score");
    const minChangePercentInput = document.getElementById("min-change-percent");

    // Ensure all elements exist
    if (!minPriceInput || !maxPriceInput || !minVolumeInput || !maxVolumeInput || 
        !minFloatInput || !maxFloatInput || !minScoreInput || !maxScoreInput || !minChangePercentInput) {
        console.error("❌ World Settings initialization error. Missing inputs:", {
            minPriceInput, maxPriceInput, minVolumeInput, maxVolumeInput,
            minFloatInput, maxFloatInput, minScoreInput, maxScoreInput, minChangePercentInput
        });
        return;
    }

    // Load initial values from world settings store
    async function loadWorldSettings() {
        try {
            const worldSettings = await window.worldSettingsAPI.get();
            console.log("✅ Loaded World settings:", worldSettings);
            
            minPriceInput.value = worldSettings.minPrice || "";
            maxPriceInput.value = worldSettings.maxPrice || "";
            minFloatInput.value = worldSettings.minFloat || "";
            maxFloatInput.value = worldSettings.maxFloat || "";
            minScoreInput.value = worldSettings.minScore || "";
            maxScoreInput.value = worldSettings.maxScore || "";
            minVolumeInput.value = worldSettings.minVolume || "";
            maxVolumeInput.value = worldSettings.maxVolume || "";
            minChangePercentInput.value = worldSettings.minChangePercent || "";
            
            // Set placeholders
            minPriceInput.placeholder = minPriceInput.value === "0" ? "No limit" : "";
            maxPriceInput.placeholder = maxPriceInput.value === "0" ? "No limit" : "";
            minFloatInput.placeholder = minFloatInput.value === "0" ? "No limit" : "";
            maxFloatInput.placeholder = maxFloatInput.value === "0" ? "No limit" : "";
            minScoreInput.placeholder = minScoreInput.value === "0" ? "No limit" : "";
            maxScoreInput.placeholder = maxScoreInput.value === "0" ? "No limit" : "";
            minVolumeInput.placeholder = minVolumeInput.value === "0" ? "No limit" : "";
            maxVolumeInput.placeholder = maxVolumeInput.value === "0" ? "No limit" : "";
            minChangePercentInput.placeholder = minChangePercentInput.value === "0" ? "No limit" : "";
        } catch (error) {
            console.error("❌ Failed to load World settings:", error);
        }
    }

    // Save world settings
    async function saveWorldSettings() {
        try {
            const worldSettings = {
                minPrice: Math.max(0, parseFloat(minPriceInput.value) || 0), // minPrice can be 0 to disable limit
                maxPrice: Math.max(0, parseFloat(maxPriceInput.value) || 0),
                minFloat: Math.max(0, parseFloat(minFloatInput.value) || 0),
                maxFloat: Math.max(0, parseFloat(maxFloatInput.value) || 0),
                minScore: Math.max(0, parseFloat(minScoreInput.value) || 0),
                maxScore: Math.max(0, parseFloat(maxScoreInput.value) || 0),
                minVolume: Math.max(0, parseFloat(minVolumeInput.value) || 0),
                maxVolume: Math.max(0, parseFloat(maxVolumeInput.value) || 0),
                minChangePercent: Math.max(0, parseFloat(minChangePercentInput.value) || 0),
            };
            
            await window.worldSettingsAPI.set(worldSettings);
            console.log("✅ Saved World settings:", worldSettings);
        } catch (error) {
            console.error("❌ Failed to save World settings:", error);
        }
    }

    // Load initial settings
    loadWorldSettings();

    // Add event listeners
    minPriceInput.addEventListener("input", saveWorldSettings);
    maxPriceInput.addEventListener("input", saveWorldSettings);
    minFloatInput.addEventListener("input", saveWorldSettings);
    maxFloatInput.addEventListener("input", saveWorldSettings);
    minScoreInput.addEventListener("input", saveWorldSettings);
    maxScoreInput.addEventListener("input", saveWorldSettings);
    minVolumeInput.addEventListener("input", saveWorldSettings);
    maxVolumeInput.addEventListener("input", saveWorldSettings);
    minChangePercentInput.addEventListener("input", saveWorldSettings);

    // Listen for updates from other windows
    window.worldSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings) {
            minPriceInput.value = updatedSettings.minPrice || "";
            maxPriceInput.value = updatedSettings.maxPrice || "";
            minFloatInput.value = updatedSettings.minFloat || "";
            maxFloatInput.value = updatedSettings.maxFloat || "";
            minScoreInput.value = updatedSettings.minScore || "";
            maxScoreInput.value = updatedSettings.maxScore || "";
            minVolumeInput.value = updatedSettings.minVolume || "";
            maxVolumeInput.value = updatedSettings.maxVolume || "";
            minChangePercentInput.value = updatedSettings.minChangePercent || "";
            console.log("✅ World settings updated from other window:", updatedSettings);
        }
    });

}

function initializeNewsSection() {
    console.log("🔍 Initializing news section with Electron stores");

    // ✅ News Settings (Max Length)
    const newsListLengthInput = document.getElementById("news-list-length");
    
    if (newsListLengthInput) {
        // Load initial news settings
        async function loadNewsSettings() {
            try {
                const newsSettings = await window.newsSettingsAPI.get();
                newsListLengthInput.value = newsSettings.listLength || 100;
                
                // Update the lists from news store
                updateLists(newsSettings);
                
                console.log("✅ Loaded News settings:", newsSettings);
            } catch (error) {
                console.error("❌ Failed to load News settings:", error);
                newsListLengthInput.value = 100; // fallback
            }
        }

        // Save news settings
        async function saveNewsSettings() {
            try {
                const newLength = parseInt(newsListLengthInput.value, 10) || 100;
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
            const clampedLength = Math.max(1, Math.min(100, newLength));
            
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
            const clampedLength = Math.max(1, Math.min(100, newLength));
            
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
            const clampedLength = Math.max(1, Math.min(100, newLength));
            
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

function initializeFrontlineSettingsSection() {
    console.log("Initializing Frontline Settings Section");

    const frontlineListLengthInput = document.getElementById("frontline-list-length");
    
    if (!frontlineListLengthInput) {
        console.error("❌ Frontline list length input not found!");
        return;
    }

    // Load initial value from electron store
    async function loadFrontlineSettings() {
        try {
            const frontlineSettings = await window.frontlineSettingsAPI.get();
            frontlineListLengthInput.value = frontlineSettings.listLength || 14;
            console.log("✅ Loaded Frontline settings:", frontlineSettings);
        } catch (error) {
            console.error("❌ Failed to load Frontline settings:", error);
            frontlineListLengthInput.value = 14; // fallback
        }
    }

    // Save Frontline settings
    async function saveFrontlineSettings() {
        try {
            const newLength = parseInt(frontlineListLengthInput.value, 10) || 14;
            const clampedLength = Math.max(1, Math.min(100, newLength));
            
            if (clampedLength !== newLength) {
                frontlineListLengthInput.value = clampedLength;
            }
            
            await window.frontlineSettingsAPI.set({ listLength: clampedLength });
            console.log("✅ Saved Frontline list length:", clampedLength);
        } catch (error) {
            console.error("❌ Failed to save Frontline settings:", error);
        }
    }

    // Load initial settings
    loadFrontlineSettings();

    // Listen for changes
    frontlineListLengthInput.addEventListener("input", saveFrontlineSettings);

    // Listen for updates from other windows
    window.frontlineSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings && updatedSettings.listLength !== undefined) {
            frontlineListLengthInput.value = updatedSettings.listLength;
            console.log("✅ Frontline settings updated from other window:", updatedSettings);
        }
    });
}

function initializeHeroesSettingsSection() {
    console.log("Initializing Heroes Settings Section");

    const heroesListLengthInput = document.getElementById("heroes-list-length");
    
    if (!heroesListLengthInput) {
        console.error("❌ Heroes list length input not found!");
        return;
    }

    // Load initial value from electron store
    async function loadHeroesSettings() {
        try {
            const heroesSettings = await window.heroesSettingsAPI.get();
            heroesListLengthInput.value = heroesSettings.listLength || 3;
            console.log("✅ Loaded Heroes settings:", heroesSettings);
        } catch (error) {
            console.error("❌ Failed to load Heroes settings:", error);
            heroesListLengthInput.value = 3; // fallback
        }
    }

    // Save Heroes settings
    async function saveHeroesSettings() {
        try {
            const newLength = parseInt(heroesListLengthInput.value, 10) || 3;
            const clampedLength = Math.max(1, Math.min(100, newLength));
            
            if (clampedLength !== newLength) {
                heroesListLengthInput.value = clampedLength;
            }
            
            await window.heroesSettingsAPI.set({ listLength: clampedLength });
            console.log("✅ Saved Heroes list length:", clampedLength);
        } catch (error) {
            console.error("❌ Failed to save Heroes settings:", error);
        }
    }

    // Load initial settings
    loadHeroesSettings();

    // Listen for changes
    heroesListLengthInput.addEventListener("input", saveHeroesSettings);

    // Listen for updates from other windows
    window.heroesSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings && updatedSettings.listLength !== undefined) {
            heroesListLengthInput.value = updatedSettings.listLength;
            console.log("✅ Heroes settings updated from other window:", updatedSettings);
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
            statsListLengthInput.value = statsSettings.listLength || 100;
            console.log("✅ Loaded Stats settings:", statsSettings);
        } catch (error) {
            console.error("❌ Failed to load Stats settings:", error);
            statsListLengthInput.value = 100; // fallback
        }
    }

    // Save Stats settings
    async function saveStatsSettings() {
        try {
            const newLength = parseInt(statsListLengthInput.value, 10) || 100;
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

function initializeFilingFiltersSection() {
    console.log("Initializing Filing Filters Section");

    // SEC Form Priority Mapping
    const FORM_PRIORITIES = {
        // High Priority (1)
        '8-K': 1, '8-K/A': 1,
        'S-3': 1, 'S-3/A': 1,
        'S-1': 1, 'S-1/A': 1,
        '424B1': 1, '424B2': 1, '424B3': 1, '424B4': 1, '424B5': 1,
        '425': 1,  // Business combination transactions (mergers, acquisitions)
        '10-Q': 1, '10-Q/A': 1,
        '10-K': 1, '10-K/A': 1,
        '6-K': 1, '20-F': 1, '40-F': 1,
        
        // Medium Priority (2)
        '13D': 2, '13D/A': 2,
        '13G': 2, '13G/A': 2,
        '4': 2, '4/A': 2,
        'DEF 14A': 2, 'DEFA14A': 2,
        'F-1': 2, 'F-1/A': 2,
        'F-3': 2, 'F-3/A': 2,
        
        // Low Priority (3) - will be filtered out at manager level
        '11-K': 3, '144': 3, '144A': 3, '305B2': 3,
        'SC TO-T': 3, 'SC 13E3': 3,
        'N-Q': 3, 'N-CSR': 3, 'N-1A': 3,
        'N-CSRS': 3, 'N-MFP': 3, 'N-MFP2': 3, 'N-MFP3': 3,
    };

    // Group forms by priority
    const formsByPriority = { 1: [], 2: [], 3: [] };
    Object.entries(FORM_PRIORITIES).forEach(([form, priority]) => {
        formsByPriority[priority].push(form);
    });

    // Load initial filing filter settings
    async function loadFilingFilterSettings() {
        try {
            console.log("🔄 Loading filing filter settings...");
            const filingFilterSettings = await window.filingFilterSettingsAPI.get();
            console.log("📥 Received filing filter settings:", filingFilterSettings);
            
            // Set individual form toggles first
            formsByPriority[1].forEach(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                if (checkbox) {
                    const storedValue = filingFilterSettings.group1Forms && filingFilterSettings.group1Forms[form] !== undefined 
                        ? filingFilterSettings.group1Forms[form] 
                        : true; // default to true for group 1
                    checkbox.checked = storedValue;
                    console.log(`  📖 Loading Group 1 - ${form}: ${storedValue}`);
                }
            });
            formsByPriority[2].forEach(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                if (checkbox) {
                    const storedValue = filingFilterSettings.group2Forms && filingFilterSettings.group2Forms[form] !== undefined 
                        ? filingFilterSettings.group2Forms[form] 
                        : true; // default to true for group 2
                    checkbox.checked = storedValue;
                    console.log(`  📖 Loading Group 2 - ${form}: ${storedValue}`);
                }
            });
            formsByPriority[3].forEach(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                if (checkbox) {
                    const storedValue = filingFilterSettings.group3Forms && filingFilterSettings.group3Forms[form] !== undefined 
                        ? filingFilterSettings.group3Forms[form] 
                        : false; // default to false for group 3
                    checkbox.checked = storedValue;
                    console.log(`  📖 Loading Group 3 - ${form}: ${storedValue}`);
                }
            });
            
            // Set group toggles based on whether ALL forms in each group are enabled
            // Group toggle is ON if ALL forms in the group are enabled
            const group1AllEnabled = formsByPriority[1].every(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                return checkbox && checkbox.checked;
            });
            const group2AllEnabled = formsByPriority[2].every(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                return checkbox && checkbox.checked;
            });
            const group3AllEnabled = formsByPriority[3].every(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                return checkbox && checkbox.checked;
            });
            
            document.getElementById('filing-group-1-enabled').checked = group1AllEnabled;
            document.getElementById('filing-group-2-enabled').checked = group2AllEnabled;
            document.getElementById('filing-group-3-enabled').checked = group3AllEnabled;
            
            console.log("✅ Loaded filing filter settings:", filingFilterSettings);
        } catch (error) {
            console.error("❌ Failed to load filing filter settings:", error);
            // Set defaults
            document.getElementById('filing-group-1-enabled').checked = true;
            document.getElementById('filing-group-2-enabled').checked = true;
            document.getElementById('filing-group-3-enabled').checked = false;
        }
    }

    // Save filing filter settings
    async function saveFilingFilterSettings() {
        try {
            // Build the settings structure that matches electronStores.js
            const settings = {
                group1Forms: {},
                group2Forms: {},
                group3Forms: {}
            };
            
            // Collect enabled forms from each group
            formsByPriority[1].forEach(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                settings.group1Forms[form] = checkbox ? checkbox.checked : true;
            });
            formsByPriority[2].forEach(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                settings.group2Forms[form] = checkbox ? checkbox.checked : true;
            });
            formsByPriority[3].forEach(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                settings.group3Forms[form] = checkbox ? checkbox.checked : true;
            });
            
            await window.filingFilterSettingsAPI.set(settings);
            console.log("✅ Saved filing filter settings:", settings);
        } catch (error) {
            console.error("❌ Failed to save filing filter settings:", error);
        }
    }

    // Create form checkboxes for each priority group
    function createFormCheckboxes() {
        Object.entries(formsByPriority).forEach(([priority, forms]) => {
            const container = document.getElementById(`filing-forms-${priority}`);
            if (!container) return;
            
            container.innerHTML = '';
            
            forms.forEach(form => {
                const formItem = document.createElement('div');
                formItem.className = 'filing-form-item';
                formItem.innerHTML = `
                    <input type="checkbox" id="filing-form-${form}" class="filing-form-checkbox" />
                    <label for="filing-form-${form}" class="filing-form-label">${form}</label>
                `;
                container.appendChild(formItem);
                
                // Add event listener for individual form checkbox
                const checkbox = formItem.querySelector('input[type="checkbox"]');
                checkbox.addEventListener('change', (event) => {
                    console.log(`📝 Individual form ${form} changed to: ${event.target.checked}`);
                    updateGroupToggleState(priority);
                    saveFilingFilterSettings();
                });
            });
        });
    }

    // Flag to prevent circular event loops
    let isUpdatingGroupToggle = false;

    // Update group toggle state based on individual form states
    function updateGroupToggleState(priority) {
        // Don't update group toggle if we're in the middle of a group toggle operation
        if (isUpdatingGroupToggle) {
            console.log(`  ⏭️ Skipping group toggle update for priority ${priority} (in group toggle operation)`);
            return;
        }
        
        const groupCheckbox = document.getElementById(`filing-group-${priority}-enabled`);
        const allFormsEnabled = formsByPriority[priority].every(form => {
            const formCheckbox = document.getElementById(`filing-form-${form}`);
            return formCheckbox && formCheckbox.checked;
        });
        
        console.log(`  🔄 Updating group ${priority} toggle to: ${allFormsEnabled}`);
        // Update group toggle to reflect whether ALL forms in the group are enabled
        groupCheckbox.checked = allFormsEnabled;
    }

    // Handle group toggle changes
    function handleGroupToggle(priority) {
        const groupCheckbox = document.getElementById(`filing-group-${priority}-enabled`);
        const isEnabled = groupCheckbox.checked;
        
        console.log(`🔄 Group ${priority} toggle changed to: ${isEnabled}`);
        console.log(`  Forms in group ${priority}:`, formsByPriority[priority]);
        
        // Set flag to prevent circular event loops
        isUpdatingGroupToggle = true;
        
        // When group toggle is ON: select all forms in this group
        // When group toggle is OFF: unselect all forms in this group
        formsByPriority[priority].forEach(form => {
            const formCheckbox = document.getElementById(`filing-form-${form}`);
            if (formCheckbox) {
                console.log(`  Setting form ${form} to: ${isEnabled}`);
                formCheckbox.checked = isEnabled;
                
                // Force visual update by triggering change event
                formCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Also try to trigger input event for better compatibility
                formCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
                
                // Force a visual refresh by temporarily changing and restoring the checked state
                const currentState = formCheckbox.checked;
                formCheckbox.checked = !currentState;
                formCheckbox.offsetHeight; // Force reflow
                formCheckbox.checked = currentState;
                
                console.log(`  ✅ Form ${form} is now checked: ${formCheckbox.checked}`);
            } else {
                console.log(`  ❌ Form checkbox not found: filing-form-${form}`);
            }
        });
        
        // Clear flag after all forms are updated
        isUpdatingGroupToggle = false;
        
        saveFilingFilterSettings();
    }

    // Initialize the filing filters
    console.log("🚀 Initializing filing filters...");
    createFormCheckboxes();
    
    // Load settings after checkboxes are created
    loadFilingFilterSettings().then(() => {
        console.log("✅ Filing filter initialization complete");
    }).catch((error) => {
        console.error("❌ Filing filter initialization failed:", error);
    });

    // Add event listeners for group toggles
    document.getElementById('filing-group-1-enabled').addEventListener('change', () => {
        console.log("🔄 Group 1 toggle event fired");
        handleGroupToggle(1);
    });
    document.getElementById('filing-group-2-enabled').addEventListener('change', () => {
        console.log("🔄 Group 2 toggle event fired");
        handleGroupToggle(2);
    });
    document.getElementById('filing-group-3-enabled').addEventListener('change', () => {
        console.log("🔄 Group 3 toggle event fired");
        handleGroupToggle(3);
    });

    // Listen for updates from other windows
    window.filingFilterSettingsAPI.onUpdate((updatedSettings) => {
        if (updatedSettings) {
            // Update individual form checkboxes from the actual data structure
            if (updatedSettings.group1Forms) {
                Object.entries(updatedSettings.group1Forms).forEach(([form, enabled]) => {
                    const checkbox = document.getElementById(`filing-form-${form}`);
                    if (checkbox) {
                        checkbox.checked = enabled;
                    }
                });
            }
            
            if (updatedSettings.group2Forms) {
                Object.entries(updatedSettings.group2Forms).forEach(([form, enabled]) => {
                    const checkbox = document.getElementById(`filing-form-${form}`);
                    if (checkbox) {
                        checkbox.checked = enabled;
                    }
                });
            }
            
            if (updatedSettings.group3Forms) {
                Object.entries(updatedSettings.group3Forms).forEach(([form, enabled]) => {
                    const checkbox = document.getElementById(`filing-form-${form}`);
                    if (checkbox) {
                        checkbox.checked = enabled;
                    }
                });
            }
            
            // Update group toggles based on whether ALL forms in each group are enabled
            const group1AllEnabled = formsByPriority[1].every(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                return checkbox && checkbox.checked;
            });
            const group2AllEnabled = formsByPriority[2].every(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                return checkbox && checkbox.checked;
            });
            const group3AllEnabled = formsByPriority[3].every(form => {
                const checkbox = document.getElementById(`filing-form-${form}`);
                return checkbox && checkbox.checked;
            });
            
            document.getElementById('filing-group-1-enabled').checked = group1AllEnabled;
            document.getElementById('filing-group-2-enabled').checked = group2AllEnabled;
            document.getElementById('filing-group-3-enabled').checked = group3AllEnabled;
            
            console.log("✅ Filing filter settings updated from other window:", updatedSettings);
        }
    });
}
