// Configuration - using const for immutable values
const CONFIG = {
    WINDOW_SIZE: 50,
    INTENSITY_THRESHOLD: 0.7,
    UPDATE_INTERVAL: 100, // 100ms instead of every event (10x performance boost)
    LOG_INTERVAL: 5 * 60 * 1000, // 5 minutes
    SMOOTHING_FACTOR: 0.98,
    DECAY_FACTOR: 0.95,
    MIN_STRENGTH: 1000,
    MAX_STRENGTH: 500000,
    MIN_IMBALANCE: 10,
    GLOW_THRESHOLD: 25,
    HEARTBEAT_THRESHOLD: 80,
    ANIMATION_THROTTLE: 50 // 50ms for smooth animations
};

// State management - single object for better memory layout
const state = {
    tradeRate: 0,
    tradeRateRaw: 0,
    dynamicWindowSize: 50,
    currentVolumeBucket: 0,
    flowHistory: [],
    hpTotal: 0,
    dpTotal: 0,
    lastDirection: null,
    pendingUpdate: false,
    lastUpdateTime: 0
};

// DOM element cache - avoid repeated DOM queries
const elements = {
    hp: null,
    dp: null,
    flow: null
};

// Performance optimization: Cache for width changes
const widthCache = {
    hp: 50,
    dp: 50
};

// Initialize DOM elements once
function initializeElements() {
    elements.hp = document.getElementById("flow-hp");
    elements.dp = document.getElementById("flow-dp");
    elements.flow = document.querySelector(".sentiment-flow");
    
    if (!elements.hp || !elements.dp || !elements.flow) {
        console.warn("[progress] Required DOM elements not found");
        return false;
    }
    
    // Set initial widths for balanced start
    elements.hp.style.width = '50%';
    elements.dp.style.width = '50%';
    
    return true;
}

// Optimized strength accumulation
function accumulateStrength(event) {
    if (event.strength) {
        state.currentVolumeBucket += event.strength;
    }
}

// High-performance event processing with early returns
function processMarketFlow(event) {
    // Early validation
    if (!event.hp && !event.dp) return;
    
    const eventStrength = event.strength || event.one_min_volume || CONFIG.MIN_STRENGTH;
    if (eventStrength < CONFIG.MIN_STRENGTH) return;

    // Update trade rate
    state.tradeRateRaw++;

    // Normalize strength efficiently
    const normalizedStrength = Math.min(eventStrength / CONFIG.MAX_STRENGTH, 1);
    
    // Calculate changes
    const hpChange = event.hp > 0 ? event.hp * normalizedStrength : 0;
    const dpChange = event.dp > 0 ? event.dp * normalizedStrength : 0;

    // Update flow history with size limit
    state.flowHistory.unshift({ hp: event.hp, dp: event.dp });
    if (state.flowHistory.length > state.dynamicWindowSize) {
        state.flowHistory.pop();
    }

    // Update totals with decay
    state.hpTotal = state.hpTotal * CONFIG.DECAY_FACTOR + hpChange;
    state.dpTotal = state.dpTotal * CONFIG.DECAY_FACTOR + dpChange;

    // Throttled visual update for performance
    scheduleVisualUpdate();
}

// High-performance visual update with throttling
function scheduleVisualUpdate() {
    if (state.pendingUpdate) return;
    
    const now = performance.now();
    if (now - state.lastUpdateTime < CONFIG.UPDATE_INTERVAL) {
        state.pendingUpdate = true;
        requestAnimationFrame(() => {
            updateFlowVisual();
            state.pendingUpdate = false;
            state.lastUpdateTime = performance.now();
        });
        return;
    }
    
    updateFlowVisual();
    state.lastUpdateTime = now;
}

// Optimized visual update using transforms instead of width
function updateFlowVisual() {
    if (!elements.flow) return;
    
    const total = state.hpTotal + state.dpTotal;
    if (total <= 0) return;
    
    const hpPercent = (state.hpTotal / total) * 100;
    const dpPercent = (state.dpTotal / total) * 100;
    const imbalance = Math.abs(hpPercent - dpPercent);
    const volumeMomentum = total;

    // Use width changes for proper horizontal layout
    updateBarWidths(hpPercent, dpPercent);

    // Throttled CSS custom property updates
    if (Math.abs(imbalance - widthCache.lastImbalance || 0) > 5) {
        const flowVelocity = imbalance / 100;
        const swooshSpeed = Math.max(1, 3 - flowVelocity * 1.5);
        document.documentElement.style.setProperty("--swoosh-speed", `${swooshSpeed}s`);
        widthCache.lastImbalance = imbalance;
    }

    // Batch class updates to reduce reflows
    batchClassUpdates(imbalance, volumeMomentum, hpPercent, dpPercent);
}

