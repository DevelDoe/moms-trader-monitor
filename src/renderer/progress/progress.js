// Session-based buy/sell tracking configuration
const CONFIG = {
    UPDATE_INTERVAL: 1000, // Update every second
    SESSION_TRANSITION_BUFFER: 5 * 60 * 1000, // 5 minutes buffer for session transitions
    MIN_VOLUME_THRESHOLD: 100, // Minimum volume to count as significant trade
    HOT_MARKET_THRESHOLD: 0.40, // >40% more buying = hot market (bullish)
    WARM_MARKET_THRESHOLD: 0.10, // >10% more buying = warm market
    COOL_MARKET_THRESHOLD: 0.10, // >10% more selling = cool market
    COLD_MARKET_THRESHOLD: 0.40, // >40% more selling = cold market (bearish)
    MAX_EVENTS_PER_BATCH: 50, // Maximum events to process in one batch
    MEMORY_CLEANUP_INTERVAL: 30000, // Clean up memory every 30 seconds
    DEBUG_LOGGING: false, // Disable excessive debug logging in production
    LOG_THROTTLE_INTERVAL: 60000 // Only log debug info once per minute max
};

// Development logging controls to prevent memory leaks
const debugLog = {
    lastSessionLog: 0,
    lastTimeLog: 0,
    
    // Throttled session logging - only log when session actually changes or every minute
    session: function(message, force = false) {
        const now = Date.now();
        if (force || (now - this.lastSessionLog) > CONFIG.LOG_THROTTLE_INTERVAL) {
            if (CONFIG.DEBUG_LOGGING || force) {
                console.log(`[progress] ${message}`);
            }
            this.lastSessionLog = now;
        }
    },
    
    // Throttled time logging - only log once per minute instead of every second
    time: function(message) {
        const now = Date.now();
        if (CONFIG.DEBUG_LOGGING && (now - this.lastTimeLog) > CONFIG.LOG_THROTTLE_INTERVAL) {
            console.log(`[progress] ${message}`);
            this.lastTimeLog = now;
        }
    },
    
    // Regular logging for important events
    info: function(message) {
        console.log(`[progress] ${message}`);
    },
    
    // Warning logging (always shown)
    warn: function(message) {
        console.warn(`[progress] ${message}`);
    },
    
    // Error logging (always shown)
    error: function(message) {
        console.error(`[progress] ${message}`);
    }
};

// Trading session definitions (in 24-hour format)
const SESSIONS = {
    PRE: { name: 'pre', start: 4, end: 7, color: '#4A90E2' },
    NEWS: { name: 'news', start: 7, end: 9.5, color: '#F5A623' },
    OPEN: { name: 'open', start: 9.5, end: 15, color: '#7ED321' },
    POWER: { name: 'power', start: 15, end: 16, color: '#D0021B' },
    POST: { name: 'post', start: 16, end: 20, color: '#9013FE' }
};

// Session data tracking
const sessionData = {
    current: null,
    buyVolume: 0,
    sellVolume: 0,
    totalTrades: 0,
    lastUpdate: Date.now(),
    eventBuffer: [], // Buffer for batching events
    maxBufferSize: 100 // Limit buffer size to prevent memory leaks
};

// DOM element cache
const elements = {
    buyBar: null,
    sellBar: null,
    container: null,
    buyInfo: null,
    sellInfo: null,
    volInfo: null,
    marketTemp: null,
    heroesCount: null,
    nyClock: null,
    countdownTimer: null
};

// Get current trading session based on New York time
function getCurrentSession() {
    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = nyTime.getHours() + (nyTime.getMinutes() / 60);
    
    debugLog.time(`Current NY time: ${nyTime.toLocaleTimeString()}, Hour: ${currentHour.toFixed(2)}`);
    
    for (const [key, session] of Object.entries(SESSIONS)) {
        if (currentHour >= session.start && currentHour < session.end) {
            debugLog.session(`Active session: ${session.name} (${session.start}:00 - ${session.end}:00)`);
            return { key, ...session };
        }
    }
    
    // Default to POST session if outside trading hours
    debugLog.session(`Outside trading hours, defaulting to POST session`);
    return { key: 'POST', ...SESSIONS.POST };
}

