// ============================
// Global Variables
// ============================
// Debug Mode
const debugMode = window.appFlags?.isDev === true;
const debugCombo = false; // Disabled by default for performance
if (!debugMode) {
    console.log = () => {};
    console.debug = () => {};
    console.warn = () => {};
}
// Alert Queue
const alertQueue = [];
let flushScheduled = false;

// Blink Animation Manager - ensures only one blink type is active at a time
const blinkManager = {
    currentBlinkType: null,
    activeElements: new Set(),
    
    // Priority order: intense > medium > soft
    getBlinkPriority(type) {
        const priorities = { 'blink-intense': 3, 'blink-medium': 2, 'blink-soft': 1 };
        return priorities[type] || 0;
    },
    
    // Set the dominant blink type and update all elements
    setBlinkType(newType) {
        if (!newType) {
            this.clearAllBlink();
            return;
        }
        
        const newPriority = this.getBlinkPriority(newType);
        const currentPriority = this.getBlinkPriority(this.currentBlinkType);
        
        // Only change if new type has higher priority
        if (newPriority > currentPriority) {
            this.currentBlinkType = newType;
            this.updateAllElements();
        }
    },
    
    // Clear all blink animations
    clearAllBlink() {
        this.currentBlinkType = null;
        this.activeElements.forEach(element => {
            element.classList.remove('blink-soft', 'blink-medium', 'blink-intense');
        });
        this.activeElements.clear();
    },
    
    // Update all active elements to use the current blink type
    updateAllElements() {
        this.activeElements.forEach(element => {
            // Remove all blink classes
            element.classList.remove('blink-soft', 'blink-medium', 'blink-intense');
            // Add the current dominant blink type
            if (this.currentBlinkType) {
                element.classList.add(this.currentBlinkType);
            }
        });
    },
    
    // Register an element for blink management
    registerElement(element, blinkType) {
        this.activeElements.add(element);
        
        if (!this.currentBlinkType || this.getBlinkPriority(blinkType) > this.getBlinkPriority(this.currentBlinkType)) {
            this.setBlinkType(blinkType);
        } else if (this.currentBlinkType) {
            // Use the current dominant type
            element.classList.remove('blink-soft', 'blink-medium', 'blink-intense');
            element.classList.add(this.currentBlinkType);
        }
    },
    
    // Unregister an element
    unregisterElement(element) {
        this.activeElements.delete(element);
        element.classList.remove('blink-soft', 'blink-medium', 'blink-intense');
        
        // If this was the last element, clear the current type
        if (this.activeElements.size === 0) {
            this.currentBlinkType = null;
        }
    }
};

// Audio
let lastAudioTime = 0;
const MIN_AUDIO_INTERVAL_MS = 93;

// Use Map for better performance than objects
const symbolUptickTimers = new Map();
const symbolNoteIndices = new Map();
const symbolDowntickTimers = new Map();
const symbolDownNoteIndices = new Map();
const symbolComboLastPrice = new Map();
const symbolDownComboLastPrice = new Map();
const symbolActiveTickerLastSet = new Map(); // Track when each symbol was last set as active ticker

const UPTICK_WINDOW_MS = 60_000;
const ACTIVE_TICKER_DEBOUNCE_MS = 30_000; // 30 seconds debounce for setting active ticker

// Minimum volume required to reach each combo leve
const COMBO_VOLUME_REQUIREMENTS = [
    0, // Level 0 → just started, no requirement
    100, // Level 1 → first real alert
    500, // Level 2
    1000, // Level 3
    2000, // Level 4
    100, // Level 5
    100, // Level 6+ → no requirement, just allow progression
];

// === Sample packs ===
const SAMPLE_COUNTS = { short: 32, long: 32 }; // your folders
const SAMPLE_BASE = new URL(".", window.location.href).toString();
const LONG_THRESHOLD_DEFAULT = 10_000; // volume cutoff for long pack

// Audio loading removed - now using centralized audio system in progress window

function levelToIndex(level, count) {
    const lv = Math.max(0, level | 0);
    return lv % Math.max(1, count);
}


// playSampleBuffer removed - now using centralized audio system

