// halts.js — Trading Halts Monitor: real-time halt data consumption and display

let allHalts = [];
let currentlyHaltedSymbols = new Set();
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
            updateHaltedSymbols();
            renderHalts();
            updateStats();
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

// Update the set of currently halted symbols
function updateHaltedSymbols() {
    currentlyHaltedSymbols.clear();
    
    // Process halts in reverse chronological order to get latest state for each symbol
    const sortedHalts = [...allHalts].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    for (const halt of sortedHalts) {
        if (!currentlyHaltedSymbols.has(halt.symbol)) {
            if (halt.state === 'HALTED') {
                currentlyHaltedSymbols.add(halt.symbol);
            }
            // Note: We don't remove from set on RESUMED because we want to track the latest state
            // The set will be rebuilt each time
        }
    }
    
    // Now remove symbols that have been resumed
    for (const halt of sortedHalts) {
        if (halt.state === 'RESUMED') {
            currentlyHaltedSymbols.delete(halt.symbol);
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
    const sortedHalts = [...allHalts].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    container.innerHTML = sortedHalts.map(halt => createHaltElement(halt)).join('');
}

// Create HTML element for a halt event
function createHaltElement(halt) {
    const timestamp = new Date(halt.timestamp);
    const timeStr = timestamp.toLocaleTimeString();
    const dateStr = timestamp.toLocaleDateString();
    
    const stateClass = halt.state.toLowerCase().replace('_', '-');
    const stateDisplay = halt.state.replace('_', ' ');
    
    const indicatorsStr = halt.indicators && halt.indicators.length > 0 
        ? halt.indicators.map(ind => `<span>${ind}</span>`).join('')
        : '';

    return `
        <div class="halt-event ${stateClass}" data-symbol="${halt.symbol}" data-timestamp="${halt.timestamp}">
            <div class="halt-header">
                <div class="halt-symbol">${halt.symbol}</div>
                <div class="halt-state ${stateClass}">${stateDisplay}</div>
            </div>
            <div class="halt-details">
                <div class="halt-reason">${halt.reason || 'No reason provided'}</div>
                <div class="halt-meta">
                    <div class="halt-exchange">${halt.tape_description || 'Unknown Exchange'}</div>
                    <div class="halt-time">${dateStr} ${timeStr}</div>
                </div>
                ${indicatorsStr ? `<div class="halt-indicators">Indicators: ${indicatorsStr}</div>` : ''}
            </div>
        </div>
    `;
}

// Update statistics display
function updateStats() {
    const totalHaltsEl = document.getElementById('total-halts');
    const currentlyHaltedEl = document.getElementById('currently-halted');
    const recentEventsEl = document.getElementById('recent-events');

    if (totalHaltsEl) {
        totalHaltsEl.textContent = allHalts.length;
    }
    
    if (currentlyHaltedEl) {
        currentlyHaltedEl.textContent = currentlyHaltedSymbols.size;
    }
    
    if (recentEventsEl) {
        // Count events from last hour
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const recentCount = allHalts.filter(halt => halt.timestamp > oneHourAgo).length;
        recentEventsEl.textContent = recentCount;
    }
}

// Handle new halt delta from Oracle
function handleHaltDelta(haltData, metadata = {}) {
    console.log(`🚨 Received halt delta:`, haltData);
    
    if (!haltData || !haltData.symbol) {
        console.warn("⚠️ Invalid halt data received:", haltData);
        return;
    }

    // Add to beginning of array (newest first)
    allHalts.unshift(haltData);

    // Keep only the most recent halts
    if (allHalts.length > maxHaltsLength) {
        allHalts = allHalts.slice(0, maxHaltsLength);
    }

    // Update halted symbols set
    updateHaltedSymbols();

    // Re-render the display
    renderHalts();
    updateStats();

    // Add visual indicator for new halt
    if (metadata.isDelta) {
        const haltElement = document.querySelector(`[data-symbol="${haltData.symbol}"][data-timestamp="${haltData.timestamp}"]`);
        if (haltElement) {
            haltElement.classList.add('new');
            setTimeout(() => {
                haltElement.classList.remove('new');
            }, 500);
        }
    }

    // Log structure for debugging
    if (process.env.DEBUG === "true") {
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

    // Keep only the most recent halts
    if (allHalts.length > maxHaltsLength) {
        allHalts = allHalts.slice(0, maxHaltsLength);
    }

    // Update halted symbols set
    updateHaltedSymbols();

    // Re-render the display
    renderHalts();
    updateStats();

    // Log structure for debugging
    if (process.env.DEBUG === "true") {
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
            updateHaltedSymbols();
            renderHalts();
            updateStats();
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
    getHaltCount: () => allHalts.length,
    getRecentHalts: (minutes = 60) => {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return allHalts.filter(halt => halt.timestamp > cutoff);
    }
};

console.log("✅ Halts monitor initialized and ready");
