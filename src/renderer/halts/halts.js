// halts.js — Trading Halts Monitor: real-time halt data consumption and display

let allHalts = [];
let currentlyHaltedSymbols = new Set();
let symbolStates = new Map(); // Track current state for each symbol
let maxHaltsLength = 100; // Keep last 100 halt events
let settings = {};
let countdownTimer = null; // Timer for updating countdowns
let expiredHalts = new Set(); // Track halts that have expired
let animationQueue = []; // Queue for managing animations

// Halt structure debug logging
function logHaltStructure(halts, context = "") {
    if (!Array.isArray(halts) || halts.length === 0) {
        console.log(`🔍 ${context} - No halts to log`);
        return;
    }
    
    console.log(`🔍 === HALT STRUCTURE ${context} ===`);
    console.log(`🔍 Total halts: ${halts.length}`);
    
    halts.forEach((halt, index) => {
        console.log(`🔍 Halt ${index + 1}:`, {
            symbol: halt.symbol,
            state: halt.state,
            reason: halt.reason,
            indicators: halt.indicators,
            timestamp: halt.timestamp,
            tape: halt.tape,
            tape_description: halt.tape_description,
            high_price: halt.high_price,
            low_price: halt.low_price,
            source: halt.source,
            received_at: halt.received_at,
            ALL_FIELDS: Object.keys(halt)
        });
    });
    console.log(`🔍 ================================`);
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("🚨 Halts: Initializing halt monitor...");

    // Set up event delegation for symbol clicks (similar to sessionHistory)
    document.addEventListener('click', function(event) {
        const symbolElement = event.target.closest('.symbol[data-clickable="true"]');
        if (symbolElement) {
            const symbol = symbolElement.getAttribute('data-symbol');
            if (symbol) {
                console.log(`🖱️ [Halts] Symbol clicked: ${symbol}`);
                window.handleSymbolClick(symbol, event);
            }
        }
    });

    // Load settings
    try {
        settings = await window.settingsAPI.get();
        console.log("✅ Settings loaded in halts window:", settings);
    } catch (e) {
        console.warn("⚠️ Failed to load settings in halts window:", e);
        settings = {}; // fallback
    }

    // Test data removed - ready for production

    // Request initial halt data from main process
    try {
        const halts = await window.haltAPI.getHeadlines();
        if (halts && Array.isArray(halts)) {
            console.log(`📊 Received ${halts.length} initial halts from Oracle`);
            allHalts = [...allHalts, ...halts];
            
            // Sort halts by timestamp (newest first)
            allHalts.sort((a, b) => {
                const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
                const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;
                // Compare timestamps (newest first)
                if (typeof timeA === 'number' && typeof timeB === 'number') {
                    return timeB - timeA;
                }
                return timeB.localeCompare(timeA);
            });
            
            updateHaltedSymbols();
            renderHalts();
        } else {
            console.log("📊 No initial halts available");
            updateHaltedSymbols();
            renderHalts();
        }
    } catch (e) {
        console.error("❌ Failed to get initial halts:", e);
        updateHaltedSymbols();
        renderHalts();
    }

    // Request halt count
    try {
        const count = await window.haltAPI.getCount();
        console.log(`📊 Halt count: ${count}`);
    } catch (e) {
        console.error("❌ Failed to get halt count:", e);
    }

    // Start countdown timer
    startCountdownTimer();
});

// Test functions removed - ready for production

// Start countdown timer to update countdowns every second
function startCountdownTimer() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }
    
    countdownTimer = setInterval(() => {
        updateCountdowns();
    }, 1000);
}