// ============================
// Utility: Parse Volume String
// ============================
function parseVolumeValue(str) {
    if (!str) return 0;
    let value = parseFloat(String(str).replace(/[^0-9.]/g, "")) || 0;
    if (/B/i.test(str)) value *= 1_000_000_000;
    else if (/M/i.test(str)) value *= 1_000_000;
    else if (/K/i.test(str)) value *= 1_000;
    return value;
}

// Utility function to check if current time is quiet time (08:00 and 09:30 EST only)
function isQuietTimeEST() {
    const estNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const h = estNow.getHours();
    const m = estNow.getMinutes();
    const s = estNow.getSeconds();

    return (
        (h === 8 && m === 0 && s <= 2) || // 08:00:00 to 08:00:10
        (h === 9 && m === 30 && s <= 2) // 09:30:00 to 09:30:10
    );
}

function abbreviatedValues(num) {
    if (num < 1000) return num.toString(); // No abbreviation under 1K
    if (num < 1_000_000) return (num / 1_000).toFixed(1) + "K";
    return (num / 1_000_000).toFixed(1) + "M";
}

// Determine if we should use long or short combo alerts based on volume strength
function shouldUseLongAlert(strength) {
    const threshold = Number(window?.settings?.events?.longSampleThreshold) || LONG_THRESHOLD_DEFAULT;
    return strength >= threshold;
}

function comboPercentFromLevel(level) {
    const maxCombo = 16;
    const lv = Math.max(0, level ?? -1);
    if (lv <= 1) return 30; // early visual feedback
    const ratio = lv / maxCombo;
    return Math.min(1, Math.pow(ratio, 0.65)) * 100;
}