// Update NY clock display
function updateNYClock() {
    if (!elements.nyClock) return;
    
    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const timeString = nyTime.toLocaleTimeString("en-US", {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    
    elements.nyClock.textContent = timeString;
}

// Get next session and calculate countdown
function getNextSession() {
    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = nyTime.getHours() + (nyTime.getMinutes() / 60);
    
    // Find current session
    let currentSession = null;
    for (const [key, session] of Object.entries(SESSIONS)) {
        if (currentHour >= session.start && currentHour < session.end) {
            currentSession = { key, ...session };
            break;
        }
    }
    
    // If no current session, find next session
    if (!currentSession) {
        // Find the next session that starts today
        for (const [key, session] of Object.entries(SESSIONS)) {
            if (currentHour < session.start) {
                return { key, ...session };
            }
        }
        // If no session today, return first session tomorrow
        return { key: 'PRE', ...SESSIONS.PRE };
    }
    
    return currentSession;
}

// Calculate countdown to session end or next session
function calculateCountdown() {
    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = nyTime.getHours() + (nyTime.getMinutes() / 60);
    
    // Find current session
    let currentSession = null;
    for (const [key, session] of Object.entries(SESSIONS)) {
        if (currentHour >= session.start && currentHour < session.end) {
            currentSession = { key, ...session };
            break;
        }
    }
    
    let targetTime;
    let sessionName;
    
    if (currentSession) {
        // Countdown to end of current session
        targetTime = currentSession.end;
        sessionName = currentSession.name.toUpperCase();
    } else {
        // Find next session
        const nextSession = getNextSession();
        targetTime = nextSession.start;
        sessionName = nextSession.name.toUpperCase();
    }
    
    // Calculate time until target
    const targetDate = new Date(nyTime);
    targetDate.setHours(Math.floor(targetTime), (targetTime % 1) * 60, 0, 0);
    
    // If target is tomorrow, add a day
    if (targetDate <= nyTime) {
        targetDate.setDate(targetDate.getDate() + 1);
    }
    
    const timeDiff = targetDate - nyTime;
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
    
    return {
        hours,
        minutes,
        seconds,
        sessionName,
        timeString: `${hours}h ${minutes}m ${seconds}s`
    };
}

// Update countdown display
function updateCountdown() {
    if (!elements.countdownTimer) return;
    
    const countdown = calculateCountdown();
    elements.countdownTimer.textContent = countdown.timeString;
    
    // Update session label if needed
    const sessionLabel = document.querySelector('.session-label');
    if (sessionLabel) {
        sessionLabel.textContent = `${countdown.sessionName} MARKET:`;
    }
}

// Initialize DOM elements
function initializeElements() {
    elements.buyBar = document.getElementById("flow-hp");
    elements.sellBar = document.getElementById("flow-dp");
    elements.container = document.querySelector(".sentiment-flow");
    elements.buyInfo = document.getElementById("buy-info");
    elements.sellInfo = document.getElementById("sell-info");
    elements.volInfo = document.getElementById("vol-info");
    elements.marketTemp = document.getElementById("market-temp");
    elements.heroesCount = document.getElementById("heroes-count");
    elements.nyClock = document.getElementById("ny-clock");
    elements.countdownTimer = document.getElementById("countdown-timer");
    
    if (!elements.buyBar || !elements.sellBar || !elements.container) {
        debugLog.warn("Required DOM elements not found");
        return false;
    }
    
    // Set initial balanced state
    updateDisplay(50, 50, 'closed', 0, 0);
    
    return true;
}


// Process market events for buy/sell tracking with batching
function processMarketEvent(event) {
    // Early validation
    if (!event.hp && !event.dp) return;
    
    const volume = event.strength || event.one_min_volume || 0;
    if (volume < CONFIG.MIN_VOLUME_THRESHOLD) return;

    // Check for High of Day alert and trigger sound
    const isHOD = event.isHighOfDay === true;
    if (isHOD) {
        debugLog.info(`🎯 HOD Alert detected for ${event.hero || event.symbol || 'unknown'}`);
        // Use the centralized AudioManager to play HOD chime
        if (window.audioManager && window.audioManager.playHodChime) {
            window.audioManager.playHodChime();
        } else {
            debugLog.warn("⚠️ AudioManager not available for HOD chime");
        }
    }

    // Check if we need to reset for new session
    const currentSession = getCurrentSession();
    if (sessionData.current !== currentSession.key) {
        resetSessionData(currentSession);
    }

    // Add to buffer instead of processing immediately
    sessionData.eventBuffer.push({
        hp: event.hp || 0,
        dp: event.dp || 0,
        volume: volume,
        timestamp: Date.now()
    });
    
    // Prevent buffer overflow
    if (sessionData.eventBuffer.length > sessionData.maxBufferSize) {
        sessionData.eventBuffer.shift(); // Remove oldest event
    }
    
    // Process buffer in batches
    processBatchedEvents();
}

// Process events in batches to reduce memory pressure
function processBatchedEvents() {
    if (sessionData.eventBuffer.length === 0) return;
    
    let totalBuyVolume = 0;
    let totalSellVolume = 0;
    let tradeCount = 0;
    
    // Process events in smaller batches to prevent memory spikes
    const batchSize = Math.min(sessionData.eventBuffer.length, CONFIG.MAX_EVENTS_PER_BATCH);
    const eventsToProcess = sessionData.eventBuffer.splice(0, batchSize);
    
    // Process batch
    for (const event of eventsToProcess) {
        if (event.hp > event.dp) {
            totalBuyVolume += event.volume;
        } else if (event.dp > event.hp) {
            totalSellVolume += event.volume;
        }
        tradeCount++;
    }
    
    // Update session data
    sessionData.buyVolume += totalBuyVolume;
    sessionData.sellVolume += totalSellVolume;
    sessionData.totalTrades += tradeCount;
    sessionData.lastUpdate = Date.now();
    
    // Update display (throttled)
    throttledUpdateDisplay();
    
    // If there are more events, schedule another batch processing
    if (sessionData.eventBuffer.length > 0) {
        requestAnimationFrame(processBatchedEvents);
    }
}

// Reset session data for new session
function resetSessionData(newSession) {
    debugLog.info(`Starting new session: ${newSession.name}`);
    sessionData.current = newSession.key;
    sessionData.buyVolume = 0;
    sessionData.sellVolume = 0;
    sessionData.totalTrades = 0;
    sessionData.lastUpdate = Date.now();
    // Clear event buffer to prevent memory leaks
    sessionData.eventBuffer.length = 0;
}

// Throttled display update to prevent excessive DOM manipulation
let displayUpdatePending = false;
let lastDisplayUpdate = 0;
const DISPLAY_UPDATE_THROTTLE = 250; // Update max every 250ms

function throttledUpdateDisplay() {
    const now = Date.now();
    if (displayUpdatePending || (now - lastDisplayUpdate) < DISPLAY_UPDATE_THROTTLE) {
        if (!displayUpdatePending) {
            displayUpdatePending = true;
            requestAnimationFrame(() => {
                updateSessionDisplay();
                displayUpdatePending = false;
                lastDisplayUpdate = Date.now();
            });
        }
        return;
    }
    updateSessionDisplay();
    lastDisplayUpdate = now;
}

// Update session display with buy/sell data
function updateSessionDisplay() {
    const currentSession = getCurrentSession();
    const totalVolume = sessionData.buyVolume + sessionData.sellVolume;
    
    if (totalVolume === 0) {
        // No data yet, show balanced
        updateDisplay(50, 50, currentSession.name, 0, 0);
        return;
    }
    
    const buyPercent = (sessionData.buyVolume / totalVolume) * 100;
    const sellPercent = (sessionData.sellVolume / totalVolume) * 100;
    
    // Determine market temperature based on buy/sell direction
    const buySellDiff = buyPercent - sellPercent;
    let marketTemp = 'balanced';
    let tempColor = '#FFFFFF';
    
    if (buySellDiff > CONFIG.HOT_MARKET_THRESHOLD * 100) {
        marketTemp = 'hot';
        tempColor = '#FF4444';
    } else if (buySellDiff > CONFIG.WARM_MARKET_THRESHOLD * 100) {
        marketTemp = 'warm';
        tempColor = '#FF8844';
    } else if (buySellDiff < -CONFIG.COLD_MARKET_THRESHOLD * 100) {
        marketTemp = 'cold';
        tempColor = '#4444FF';
    } else if (buySellDiff < -CONFIG.COOL_MARKET_THRESHOLD * 100) {
        marketTemp = 'cool';
        tempColor = '#4488FF';
    } else {
        marketTemp = 'balanced';
        tempColor = '#FFFFFF';
    }
    
    // Format volume for display
    const formatVolume = (vol) => {
        if (vol >= 1000000000) return `${(vol / 1000000000).toFixed(1)}B`;
        if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
        if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
        return vol.toString();
    };
    
    // Get color for total volume based on 0-1B range
    const getTotalVolumeColor = (volume) => {
        if (volume === 0) return '#888888'; // Gray for no volume
        
        const billion = 1000000000;
        const ratio = Math.min(volume / billion, 1); // Cap at 1 for volumes over 1B
        
        if (ratio <= 0.25) {
            // Gray to light blue (0-250M)
            const t = ratio / 0.25;
            const r = Math.round(136 + (135 - 136) * t); // 136 -> 135
            const g = Math.round(136 + (206 - 136) * t); // 136 -> 206
            const b = Math.round(136 + (235 - 136) * t); // 136 -> 235
            return `rgb(${r}, ${g}, ${b})`;
        } else if (ratio <= 0.5) {
            // Light blue to dark blue (250M-500M)
            const t = (ratio - 0.25) / 0.25;
            const r = Math.round(135 + (0 - 135) * t); // 135 -> 0
            const g = Math.round(206 + (100 - 206) * t); // 206 -> 100
            const b = Math.round(235 + (200 - 235) * t); // 235 -> 200
            return `rgb(${r}, ${g}, ${b})`;
        } else {
            // Dark blue to orange (500M-1B)
            const t = (ratio - 0.5) / 0.5;
            const r = Math.round(0 + (255 - 0) * t); // 0 -> 255
            const g = Math.round(100 + (165 - 100) * t); // 100 -> 165
            const b = Math.round(200 + (0 - 200) * t); // 200 -> 0
            return `rgb(${r}, ${g}, ${b})`;
        }
    };
    
    updateDisplay(buyPercent, sellPercent, currentSession.name, totalVolume, tempColor);
    
    // Update banner elements
    if (elements.buyInfo) {
        const buyVol = formatVolume(sessionData.buyVolume);
        elements.buyInfo.textContent = buyVol;
    }
    
    if (elements.sellInfo) {
        const sellVol = formatVolume(sessionData.sellVolume);
        elements.sellInfo.textContent = sellVol;
    }
    
    if (elements.volInfo) {
        const totalVol = formatVolume(totalVolume);
        const totalColor = getTotalVolumeColor(totalVolume);
        elements.volInfo.style.color = totalColor;
        elements.volInfo.textContent = totalVol;
    }
    
    if (elements.marketTemp) {
        elements.marketTemp.textContent = marketTemp;
        elements.marketTemp.style.color = tempColor;
    }
}

// Update the visual display
function updateDisplay(buyPercent, sellPercent, sessionName, totalVolume, tempColor) {
    if (!elements.buyBar || !elements.sellBar) return;
    
    // Update bar widths
    elements.buyBar.style.width = `${buyPercent}%`;
    elements.sellBar.style.width = `${sellPercent}%`;
    
    // Add visual effects based on market temperature
    updateVisualEffects(buyPercent, sellPercent, totalVolume);
}

// Update visual effects based on market conditions
function updateVisualEffects(buyPercent, sellPercent, totalVolume) {
    if (!elements.container) return;
    
    const buySellDiff = buyPercent - sellPercent;
    const imbalance = Math.abs(buySellDiff);
    const hasVolume = totalVolume > 0;
    
    // Remove all effect classes
    elements.container.classList.remove('glow', 'heartbeat', 'flash-green', 'flash-red', 'cold-market', 'warm-market', 'cool-market');
    
    // Add appropriate effects based on market temperature
    if (hasVolume) {
        if (buySellDiff > CONFIG.HOT_MARKET_THRESHOLD * 100) {
            // Hot market - intense effects
            elements.container.classList.add('glow', 'heartbeat');
        } else if (buySellDiff > CONFIG.WARM_MARKET_THRESHOLD * 100) {
            // Warm market - subtle glow
            elements.container.classList.add('warm-market');
        } else if (buySellDiff < -CONFIG.COLD_MARKET_THRESHOLD * 100) {
            // Cold market - cold effects
            elements.container.classList.add('cold-market');
        } else if (buySellDiff < -CONFIG.COOL_MARKET_THRESHOLD * 100) {
            // Cool market - subtle cool effects
            elements.container.classList.add('cool-market');
        }
    }
    
    // Flash effect for significant moves
    if (imbalance > 20 && hasVolume) {
        const flashClass = buyPercent > sellPercent ? 'flash-green' : 'flash-red';
        elements.container.classList.add(flashClass);
        setTimeout(() => elements.container.classList.remove(flashClass), 300);
    }
}

// Main event handler for market alerts
function handleAlerts(events) {
    // Normalize to array efficiently
    const eventArray = Array.isArray(events) ? events : [events];
    
    // Process events in batch
    for (let i = 0; i < eventArray.length; i++) {
        const event = eventArray[i];
        processMarketEvent(event);
    }
}

// Periodic session check and display update
function checkSessionAndUpdate() {
    const currentSession = getCurrentSession();
    
    // Check if session changed
    if (sessionData.current !== currentSession.key) {
        resetSessionData(currentSession);
    }
    
    // Update display even if no new events
    updateSessionDisplay();
}

// Store intervals for proper cleanup
const intervals = {
    updateInterval: null,
    clockInterval: null,
    memoryCleanupInterval: null
};

// Periodic memory cleanup to prevent leaks
function performMemoryCleanup() {
    // Force garbage collection hint
    if (window.gc && typeof window.gc === 'function') {
        window.gc();
    }
    
    // Clear console buffer in development to prevent memory accumulation
    if (typeof console.clear === 'function' && performance && performance.memory) {
        const memoryInfo = performance.memory;
        const usedMB = Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024);
        
        // Clear console if memory usage is high (>1GB) to free up dev tools memory
        if (usedMB > 1024) {
            console.clear();
            debugLog.info(`Cleared console buffer due to high memory usage: ${usedMB}MB`);
        }
    }
    
    // Clear old event buffer data if it gets too large
    if (sessionData.eventBuffer.length > sessionData.maxBufferSize * 2) {
        debugLog.warn("Event buffer too large, clearing oldest events");
        sessionData.eventBuffer = sessionData.eventBuffer.slice(-sessionData.maxBufferSize);
    }
    
    // Log memory usage if available (throttled)
    if (performance && performance.memory) {
        const memoryInfo = performance.memory;
        const usedMB = Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024);
        const limitMB = Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024);
        
        if (usedMB > limitMB * 0.8) { // If using >80% of available memory
            debugLog.warn(`High memory usage: ${usedMB}MB/${limitMB}MB`);
        }
    }
}