// High-performance width updates with caching
function updateBarWidths(hpPercent, dpPercent) {
    // Only update if change is significant (>1%)
    if (Math.abs(hpPercent - widthCache.hp) > 1) {
        widthCache.hp = hpPercent;
        elements.hp.style.width = `${hpPercent}%`;
    }
    
    if (Math.abs(dpPercent - widthCache.dp) > 1) {
        widthCache.dp = dpPercent;
        elements.dp.style.width = `${dpPercent}%`;
    }
}

// Batch class updates to reduce reflows
function batchClassUpdates(imbalance, volumeMomentum, hpPercent, dpPercent) {
    const updates = [];
    
    // Glow effect
    const shouldGlow = imbalance > CONFIG.GLOW_THRESHOLD;
    if (elements.flow.classList.contains('glow') !== shouldGlow) {
        updates.push(() => elements.flow.classList.toggle('glow', shouldGlow));
    }
    
    // Directional flash logic (throttled)
    const currentDirection = hpPercent > dpPercent ? "hp" : "dp";
    if (currentDirection !== state.lastDirection && imbalance > CONFIG.MIN_IMBALANCE) {
        const flashClass = currentDirection === "hp" ? "flash-green" : "flash-red";
        updates.push(() => {
            elements.flow.classList.remove("flash-green", "flash-red");
            elements.flow.classList.add(flashClass);
            setTimeout(() => elements.flow.classList.remove(flashClass), 150);
        });
        state.lastDirection = currentDirection;
    }
    
    // Heartbeat effect (throttled)
    if (volumeMomentum > CONFIG.HEARTBEAT_THRESHOLD && !elements.flow.classList.contains('heartbeat')) {
        updates.push(() => {
            elements.flow.classList.add("heartbeat");
            setTimeout(() => elements.flow.classList.remove("heartbeat"), 1000);
        });
    }
    
    // Body class toggles (throttled)
    const shouldStrongHp = hpPercent > CONFIG.INTENSITY_THRESHOLD * 100;
    const shouldStrongDp = dpPercent > CONFIG.INTENSITY_THRESHOLD * 100;
    
    if (document.body.classList.contains('strong-hp') !== shouldStrongHp) {
        updates.push(() => document.body.classList.toggle('strong-hp', shouldStrongHp));
    }
    if (document.body.classList.contains('strong-dp') !== shouldStrongDp) {
        updates.push(() => document.body.classList.toggle('strong-dp', shouldStrongDp));
    }
    
    // Execute all updates in one batch
    if (updates.length > 0) {
        requestAnimationFrame(() => {
            updates.forEach(update => update());
        });
    }
}

// Optimized trade rate update
function updateTradeRate() {
    const minSize = 0;
    const maxSize = 400;

    // Smoothing calculation
    state.tradeRate = state.tradeRate * CONFIG.SMOOTHING_FACTOR + 
                     state.tradeRateRaw * (1 - CONFIG.SMOOTHING_FACTOR);

    // Dynamic window size calculation
    const normalizedRate = Math.min(state.tradeRate, 2) / 2;
    state.dynamicWindowSize = Math.floor(minSize + normalizedRate * (maxSize - minSize));

    // Decay when idle
    if (state.tradeRateRaw === 0) {
        state.tradeRate *= CONFIG.DECAY_FACTOR;
    }

    state.tradeRateRaw = 0;
}

// Efficient logging with debouncing
let logTimeout = null;
function scheduleLogging() {
    if (logTimeout) clearTimeout(logTimeout);
    
    logTimeout = setTimeout(() => {
        const now = new Date().toISOString();
        if (window.progressAPI && window.progressAPI.log) {
            window.progressAPI.log(now, state.currentVolumeBucket);
        }
        state.currentVolumeBucket = 0;
        logTimeout = null;
    }, CONFIG.LOG_INTERVAL);
}

// Main event handler with array normalization
function handleAlerts(events) {
    // Normalize to array efficiently
    const eventArray = Array.isArray(events) ? events : [events];
    
    // Process events in batch
    for (let i = 0; i < eventArray.length; i++) {
        const event = eventArray[i];
        accumulateStrength(event);
        processMarketFlow(event);
    }
}

// Initialize the application
function initialize() {
    if (!initializeElements()) {
        console.error("[progress] Failed to initialize DOM elements");
        return;
    }

    // Set up event listeners
    if (window.eventsAPI && window.eventsAPI.onAlert) {
        window.eventsAPI.onAlert(handleAlerts);
    }

    // Set up intervals
    const updateInterval = setInterval(updateTradeRate, CONFIG.UPDATE_INTERVAL);
    const logInterval = setInterval(scheduleLogging, CONFIG.LOG_INTERVAL);

    // Initialize visual state
    updateFlowVisual();

    // Cleanup function
    return () => {
        clearInterval(updateInterval);
        clearInterval(logInterval);
        if (logTimeout) clearTimeout(logTimeout);
    };
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Export for testing if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initialize, processMarketFlow, updateFlowVisual };
}