// Update all countdown displays and handle expired halts
function updateCountdowns() {
    const countdownElements = document.querySelectorAll('.halt-time.countdown[data-halt-time]');
    const haltsToRemove = [];
    
    countdownElements.forEach(element => {
        const haltTimeStr = element.getAttribute('data-halt-time');
        if (!haltTimeStr) return;
        
        const haltTime = parseInt(haltTimeStr);
        if (isNaN(haltTime)) return;
        
        // Calculate countdown
        const haltTimeMs = haltTime * 1000;
        const now = Date.now();
        const elapsedMs = now - haltTimeMs;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        
        // 5-minute countdown (300 seconds)
        const countdownSeconds = Math.max(0, 300 - elapsedSeconds);
        
        let countdownStr;
        if (countdownSeconds > 0) {
            const minutes = Math.floor(countdownSeconds / 60);
            const seconds = countdownSeconds % 60;
            countdownStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else {
            // Countdown has expired - show "EXPIRED" instead of removing
            countdownStr = 'EXPIRED';
            
            // Mark as expired but don't remove
            const haltElement = element.closest('.halt-event');
            const symbol = haltElement?.getAttribute('data-symbol');
            
            if (symbol && !expiredHalts.has(symbol)) {
                expiredHalts.add(symbol);
                markHaltAsExpired(haltElement, symbol);
            }
        }
        
        // Update countdown text
        element.textContent = countdownStr;
        
        // Update color based on remaining time
        updateCountdownColor(element, countdownSeconds);
    });
}

// Update countdown color based on remaining time
function updateCountdownColor(element, countdownSeconds) {
    // Remove existing color classes
    element.classList.remove('green', 'yellow', 'red', 'critical');
    
    // Apply color based on remaining time
    if (countdownSeconds > 180) { // More than 3 minutes (180 seconds)
        element.classList.add('green');
    } else if (countdownSeconds > 60) { // More than 1 minute (60 seconds)
        element.classList.add('yellow');
    } else if (countdownSeconds > 10) { // 10-60 seconds
        element.classList.add('red');
    } else { // 10 seconds or less - critical blinking
        element.classList.add('red', 'critical');
        
        // Log when critical blinking starts (only once per halt)
        const haltElement = element.closest('.halt-event');
        const symbol = haltElement?.getAttribute('data-symbol');
        if (symbol && !haltElement.hasAttribute('data-critical-logged')) {
            console.log(`🚨 CRITICAL: ${symbol} countdown in final 10 seconds!`);
            haltElement.setAttribute('data-critical-logged', 'true');
        }
    }
}

// Mark halt as expired instead of removing it
function markHaltAsExpired(haltElement, symbol) {
    console.log(`🚨 Marking ${symbol} as EXPIRED - halt did not resume`);
    
    // Update the halt state in our data
    const haltIndex = allHalts.findIndex(halt => halt.symbol === symbol);
    if (haltIndex !== -1) {
        allHalts[haltIndex].state = 'expired';
        allHalts[haltIndex].expired_at = new Date().toISOString();
    }
    
    // Update the visual state
    const stateElement = haltElement.querySelector('.halt-state');
    const timeElement = haltElement.querySelector('.halt-time');
    
    if (stateElement) {
        stateElement.textContent = 'EXPIRED';
        stateElement.className = 'halt-state expired';
    }
    
    if (timeElement) {
        timeElement.textContent = 'EXPIRED';
        timeElement.className = 'halt-time countdown expired';
    }
    
    // Remove from currently halted symbols
    currentlyHaltedSymbols.delete(symbol);
}

// Mark halt as resumed (when trading actually resumes)
function markHaltAsResumed(haltElement, symbol) {
    console.log(`✅ Marking ${symbol} as RESUMED - trading has resumed`);
    
    // Update the halt state in our data
    const haltIndex = allHalts.findIndex(halt => halt.symbol === symbol);
    if (haltIndex !== -1) {
        allHalts[haltIndex].state = 'resumed';
        allHalts[haltIndex].resumed_at = new Date().toISOString();
    }
    
    // Update the visual state
    const stateElement = haltElement.querySelector('.halt-state');
    const timeElement = haltElement.querySelector('.halt-time');
    
    if (stateElement) {
        stateElement.textContent = 'RESUMED';
        stateElement.className = 'halt-state resumed';
    }
    
    if (timeElement) {
        timeElement.textContent = 'RESUMED';
        timeElement.className = 'halt-time countdown resumed';
    }
    
    // Remove from currently halted symbols
    currentlyHaltedSymbols.delete(symbol);
}

// Start fadeout animation for expired halt (kept for manual removal if needed)
function startFadeOutAnimation(haltElement, symbol) {
    console.log(`🎭 Starting fadeout animation for ${symbol}`);
    
    // Add fadeout class
    haltElement.classList.add('fading-out');
    
    // After fadeout animation completes, remove the halt and trigger dropdown
    setTimeout(() => {
        removeHaltAndDropDown(haltElement, symbol);
    }, 1000); // Match the fadeOut animation duration
}

// Remove expired halt and make remaining halts drop down
function removeHaltAndDropDown(removedElement, symbol) {
    console.log(`🎭 Removing ${symbol} and triggering dropdown`);
    
    // Remove from data arrays
    allHalts = allHalts.filter(halt => halt.symbol !== symbol);
    currentlyHaltedSymbols.delete(symbol);
    symbolStates.delete(symbol);
    
    // Get all remaining halt elements
    const remainingElements = document.querySelectorAll('.halt-event:not(.fading-out)');
    
    // Add dropping animation to remaining elements
    remainingElements.forEach((element, index) => {
        element.classList.add('dropping');
        
        // Remove dropping class after animation
        setTimeout(() => {
            element.classList.remove('dropping');
        }, 300);
    });
    
    // Re-render to clean up the DOM
    setTimeout(() => {
        renderHalts();
    }, 350);
}

// Update the set of currently halted symbols and track symbol states
function updateHaltedSymbols() {
    currentlyHaltedSymbols.clear();
    symbolStates.clear();
    
    // Process halts in reverse chronological order to get latest state for each symbol
    const sortedHalts = [...allHalts].sort((a, b) => {
        // Use halt_time if available, otherwise fall back to timestamp_et, timestamp, or received_at
        const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
        const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;
        
        // Compare timestamps (newest first)
        if (typeof timeA === 'number' && typeof timeB === 'number') {
            return timeB - timeA;
        }
        return timeB.localeCompare(timeA);
    });
    
    // Track the latest state for each symbol
    for (const halt of sortedHalts) {
        if (!symbolStates.has(halt.symbol)) {
            symbolStates.set(halt.symbol, {
                state: halt.state,
                reason: halt.reason,
                timestamp: halt.timestamp_et || halt.timestamp || halt.received_at,
                exchange: halt.tape_description,
                high_price: halt.high_price,
                low_price: halt.low_price
            });
            
            // Add to halted symbols set if currently halted
            if (halt.state === 'HALTED') {
                currentlyHaltedSymbols.add(halt.symbol);
            }
        }
    }
}


// Render halt events to the DOM
function renderHalts() {
    const container = document.getElementById('halts-list');
    if (!container) return;

    if (allHalts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">🚨</div>
                <div>No halt events</div>
                <div style="font-size: 10px; margin-top: 4px; opacity: 0.7;">
                    Waiting for data...
                </div>
            </div>
        `;
        return;
    }

    // Sort halts by timestamp (newest first)
    const sortedHalts = [...allHalts].sort((a, b) => {
        const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
        const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;
        
        // Compare timestamps (newest first)
        if (typeof timeA === 'number' && typeof timeB === 'number') {
            return timeB - timeA;
        }
        return timeB.localeCompare(timeA);
    });
    
    container.innerHTML = sortedHalts.map(halt => createHaltElement(halt)).join('');
}

// Create compact HTML element for a halt event
function createHaltElement(halt) {
    // Calculate countdown from unix timestamp
    let countdownStr = 'Unknown';
    
    if (halt.halt_time && typeof halt.halt_time === 'number') {
        // Unix timestamp in seconds
        const haltTimeMs = halt.halt_time * 1000;
        const now = Date.now();
        const elapsedMs = now - haltTimeMs;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        
        // 5-minute countdown (300 seconds)
        const countdownSeconds = Math.max(0, 300 - elapsedSeconds);
        
        if (countdownSeconds > 0) {
            const minutes = Math.floor(countdownSeconds / 60);
            const seconds = countdownSeconds % 60;
            countdownStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else {
            countdownStr = '0:00';
        }
    } else {
        // Fallback for old timestamp format
        const timestampStr = halt.timestamp_et || halt.timestamp || halt.received_at;
        if (timestampStr) {
            // For ET timestamps, extract the time directly from the string
            if (timestampStr.includes('T')) {
                // Format: "2025-09-11T12:10:40.368613-04:00"
                const timePart = timestampStr.split('T')[1];
                const timeWithoutTz = timePart.split('-')[0].split('+')[0]; // Remove timezone
                // Get just HH:MM:SS (no milliseconds for compact view)
                countdownStr = timeWithoutTz.substring(0, 8); // "12:10:40"
            } else {
                countdownStr = 'Unknown';
            }
        }
    }
    
    // Determine initial color class
    let colorClass = 'red'; // default
    let criticalClass = '';
    if (halt.halt_time && typeof halt.halt_time === 'number') {
        const haltTimeMs = halt.halt_time * 1000;
        const now = Date.now();
        const elapsedMs = now - haltTimeMs;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const countdownSeconds = Math.max(0, 300 - elapsedSeconds);
        
        if (countdownSeconds > 180) {
            colorClass = 'green';
        } else if (countdownSeconds > 60) {
            colorClass = 'yellow';
        } else if (countdownSeconds > 10) {
            colorClass = 'red';
        } else {
            colorClass = 'red';
            criticalClass = 'critical';
        }
    }
    
    const stateClass = halt.state.toLowerCase().replace(/_/g, '-');
    // Use reason for display, trim unnecessary "Halt/Pause" text
    let haltTypeDisplay = halt.reason || halt.state.replace(/_/g, ' ');
    // Remove redundant "Halt/Pause" text - we know these are halts
    haltTypeDisplay = haltTypeDisplay.replace(/\s*Halt\/Pause\s*/gi, ' ').trim();

    // Create unique ID for this halt
    const haltId = `${halt.symbol}-${halt.halt_time || Date.now()}`;
    
    // Create compact layout with Symbol component, halt type, and countdown
    return `
        <div class="halt-event ${stateClass}" id="halt-${haltId}" data-symbol="${halt.symbol}" data-halt-time="${halt.halt_time || halt.timestamp_et || halt.timestamp || halt.received_at}">
            <div class="halt-content">
                <div class="halt-symbol-container">
                    ${window.components.Symbol({ 
                        symbol: halt.symbol, 
                        size: "small",
                        onClick: true
                    })}
                </div>
                <div class="halt-state ${stateClass}">${haltTypeDisplay}</div>
                <div class="halt-time countdown ${colorClass} ${criticalClass}" data-halt-time="${halt.halt_time || ''}">${countdownStr}</div>
            </div>
        </div>
    `;
}


// Handle new halt delta from Oracle
function handleHaltDelta(haltData, metadata = {}) {
    console.log(`🚨 Received halt delta:`, haltData);
    
    if (!haltData || !haltData.symbol) {
        console.warn("⚠️ Invalid halt data received:", haltData);
        return;
    }

    // Add new halt to array
    allHalts.push(haltData);

    // Sort halts by timestamp (newest first) and keep only the most recent
    allHalts.sort((a, b) => {
        const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
        const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;
        
        // Compare timestamps (newest first)
        if (typeof timeA === 'number' && typeof timeB === 'number') {
            return timeB - timeA;
        }
        return timeB.localeCompare(timeA);
    });

    // Keep only the most recent halts
    if (allHalts.length > maxHaltsLength) {
        allHalts = allHalts.slice(0, maxHaltsLength);
    }

    // Update halted symbols set
    updateHaltedSymbols();

    // Re-render the display
    renderHalts();

    // Add visual indicator for new halt with slide-down animation
    if (metadata.isDelta) {
        const haltId = `${haltData.symbol}-${haltData.halt_time || Date.now()}`;
        const haltElement = document.getElementById(`halt-${haltId}`);
        if (haltElement) {
            haltElement.classList.add('new');
            console.log(`🎭 Starting slide-down animation for ${haltData.symbol}`);
            
            // Remove the 'new' class after animation completes
            setTimeout(() => {
                haltElement.classList.remove('new');
            }, 800); // Match the slideDown animation duration
        }
    }

    // Log structure for debugging
    if (window.appFlags?.eventsDebug) {
        logHaltStructure([haltData], "DELTA");
    }
}

// Handle halt headlines (bulk data)
function handleHaltHeadlines(haltsData, metadata = {}) {
    console.log(`🚨 Received halt headlines:`, haltsData);
    
    if (!Array.isArray(haltsData)) {
        console.warn("⚠️ Invalid halt headlines data:", haltsData);
        return;
    }

    if (metadata.isHydration) {
        console.log(`🔄 Hydrating with ${haltsData.length} halt events`);
        allHalts = haltsData;
    } else {
        // Merge with existing data
        allHalts = [...haltsData, ...allHalts];
    }

    // Sort halts by timestamp (newest first)
    allHalts.sort((a, b) => {
        const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
        const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;
        
        // Compare timestamps (newest first)
        if (typeof timeA === 'number' && typeof timeB === 'number') {
            return timeB - timeA;
        }
        return timeB.localeCompare(timeA);
    });

    // Keep only the most recent halts
    if (allHalts.length > maxHaltsLength) {
        allHalts = allHalts.slice(0, maxHaltsLength);
    }

    // Update halted symbols set
    updateHaltedSymbols();

    // Re-render the display
    renderHalts();

    // Log structure for debugging
    if (window.appFlags?.eventsDebug) {
        logHaltStructure(haltsData, "HEADLINES");
    }
}

// Handle halt count updates
function handleHaltCount(count) {
    console.log(`📊 Halt count updated: ${count}`);
    // Could update a count display if needed
}

// Handle Oracle hydration complete signal
function handleOracleHydrationComplete() {
    console.log("🔄 Oracle hydration complete - refreshing halt data");
    
    // Request fresh halt data
    window.haltAPI.getHeadlines().then(halts => {
        if (halts && Array.isArray(halts)) {
            console.log(`🔄 Refreshed with ${halts.length} halts after hydration`);
            allHalts = halts;
            
            // Sort halts by timestamp (newest first)
            allHalts.sort((a, b) => {
                const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
                const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;
                
                // Compare timestamps (newest first)
                if (typeof timeA === 'number' && typeof timeB === 'number') {
                    return timeB - timeA;
                }
                return timeB.localeCompare(timeA);
            });
            
            updateHaltedSymbols();
            renderHalts();
        }
    }).catch(e => {
        console.error("❌ Failed to refresh halts after hydration:", e);
    });
}

// IPC event listeners
window.haltAPI.onDelta((haltData, metadata) => {
    handleHaltDelta(haltData, metadata);
});

window.haltAPI.onHeadlines((haltsData, metadata) => {
    handleHaltHeadlines(haltsData, metadata);
});

window.haltAPI.onCount((count) => {
    handleHaltCount(count);
});

window.haltAPI.onHydrationComplete(() => {
    handleOracleHydrationComplete();
});

// Settings update handler
window.settingsAPI.onUpdate((updatedSettings) => {
    console.log("⚙️ Settings updated in halts window");
    settings = updatedSettings;
    // Could adjust display based on new settings
});

// Utility functions for external access
window.haltsAPI = {
    getAllHalts: () => allHalts,
    getCurrentlyHaltedSymbols: () => Array.from(currentlyHaltedSymbols),
    isSymbolHalted: (symbol) => currentlyHaltedSymbols.has(symbol),
    getSymbolState: (symbol) => symbolStates.get(symbol),
    getAllSymbolStates: () => Object.fromEntries(symbolStates),
    getHaltCount: () => allHalts.length,
    getRecentHalts: (minutes = 60) => {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return allHalts.filter(halt => {
            const haltTime = halt.halt_time || halt.timestamp_et || halt.timestamp || halt.received_at;
            
            // Handle unix timestamp (seconds)
            if (typeof haltTime === 'number') {
                return haltTime * 1000 > cutoff;
            }
            
            // Handle string timestamps
            const haltTimeMs = new Date(haltTime).getTime();
            return haltTimeMs > cutoff;
        });
    }
};

// Cleanup function to clear timer when window is closed
window.addEventListener('beforeunload', () => {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
});

console.log("✅ Halts monitor initialized and ready");