// Update check button function removed - no manual updates needed

// Initialize the application
function initialize() {
    // Initialize header component with update notifications
    const headerContainer = document.getElementById('header-container');
    if (headerContainer && window.HeaderComponent) {
        window.progressHeader = new window.HeaderComponent(headerContainer, {
            icon: '<img src="./img/logo.png" class="header-logo" alt="Arcane Monitor">',
            text: 'Arcane Monitor (progress)',
            className: 'progress-header',
            showUpdateNotification: true,
            showControlButtons: true // Enable control buttons for progress window
        });
        
        // Update check button removed - no manual updates needed
    }

    if (!initializeElements()) {
        debugLog.error("Failed to initialize DOM elements");
        return;
    }

    // Initialize current session
    const currentSession = getCurrentSession();
    resetSessionData(currentSession);

    // Set up event listeners
    if (window.eventsAPI && window.eventsAPI.onAlert) {
        window.eventsAPI.onAlert(handleAlerts);
    }

    // Set up XP Active Stocks count listener
    if (window.progressAPI && window.progressAPI.onXpActiveStocksCount) {
        window.progressAPI.onXpActiveStocksCount((event, data) => {
            if (elements.heroesCount) {
                elements.heroesCount.textContent = data.count;
            }
        });
    }

    // Set up periodic updates with proper interval tracking
    intervals.updateInterval = setInterval(checkSessionAndUpdate, CONFIG.UPDATE_INTERVAL);
    
    // Set up periodic memory cleanup
    intervals.memoryCleanupInterval = setInterval(performMemoryCleanup, CONFIG.MEMORY_CLEANUP_INTERVAL);
    
    // Initial display update - do this first to show current time immediately
    updateSessionDisplay();
    updateNYClock();
    updateCountdown();
    
    // Set up clock and countdown updates - start after a short delay to sync with second boundaries
    const now = new Date();
    const delayToNextSecond = 1000 - (now.getMilliseconds());
    
    setTimeout(() => {
        // Update immediately when we hit the next second
        updateNYClock();
        updateCountdown();
        
        // Then continue updating every second
        intervals.clockInterval = setInterval(() => {
            updateNYClock();
            updateCountdown();
        }, 1000);
    }, delayToNextSecond);

    debugLog.info(`Initialized for session: ${currentSession.name}`);

    // Cleanup function
    return () => {
        if (intervals.updateInterval) {
            clearInterval(intervals.updateInterval);
            intervals.updateInterval = null;
        }
        if (intervals.clockInterval) {
            clearInterval(intervals.clockInterval);
            intervals.clockInterval = null;
        }
        if (intervals.memoryCleanupInterval) {
            clearInterval(intervals.memoryCleanupInterval);
            intervals.memoryCleanupInterval = null;
        }
        // Clear any pending animation frames
        if (displayUpdatePending) {
            displayUpdatePending = false;
        }
        // Clear event buffer to free memory
        sessionData.eventBuffer.length = 0;
    };
}