// ============================
// App Initialization
// ============================
async function initializeApp() {
    // Check if DOM is already loaded
    if (document.readyState === 'loading') {
        // DOM is still loading, wait for DOMContentLoaded
        document.addEventListener("DOMContentLoaded", initializeApp);
        return;
    }
    
    // DOM is already loaded, proceed with initialization
    window.settings = await window.settingsAPI.get();
    // Audio preloading removed - now handled by centralized system

    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);
        window.settings = updatedSettings;
    });

    const logElement = document.getElementById("log");

    function getSymbolColor(hue) {
        return `hsla(${hue}, 80%, 50%, 0.5)`;
    }

    // Template for alert elements to reduce DOM creation
    const alertTemplate = document.createElement("li");
    alertTemplate.className = "alert";
    
    const fillUpTemplate = document.createElement("div");
    fillUpTemplate.className = "combo-fill up";
    const fillDownTemplate = document.createElement("div");
    fillDownTemplate.className = "combo-fill down";
    alertTemplate.appendChild(fillUpTemplate);
    alertTemplate.appendChild(fillDownTemplate);
    
    const contentTemplate = document.createElement("div");
    contentTemplate.className = "alert-content";
    const valuesTemplate = document.createElement("div");
    valuesTemplate.className = "alert-values";
    contentTemplate.appendChild(valuesTemplate);
    alertTemplate.appendChild(contentTemplate);

    function createAlertElement(alertData) {
        const { hero, price, strength = 0, hp = 0, dp = 0, change = 0 } = alertData;

        const upLevel = symbolNoteIndices.get(hero) ?? -1;
        const downLevel = symbolDownNoteIndices.get(hero) ?? -1;

        const upPercent = comboPercentFromLevel(upLevel);
        const downPercent = comboPercentFromLevel(downLevel);

        const isUp = change > 0;
        const isNewHigh = alertData.isHighOfDay === true;
        const isNewEntry = alertData.isNewEntry === true;

        // Clone template for better performance
        const alertDiv = alertTemplate.cloneNode(true);
        alertDiv.dataset.symbol = hero;
        alertDiv.className = `alert ${isUp ? "up" : "down"}`;

        const fillUp = alertDiv.querySelector(".combo-fill.up");
        const fillDown = alertDiv.querySelector(".combo-fill.down");
        const valuesDiv = alertDiv.querySelector(".alert-values");
        
        // Use textContent for better performance than innerHTML
        valuesDiv.innerHTML = `
          <span class="alert-symbol no-drag" style="background-color: ${getSymbolColor(alertData.hue || 0)}" title="Click to copy and set active ticker">${hero}</span>
          <span class="price">$${Number(price).toFixed(2)}</span>
          <span class="${isUp ? "change-up" : "change-down"}">${change.toFixed(2)}%</span>
          <span class="size">${abbreviatedValues(strength)}</span>
        `;

        valuesDiv.querySelector(".alert-symbol").onclick = () => {
            navigator.clipboard.writeText(hero);
            window.activeAPI.setActiveTicker(hero);
        };

        if (isNewHigh) alertDiv.classList.add("new-high");
        if (isNewEntry) alertDiv.classList.add("new-entry");

        // Optimized class management - batch operations
        const classesToRemove = ["low-1", "low-2", "low-3", "low-4"];
        alertDiv.classList.remove(...classesToRemove);
        
        // Determine blink type but don't apply directly - let blink manager handle it
        let blinkType = null;
        if (isUp) {
            if (strength >= 100_000) blinkType = "blink-intense";
            else if (strength >= 50_000) blinkType = "blink-medium";
            else if (strength >= 10_000) blinkType = "blink-soft";
        }
        
        // Register with blink manager if there's a blink type
        if (blinkType) {
            blinkManager.registerElement(alertDiv, blinkType);
        }
        
        let brightnessClass = "";
        if (strength >= 5_000) brightnessClass = "low-1";
        else if (strength >= 2_500) brightnessClass = "low-2";
        else if (strength >= 500) brightnessClass = "low-3";
        else brightnessClass = "low-4";
        if (hp > 0 || dp > 0) alertDiv.classList.add(brightnessClass);

        // 🔐 Direction-locked combo rendering:
        // Only show UP combo visuals on UP alerts
        if (isUp && upLevel >= 1) {
            alertDiv.classList.add("combo-active", "up-combo");
            fillUp.style.width = `${upPercent}%`;
            fillUp.classList.remove("combo-pulse-1", "combo-pulse-2", "combo-pulse-3", "combo-pulse-4");
            const p = Math.min(4, Math.floor(upLevel / 2));
            if (p >= 1) fillUp.classList.add(`combo-pulse-${p}`);
        } else {
            fillUp.style.width = "0%";
            alertDiv.classList.remove("up-combo");
        }

        // Only show DOWN combo visuals on DOWN alerts
        if (!isUp && downLevel >= 1) {
            alertDiv.classList.add("combo-active", "down-combo");
            fillDown.style.width = `${downPercent}%`;
            fillDown.classList.remove("combo-pulse-1", "combo-pulse-2", "combo-pulse-3", "combo-pulse-4");
            const q = Math.min(4, Math.floor(downLevel / 2));
            if (q >= 1) fillDown.classList.add(`combo-pulse-${q}`);
        } else {
            fillDown.style.width = "0%";
            alertDiv.classList.remove("down-combo");
        }

        // If neither side is active after the direction lock, drop combo-active
        if (!alertDiv.classList.contains("up-combo") && !alertDiv.classList.contains("down-combo")) {
            alertDiv.classList.remove("combo-active");
        }

        return alertDiv;
    }

    function flushAlerts() {
        flushScheduled = false;
        const maxAlerts = window.settings?.scanner?.maxAlerts || 50;

        for (const data of alertQueue) {
            const alertElement = createAlertElement(data);
            if (alertElement instanceof Node) {
                logElement.appendChild(alertElement);
                performanceStats.domUpdates++;
            }
        }

        // ⏱ Do this only once per frame
        while (logElement.children.length > maxAlerts) {
            const removedElement = logElement.firstChild;
            // Unregister from blink manager before removing
            blinkManager.unregisterElement(removedElement);
            logElement.removeChild(removedElement);
        }

        alertQueue.length = 0;
    }
    function resetCombo(symbol, isDown = false) {
        if (isDown) {
            const timer = symbolDowntickTimers.get(symbol);
            if (timer) clearTimeout(timer);
            symbolDowntickTimers.delete(symbol);
            symbolDownNoteIndices.delete(symbol);
            symbolDownComboLastPrice.delete(symbol);
        } else {
            const timer = symbolUptickTimers.get(symbol);
            if (timer) clearTimeout(timer);
            symbolUptickTimers.delete(symbol);
            symbolNoteIndices.delete(symbol);
            symbolComboLastPrice.delete(symbol);
            // Note: We don't delete symbolActiveTickerLastSet here as it should persist across combo resets
        }

        // Use more efficient selector and batch DOM operations
        const cards = document.querySelectorAll(`.alert[data-symbol="${symbol}"]`);
        cards.forEach((card) => {
            if (isDown) {
                card.classList.remove("down-combo");
                const d = card.querySelector(".combo-fill.down");
                if (d) {
                    d.classList.remove("combo-pulse-1", "combo-pulse-2", "combo-pulse-3", "combo-pulse-4");
                    d.style.width = "0%";
                }
            } else {
                card.classList.remove("up-combo");
                const u = card.querySelector(".combo-fill.up");
                if (u) {
                    u.classList.remove("combo-pulse-1", "combo-pulse-2", "combo-pulse-3", "combo-pulse-4");
                    u.style.width = "0%";
                }
            }

            // keep combo-active if the *other* side is still going
            const stillUp = card.classList.contains("up-combo");
            const stillDown = card.classList.contains("down-combo");
            if (!stillUp && !stillDown) card.classList.remove("combo-active");
            // DO NOT touch .new-high
        });

        if (debugMode) console.log(`🔄 ${symbol} ${isDown ? "down-combo" : "up-combo"} reset`);
    }

    // ============================
    // Alert Event Listener
    // ============================
    window.eventsAPI.onAlert((alertData) => {
        try {
            // if (debugMode) console.log("[CLIENT] Received via IPC:", alertData);

            const topSettings = window.settings?.top || {};
            const scannerSettings = window.settings?.scanner || {};
            const { minChangePercent = 0, minVolume = 0, maxAlerts = 50 } = scannerSettings;
            const { minPrice = 0, maxPrice = Infinity } = topSettings;

            const symbol = alertData.hero || alertData.symbol;
            const { price = 0, hp = 0, dp = 0, strength = 0, change = 0 } = alertData;

            // 🔍 Debug the actual filter values and the incoming data
            // if (debugMode) {
            //     console.log("🧪 Settings:", { minPrice, maxPrice, minChangePercent, minVolume });
            //     console.log("🧪 Alert candidate:", { symbol, price, hp, dp, strength, change });
            // }

            const passesFilters = (minPrice === 0 || price >= minPrice) && (maxPrice === 0 || price <= maxPrice) && Math.abs(change) >= minChangePercent && strength >= minVolume;

            if (!passesFilters) {
                // if (debugMode) console.log("⛔️ Filtered out:", symbol);
                return;
            }

            // Check for High of Day alert and trigger sound
            const isHOD = alertData.isHighOfDay === true;
            if (isHOD) {
                console.log(`🎯 [EVENTS] HOD Alert detected for ${symbol}`);
                // Use centralized audio system for HOD chime
                if (window.audioAPI) {
                    window.audioAPI.playHodChime().catch((error) => {
                        console.error("❌ Failed to play HOD chime:", error);
                    });
                } else {
                    console.warn("⚠️ Centralized audio API not available for HOD chime");
                }
            }

            const now = Date.now(); // 🧼 keep only this one at the top of the block

            const quietTime = isQuietTimeEST();

            if (change > 0 && strength >= minVolume) {
                if (debugMode && debugCombo) console.log(`🔍 ${symbol} tick detected — Change: ${change.toFixed(2)}% | Volume: ${strength}`);

                if (debugMode && debugCombo) {
                    console.log(`\n📌 ${symbol} — Incoming Tick`);
                    console.log(`   🧭 Previous Level: ${symbolNoteIndices[symbol] ?? "N/A (defaulting to 0)"}`);
                    console.log(`   💪 Volume: ${strength} | 🔺 Change: ${change.toFixed(2)}%`);
                }

                const currentLevel = symbolNoteIndices.get(symbol) ?? -1;
                const nextLevel = currentLevel + 1;

                const currentRequiredVolume = COMBO_VOLUME_REQUIREMENTS[Math.min(currentLevel, COMBO_VOLUME_REQUIREMENTS.length - 1)];
                const requiredVolume = COMBO_VOLUME_REQUIREMENTS[Math.min(nextLevel, COMBO_VOLUME_REQUIREMENTS.length - 1)];

                if (symbolUptickTimers.has(symbol)) {
                    // DON'T clear the existing timer - let it run for the full 60 seconds from start

                    if (strength >= requiredVolume) {
                        const lastPrice = symbolComboLastPrice.get(symbol) ?? 0;

                        if (price > lastPrice) {
                            symbolNoteIndices.set(symbol, nextLevel);
                            symbolComboLastPrice.set(symbol, price);

                            // 🎯 Auto-set as active ticker when reaching level 4 combo (with debouncing)
                            if (nextLevel >= 4) {
                                const lastSetTime = symbolActiveTickerLastSet.get(symbol) || 0;
                                const timeSinceLastSet = now - lastSetTime;
                                
                                if (timeSinceLastSet >= ACTIVE_TICKER_DEBOUNCE_MS) {
                                    if (window.activeAPI?.setActiveTicker) {
                                        window.activeAPI.setActiveTicker(symbol);
                                        symbolActiveTickerLastSet.set(symbol, now);
                                        console.log(`🎯 [EVENTS] Auto-set active ticker (LV${nextLevel} combo): ${symbol}`);
                                    } else {
                                        console.warn(`⚠️ [EVENTS] Could not set active ticker - activeAPI not available: ${symbol}`);
                                    }
                                } else {
                                    const remainingTime = Math.ceil((ACTIVE_TICKER_DEBOUNCE_MS - timeSinceLastSet) / 1000);
                                    if (debugMode && debugCombo) {
                                        console.log(`⏳ [EVENTS] Active ticker debounced for ${symbol} (${remainingTime}s remaining)`);
                                    }
                                }
                            }

                            if (nextLevel >= 2 && !quietTime && now - lastAudioTime >= MIN_AUDIO_INTERVAL_MS) {
                                // Emit audio event to centralized audio system
                                const isLongAlert = shouldUseLongAlert(strength);
                                
                                // Use centralized audio API - pass combo level and strength
                                if (window.audioAPI) {
                                    window.audioAPI.playEventsCombo(strength, isLongAlert, nextLevel).catch(error => {
                                        console.error("❌ Failed to play combo audio:", error);
                                    });
                                } else {
                                    console.warn("⚠️ Centralized audio API not available, skipping audio");
                                }
                                
                                lastAudioTime = now;
                                performanceStats.audioPlayed++;

                                if (debugMode && debugCombo) {
                                    console.log(`🎧 ${symbol} ${isLongAlert ? 'long' : 'short'} (LV${nextLevel}, strength=${strength})`);
                                }
                            }

                            // Timer continues unchanged - no need to reset it
                        } else {
                            if (debugMode && debugCombo) console.log(`⛔ ${symbol} price not higher than last combo price (${price} ≤ ${lastPrice})`);
                            // stop combo progression but continue processing alert
                        }
                    }
                } else {
                    // First uptick — start tracking
                    symbolNoteIndices.set(symbol, 0);
                    if (debugMode && debugCombo) console.log(`🧪 ${symbol} started tracking (LV0)`);

                    symbolUptickTimers.set(symbol, setTimeout(() => {
                        if (debugMode && debugCombo) console.log(`⌛ ${symbol} combo expired`);
                        resetCombo(symbol);
                    }, UPTICK_WINDOW_MS));
                }
            }

            if (change < 0 && strength >= minVolume) {
                if (debugMode && debugCombo) {
                    console.log(`🔍 ${symbol} tick detected — Change: ${change.toFixed(2)}% | Volume: ${strength}`);
                    console.log(`\n📌 ${symbol} — Incoming Down Tick`);
                    console.log(`   🧭 Previous Down Level: ${symbolDownNoteIndices[symbol] ?? "N/A (defaulting to 0)"}`);
                    console.log(`   💪 Volume: ${strength} | 🔻 Change: ${change.toFixed(2)}%`);
                }

                const currentLevel = symbolDownNoteIndices.get(symbol) ?? -1;
                const nextLevel = currentLevel + 1;
                const requiredVolume = COMBO_VOLUME_REQUIREMENTS[Math.min(nextLevel, COMBO_VOLUME_REQUIREMENTS.length - 1)];

                if (symbolDowntickTimers.has(symbol)) {
                    // DON'T clear the existing timer - let it run for the full 60 seconds from start

                    if (strength >= requiredVolume) {
                        const lastDownPrice = symbolDownComboLastPrice.get(symbol) ?? Infinity;

                        if (price < lastDownPrice) {
                            symbolDownNoteIndices.set(symbol, nextLevel);
                            symbolDownComboLastPrice.set(symbol, price);

                            if (debugMode && debugCombo) console.log(`🔥 ${symbol} down-combo advanced to LV${nextLevel}`);

                            // Timer continues unchanged - no need to reset it
                        } else {
                            if (debugMode && debugCombo) console.log(`⛔ ${symbol} price not lower than last down-combo price (${price} ≥ ${lastDownPrice})`);
                            // stop combo progression but continue processing alert
                        }
                    }
                    // Timer continues unchanged regardless of volume - no need to refresh it
                } else {
                    // ✅ First downtick — start tracking (LV0)
                    symbolDownNoteIndices.set(symbol, 0);
                    symbolDownComboLastPrice.set(symbol, price);

                    if (debugMode && debugCombo) console.log(`🧪 ${symbol} down-combo started (LV0)`);

                    symbolDowntickTimers.set(symbol, setTimeout(() => {
                        if (debugMode && debugCombo) console.log(`⌛ ${symbol} down-combo expired`);
                        resetCombo(symbol, true);
                    }, UPTICK_WINDOW_MS));
                }
            }

            alertQueue.push(alertData);
            performanceStats.alertsProcessed++;
            
            if (!flushScheduled) {
                flushScheduled = true;
                requestAnimationFrame(flushAlerts);
            }
        } catch (error) {
            console.error("[CLIENT] Error handling alert:", error);
        }
    });
}

