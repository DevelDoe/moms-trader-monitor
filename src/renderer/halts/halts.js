// halts.js — Trading Halts Monitor: real-time halt data consumption and display

let allHalts = [];
let currentlyHaltedSymbols = new Set();
let symbolStates = new Map(); // Track current state for each symbol
let maxHaltsLength = 100; // Keep last 100 halt events
let settings = {};

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

    // Load settings
    try {
        settings = await window.settingsAPI.get();
        console.log("✅ Settings loaded in halts window:", settings);
    } catch (e) {
        console.warn("⚠️ Failed to load settings in halts window:", e);
        settings = {}; // fallback
    }

    // Request initial halt data from main process
    try {
        const halts = await window.haltAPI.getHeadlines();
        if (halts && Array.isArray(halts)) {
            console.log(`📊 Received ${halts.length} initial halts from Oracle`);
            allHalts = halts;
            
            // Sort halts by timestamp (newest first)
            allHalts.sort((a, b) => {
                const timeA = a.timestamp_et || a.timestamp || a.received_at;
                const timeB = b.timestamp_et || b.timestamp || b.received_at;
                // Compare timestamp strings directly (newest first)
                return timeB.localeCompare(timeA);
            });
            
            updateHaltedSymbols();
            renderHalts();
        } else {
            console.log("📊 No initial halts available");
        }
    } catch (e) {
        console.error("❌ Failed to get initial halts:", e);
    }

    // Request halt count
    try {
        const count = await window.haltAPI.getCount();
        console.log(`📊 Halt count: ${count}`);
    } catch (e) {
        console.error("❌ Failed to get halt count:", e);
    }
});

// Update the set of currently halted symbols and track symbol states
function updateHaltedSymbols() {
    currentlyHaltedSymbols.clear();
    symbolStates.clear();
    
    // Process halts in reverse chronological order to get latest state for each symbol
    const sortedHalts = [...allHalts].sort((a, b) => {
        // Use timestamp_et if available, otherwise fall back to timestamp or received_at
        const timeA = a.timestamp_et || a.timestamp || a.received_at;
        const timeB = b.timestamp_et || b.timestamp || b.received_at;
        // Compare timestamp strings directly (newest first)
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
                <div>No halt events received yet</div>
                <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">
                    Waiting for trading halt data from Oracle...
                </div>
            </div>
        `;
        return;
    }

    // Sort halts by timestamp (newest first)
    const sortedHalts = [...allHalts].sort((a, b) => {
        const timeA = a.timestamp_et || a.timestamp || a.received_at;
        const timeB = b.timestamp_et || b.timestamp || b.received_at;
        // Compare timestamp strings directly (newest first)
        return timeB.localeCompare(timeA);
    });
    
    container.innerHTML = sortedHalts.map(halt => createHaltElement(halt)).join('');
}

// Create HTML element for a halt event
function createHaltElement(halt) {
    // Use timestamp_et if available, otherwise fall back to timestamp or received_at
    const timestampStr = halt.timestamp_et || halt.timestamp || halt.received_at;
    
    // Extract time directly from timestamp_et string (no Date conversion)
    let timeStr;
    if (timestampStr) {
        // For ET timestamps, extract the time directly from the string
        if (timestampStr.includes('T')) {
            // Format: "2025-09-11T12:10:40.368613-04:00"
            const timePart = timestampStr.split('T')[1];
            const timeWithMs = timePart.split('-')[0]; // "12:10:40.368613" (keep milliseconds, remove timezone)
            timeStr = timeWithMs; // Show time with milliseconds for precision
        } else {
            // For other formats, try to extract time without Date conversion
            timeStr = 'Unknown';
        }
    } else {
        timeStr = 'Unknown';
    }
    
    const stateClass = halt.state.toLowerCase().replace(/_/g, '-');
    const stateDisplay = halt.state.replace(/_/g, ' ');
    
    // Get current symbol state for additional context
    const currentState = symbolStates.get(halt.symbol);
    const isCurrentState = currentState && currentState.timestamp === (halt.timestamp_et || halt.timestamp || halt.received_at);
    
    // Add price information if available
    const priceInfo = halt.high_price && halt.low_price 
        ? `<div class="halt-prices">Price Range: $${halt.low_price} - $${halt.high_price}</div>`
        : '';

    return `
        <div class="halt-event ${stateClass} ${isCurrentState ? 'current-state' : ''}" data-symbol="${halt.symbol}" data-timestamp="${halt.timestamp_et || halt.timestamp || halt.received_at}">
            <div class="halt-header">
                <div class="halt-symbol">${halt.symbol}</div>
                <div class="halt-state ${stateClass}">${stateDisplay}</div>
                ${isCurrentState ? '<div class="current-indicator">CURRENT</div>' : ''}
            </div>
            <div class="halt-details">
                <div class="halt-reason">${halt.reason || 'No reason provided'}</div>
                <div class="halt-meta">
                    <div class="halt-exchange">${halt.tape_description || 'Unknown Exchange'}</div>
                    <div class="halt-time">${timeStr}</div>
                </div>
                ${priceInfo}
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
        const timeA = a.timestamp_et || a.timestamp || a.received_at;
        const timeB = b.timestamp_et || b.timestamp || b.received_at;
        // Compare timestamp strings directly (newest first)
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

    // Add visual indicator for new halt
    if (metadata.isDelta) {
        const haltTimestamp = haltData.timestamp_et || haltData.timestamp || haltData.received_at;
        const haltElement = document.querySelector(`[data-symbol="${haltData.symbol}"][data-timestamp="${haltTimestamp}"]`);
        if (haltElement) {
            haltElement.classList.add('new');
            setTimeout(() => {
                haltElement.classList.remove('new');
            }, 500);
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
        const timeA = a.timestamp_et || a.timestamp || a.received_at;
        const timeB = b.timestamp_et || b.timestamp || b.received_at;
        // Compare timestamp strings directly (newest first)
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
                const timeA = a.timestamp_et || a.timestamp || a.received_at;
                const timeB = b.timestamp_et || b.timestamp || b.received_at;
                // Compare timestamp strings directly (newest first)
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
            const haltTime = halt.timestamp_et || halt.timestamp || halt.received_at;
            // Convert halt time to milliseconds for comparison
            const haltTimeMs = new Date(haltTime).getTime();
            return haltTimeMs > cutoff;
        });
    }
};

console.log("✅ Halts monitor initialized and ready");