// Cleanup function for page unload
function cleanup() {
    if (intervals.updateInterval) {
        clearInterval(intervals.updateInterval);
        intervals.updateInterval = null;
    }
    if (intervals.clockInterval) {
        clearInterval(intervals.clockInterval);
        intervals.clockInterval = null;
    }
    if (intervals.memoryCleanupInterval) {
        clearInterval(intervals.memoryCleanupInterval);
        intervals.memoryCleanupInterval = null;
    }
    if (displayUpdatePending) {
        displayUpdatePending = false;
    }
    sessionData.eventBuffer.length = 0;
    debugLog.info("Cleaned up intervals and memory");
}

// Add cleanup on page unload to prevent memory leaks
window.addEventListener('beforeunload', cleanup);
window.addEventListener('unload', cleanup);

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await initialize();
        await AudioManager.initialize();
    });
} else {
    (async () => {
        await initialize();
        await AudioManager.initialize();
    })();
}

// Test function for HOD alerts - call from browser console
window.testHodAlert = (symbol = 'TEST') => {
    console.log(`🧪 Testing HOD alert for ${symbol}`);
    
    // Create a mock HOD alert event
    const mockHodEvent = {
        hero: symbol,
        price: 100.50,
        hp: 2.5,
        dp: 0,
        strength: 50000,
        one_min_volume: 50000,
        isHighOfDay: true
    };
    
    // Process the mock event
    processMarketEvent(mockHodEvent);
    
    console.log(`🧪 HOD alert test completed for ${symbol}`);
};