// Performance monitoring
let performanceStats = {
    alertsProcessed: 0,
    audioPlayed: 0,
    domUpdates: 0,
    lastCleanup: Date.now(),
    blinkAnimationsActive: 0
};

// Cleanup function to prevent memory leaks
function performCleanup() {
    const now = Date.now();
    if (now - performanceStats.lastCleanup < 30000) return; // Only cleanup every 30 seconds
    
    // Clean up old DOM elements
    const logElement = document.getElementById("log");
    if (logElement && logElement.children.length > 100) {
        const excess = logElement.children.length - 50;
        for (let i = 0; i < excess; i++) {
            if (logElement.firstChild) {
                // Unregister from blink manager before removing
                blinkManager.unregisterElement(logElement.firstChild);
                logElement.removeChild(logElement.firstChild);
            }
        }
    }
    
    // Clean up expired timers
    const expiredSymbols = [];
    for (const [symbol, timer] of symbolUptickTimers) {
        if (!timer) expiredSymbols.push(symbol);
    }
    for (const [symbol, timer] of symbolDowntickTimers) {
        if (!timer) expiredSymbols.push(symbol);
    }
    
    expiredSymbols.forEach(symbol => {
        symbolUptickTimers.delete(symbol);
        symbolDowntickTimers.delete(symbol);
        symbolNoteIndices.delete(symbol);
        symbolDownNoteIndices.delete(symbol);
        symbolComboLastPrice.delete(symbol);
        symbolDownComboLastPrice.delete(symbol);
        symbolActiveTickerLastSet.delete(symbol);
    });
    
    performanceStats.lastCleanup = now;
    if (debugMode) console.log(`🧹 Cleanup completed. Removed ${expiredSymbols.length} expired symbols`);
}