// Export for testing if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        initialize, 
        processMarketEvent, 
        updateSessionDisplay, 
        getCurrentSession,
        SESSIONS 
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CENTRALIZED AUDIO MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

const AudioManager = (() => {
    let audioSettings = {
        comboVolume: 0.55,
        newsVolume: 1.0,
        hodChimeVolume: 0.05,
        comboMuted: false,
        newsMuted: false,
        chimeMuted: false
    };
    
    // Audio instances cache
    const audioCache = {
        newsAlert: null,
        hodChime: null,
        eventsAudioContext: null,
        eventsBuffers: { short: [], long: [] }
    };
    
    // Initialize audio manager
    async function initialize() {
        try {
            // Load audio settings
            audioSettings = await window.audioSettingsAPI.get();
            console.log("🎵 Audio Manager initialized with settings:", audioSettings);
            
            // Subscribe to audio settings changes
            window.audioSettingsAPI.onUpdate((newSettings) => {
                audioSettings = newSettings;
                console.log("🎵 Audio settings updated:", audioSettings);
            });
            
            // Preload audio files
            await preloadAudioFiles();
            
        } catch (error) {
            console.error("❌ Failed to initialize Audio Manager:", error);
            // Use fallback settings
            audioSettings = {
                comboVolume: 0.55,
                newsVolume: 1.0,
                hodChimeVolume: 0.05,
                comboMuted: false,
                newsMuted: false,
                chimeMuted: false
            };
        }
    }
    
    // Preload audio files for better performance
    async function preloadAudioFiles() {
        try {
            // Preload news alert audio
            audioCache.newsAlert = new Audio("./audio/metal.wav");
            audioCache.newsAlert.preload = "auto";
            
            // Preload HOD chime audio
            audioCache.hodChime = new Audio("./audio/magic.mp3");
            audioCache.hodChime.preload = "auto";
            
            // Initialize Web Audio Context for events
            audioCache.eventsAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Preload events audio buffers
            await preloadEventsAudio();
            
            console.log("🎵 Audio files preloaded successfully");
        } catch (error) {
            console.error("❌ Failed to preload audio files:", error);
        }
    }
    
    // Preload events audio (combo alerts)
    async function preloadEventsAudio() {
        const AUDIO_BASE = "./audio/events/";
        const SHORT_COUNT = 32;
        const LONG_COUNT = 32;
        
        try {
            // Load short samples
            for (let i = 1; i <= SHORT_COUNT; i++) {
                const url = `${AUDIO_BASE}short/${i}.mp3`;
                const buffer = await loadAudioBuffer(url);
                if (buffer) audioCache.eventsBuffers.short.push(buffer);
            }
            
            // Load long samples
            for (let i = 1; i <= LONG_COUNT; i++) {
                const url = `${AUDIO_BASE}long/${i}.mp3`;
                const buffer = await loadAudioBuffer(url);
                if (buffer) audioCache.eventsBuffers.long.push(buffer);
            }
            
            console.log(`🎵 Events audio loaded: ${audioCache.eventsBuffers.short.length} short, ${audioCache.eventsBuffers.long.length} long`);
        } catch (error) {
            console.error("❌ Failed to preload events audio:", error);
        }
    }
    
    // Load audio buffer from URL
    async function loadAudioBuffer(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioCache.eventsAudioContext.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (error) {
            console.warn(`⚠️ Failed to load audio: ${url}`, error);
            return null;
        }
    }
    
    // Play news alert audio
    function playNewsAlert() {
        try {
            // Check if news alert is muted
            if (audioSettings.newsMuted) {
                console.log("🔇 News alert muted, skipping");
                return;
            }
            
            if (!audioCache.newsAlert) {
                console.warn("⚠️ News alert audio not loaded");
                return;
            }
            
            // Clone audio for multiple simultaneous plays
            const audio = audioCache.newsAlert.cloneNode();
            audio.volume = audioSettings.newsVolume;
            audio.play().catch(e => console.warn("⚠️ Failed to play news alert:", e));
            
            console.log(`🎵 Playing news alert (volume: ${Math.round(audioSettings.newsVolume * 100)}%)`);
        } catch (error) {
            console.error("❌ Failed to play news alert:", error);
        }
    }
    
    // Play HOD chime audio
    function playHodChime() {
        try {
            // Check if HOD chime is muted
            if (audioSettings.chimeMuted) {
                console.log("🔇 HOD chime muted, skipping");
                return;
            }
            
            if (!audioCache.hodChime) {
                console.warn("⚠️ HOD chime audio not loaded");
                return;
            }
            
            // Clone audio for multiple simultaneous plays
            const audio = audioCache.hodChime.cloneNode();
            audio.volume = audioSettings.hodChimeVolume;
            audio.play().catch(e => console.warn("⚠️ Failed to play HOD chime:", e));
            
            console.log(`🎵 Playing HOD chime (volume: ${Math.round(audioSettings.hodChimeVolume * 100)}%)`);
        } catch (error) {
            console.error("❌ Failed to play HOD chime:", error);
        }
    }
    
    // Play events combo audio - replicates original playSampleBuffer function exactly
    function playEventsCombo(strength = 0, isLongAlert = false, comboLevel = 2) {
        try {
            // Check if events combo is muted
            if (audioSettings.comboMuted) {
                console.log("🔇 Events combo muted, skipping");
                return;
            }
            
            if (!audioCache.eventsAudioContext || audioCache.eventsAudioContext.state === "closed") {
                console.warn("⚠️ Events audio context not available");
                return;
            }
            
            // Resume context if suspended
            if (audioCache.eventsAudioContext.state === "suspended") {
                audioCache.eventsAudioContext.resume();
            }
            
            // Replicate original logic exactly
            const bank = isLongAlert ? "long" : "short";
            const count = 32; // SAMPLE_COUNTS[bank]
            const index = Math.max(0, comboLevel | 0) % Math.max(1, count); // levelToIndex(comboLevel, count)
            const volume = Math.max(0.1, audioSettings.comboVolume); // getComboVolume() equivalent
            
            const buffers = bank === "long" ? audioCache.eventsBuffers.long : audioCache.eventsBuffers.short;
            if (buffers.length === 0) {
                console.warn("⚠️ No events audio buffers loaded");
                return;
            }
            
            const buffer = buffers[index];
            if (!buffer) {
                console.warn(`⚠️ Buffer not found: ${bank}[${index}]`);
                return;
            }
            
            // Create audio source - exactly like original playSampleBuffer
            const source = audioCache.eventsAudioContext.createBufferSource();
            const gain = audioCache.eventsAudioContext.createGain();
            
            gain.gain.value = Math.max(0.001, Math.min(1, volume));
            source.buffer = buffer;
            source.connect(gain).connect(audioCache.eventsAudioContext.destination);
            source.start();
        } catch (error) {
            console.error("❌ Failed to play events combo:", error);
        }
    }
    
    // Test functions for settings
    function testNewsAlert() {
        console.log("🧪 Testing news alert audio");
        playNewsAlert();
    }
    
    function testHodChime() {
        console.log("🧪 Testing HOD chime audio");
        playHodChime();
    }
    
    function testEventsCombo() {
        console.log("🧪 Testing events combo audio");
        playEventsCombo(1000, false); // Simple test
    }
    
    // Expose public API
    return {
        initialize,
        playNewsAlert,
        playHodChime,
        playEventsCombo,
        testNewsAlert,
        testHodChime,
        testEventsCombo
    };
})();

// Initialize audio manager when progress window loads
window.audioManager = AudioManager;

// Listen for audio commands from other windows via IPC
if (window.electronAPI?.ipc) {
    
    // Playback commands
    window.electronAPI.ipc.on("audio-command:play-news-alert", () => {
        AudioManager.playNewsAlert();
    });
    
    window.electronAPI.ipc.on("audio-command:play-hod-chime", () => {
        AudioManager.playHodChime();
    });
    
    window.electronAPI.ipc.on("audio-command:play-events-combo", (_event, { strength, isLongAlert, comboLevel } = {}) => {
        AudioManager.playEventsCombo(strength, isLongAlert, comboLevel);
    });
    
    // Test commands (3 total: combo, news, hod)
    window.electronAPI.ipc.on("audio-command:test-news-alert", () => {
        AudioManager.testNewsAlert();
    });
    
    window.electronAPI.ipc.on("audio-command:test-hod-chime", () => {
        AudioManager.testHodChime();
    });
    
    window.electronAPI.ipc.on("audio-command:test-events-combo", () => {
        AudioManager.testEventsCombo();
    });
}