// Start initialization immediately
initializeApp();

// Schedule periodic cleanup
setInterval(performCleanup, 30000);

// Performance monitoring function
window.getEventsPerformanceStats = () => {
    const logElement = document.getElementById("log");
    const stats = {
        ...performanceStats,
        activeSymbols: symbolUptickTimers.size + symbolDowntickTimers.size,
        domElements: logElement ? logElement.children.length : 0,
        audioBuffersLoaded: "handled by centralized system",
        blinkManager: {
            currentBlinkType: blinkManager.currentBlinkType || 'none',
            activeElements: blinkManager.activeElements.size,
            totalElements: logElement ? logElement.children.length : 0
        }
    };
    console.table(stats);
    return stats;
};

// Test function for combo alerts - forward to centralized system
window.testComboAlert = () => {
    console.log("🎧 Events view forwarding combo test to centralized audio system...");
    if (window.audioAPI) {
        window.audioAPI.testEventsCombo();
    } else {
        console.warn("⚠️ Centralized audio API not available");
    }
};

// Test function for HOD alerts - call from browser console
window.testHodAlert = (symbol = 'TEST') => {
    console.log(`🧪 [EVENTS] Testing HOD alert for ${symbol}`);
    
    // Create a mock HOD alert event
    const mockHodEvent = {
        hero: symbol,
        price: 100.50,
        hp: 2.5,
        dp: 0,
        strength: 50000,
        one_min_volume: 50000,
        change: 2.5,
        isHighOfDay: true
    };
    
    // Process the mock event through the alert handler
    window.eventsAPI.onAlert(mockHodEvent);
    
    console.log(`🧪 [EVENTS] HOD alert test completed for ${symbol}`);
};

// Test function for blink animation system
window.testBlinkAnimations = () => {
    console.log("Testing blink animation system...");
    console.log(`Current blink type: ${blinkManager.currentBlinkType || 'none'}`);
    console.log(`Active elements: ${blinkManager.activeElements.size}`);
    console.log(`All elements:`, Array.from(blinkManager.activeElements).map(el => ({
        symbol: el.dataset.symbol,
        classes: Array.from(el.classList).filter(c => c.startsWith('blink-'))
    })));
    
    // Test switching between blink types
    const testElement = document.querySelector('.alert');
    if (testElement) {
        console.log("Testing blink type switching...");
        blinkManager.registerElement(testElement, 'blink-soft');
        setTimeout(() => {
            blinkManager.registerElement(testElement, 'blink-medium');
            setTimeout(() => {
                blinkManager.registerElement(testElement, 'blink-intense');
                setTimeout(() => {
                    blinkManager.unregisterElement(testElement);
                    console.log("Blink test completed");
                }, 1000);
            }, 1000);
        }, 1000);
    } else {
        console.log("No alert elements found for testing");
    }
};

// Test function for active ticker debouncing
window.testActiveTickerDebouncing = (symbol = 'TEST') => {
    console.log(`🧪 Testing active ticker debouncing for ${symbol}`);
    console.log(`Current debounce map:`, Object.fromEntries(symbolActiveTickerLastSet));
    
    const now = Date.now();
    const lastSetTime = symbolActiveTickerLastSet.get(symbol) || 0;
    const timeSinceLastSet = now - lastSetTime;
    const remainingTime = Math.ceil((ACTIVE_TICKER_DEBOUNCE_MS - timeSinceLastSet) / 1000);
    
    console.log(`Last set time: ${new Date(lastSetTime).toLocaleTimeString()}`);
    console.log(`Time since last set: ${Math.ceil(timeSinceLastSet / 1000)}s`);
    console.log(`Remaining debounce time: ${Math.max(0, remainingTime)}s`);
    console.log(`Can set active ticker: ${timeSinceLastSet >= ACTIVE_TICKER_DEBOUNCE_MS}`);
    
    // Simulate setting the active ticker
    if (timeSinceLastSet >= ACTIVE_TICKER_DEBOUNCE_MS) {
        symbolActiveTickerLastSet.set(symbol, now);
        console.log(`✅ Would set active ticker for ${symbol}`);
    } else {
        console.log(`⏳ Debounced - would not set active ticker for ${symbol}`);
    }
};

// IPC listeners for audio test commands
if (window.ipcListenerAPI) {
    window.ipcListenerAPI.onTestComboAlert(() => {
        console.log("[Events] Received test-combo-alert command from main process");
        window.testComboAlert();
    });

    window.ipcListenerAPI.onTestScannerAlert(() => {
        console.log("[Events] Received test-scanner-alert command from main process");
        window.testScannerAlert();
    });
}


