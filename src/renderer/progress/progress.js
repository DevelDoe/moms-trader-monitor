// Session-based buy/sell tracking configuration
const CONFIG = {
    UPDATE_INTERVAL: 1000, // Update every second
    SESSION_TRANSITION_BUFFER: 5 * 60 * 1000, // 5 minutes buffer for session transitions
    MIN_VOLUME_THRESHOLD: 100, // Minimum volume to count as significant trade
    HOT_MARKET_THRESHOLD: 0.40, // >35% more buying = hot market (bullish)
    WARM_MARKET_THRESHOLD: 0.20, // >20% more buying = warm market
    COOL_MARKET_THRESHOLD: 0.20, // >20% more selling = cool market
    COLD_MARKET_THRESHOLD: 0.40 // >35% more selling = cold market (bearish)
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
    lastUpdate: Date.now()
};

// DOM element cache
const elements = {
    buyBar: null,
    sellBar: null,
    container: null,
    buyInfo: null,
    sellInfo: null,
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
    
    console.log(`[progress] Current NY time: ${nyTime.toLocaleTimeString()}, Hour: ${currentHour.toFixed(2)}`);
    
    for (const [key, session] of Object.entries(SESSIONS)) {
        if (currentHour >= session.start && currentHour < session.end) {
            console.log(`[progress] Active session: ${session.name} (${session.start}:00 - ${session.end}:00)`);
            return { key, ...session };
        }
    }
    
    // Default to POST session if outside trading hours
    console.log(`[progress] Outside trading hours, defaulting to POST session`);
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
    elements.marketTemp = document.getElementById("market-temp");
    elements.heroesCount = document.getElementById("heroes-count");
    elements.nyClock = document.getElementById("ny-clock");
    elements.countdownTimer = document.getElementById("countdown-timer");
    
    if (!elements.buyBar || !elements.sellBar || !elements.container) {
        console.warn("[progress] Required DOM elements not found");
        return false;
    }
    
    // Set initial balanced state
    updateDisplay(50, 50, 'closed', 0, 0);
    
    return true;
}


// Process market events for buy/sell tracking
function processMarketEvent(event) {
    // Early validation
    if (!event.hp && !event.dp) return;
    
    const volume = event.strength || event.one_min_volume || 0;
    if (volume < CONFIG.MIN_VOLUME_THRESHOLD) return;

    // Check if we need to reset for new session
    const currentSession = getCurrentSession();
    if (sessionData.current !== currentSession.key) {
        resetSessionData(currentSession);
    }

    // Determine if this is a buy or sell based on hp/dp values
    // hp > dp = buying pressure, dp > hp = selling pressure
    const buyPressure = event.hp || 0;
    const sellPressure = event.dp || 0;
    
    if (buyPressure > sellPressure) {
        sessionData.buyVolume += volume;
    } else if (sellPressure > buyPressure) {
        sessionData.sellVolume += volume;
    }
    
    sessionData.totalTrades++;
    sessionData.lastUpdate = Date.now();
    
    // Update display
    updateSessionDisplay();
}

// Reset session data for new session
function resetSessionData(newSession) {
    console.log(`[progress] Starting new session: ${newSession.name}`);
    sessionData.current = newSession.key;
    sessionData.buyVolume = 0;
    sessionData.sellVolume = 0;
    sessionData.totalTrades = 0;
    sessionData.lastUpdate = Date.now();
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
        marketTemp = 'hot ';
        tempColor = '#FF4444';
    } else if (buySellDiff > CONFIG.WARM_MARKET_THRESHOLD * 100) {
        marketTemp = 'warm ';
        tempColor = '#FF8844';
    } else if (buySellDiff < -CONFIG.COLD_MARKET_THRESHOLD * 100) {
        marketTemp = 'cold ';
        tempColor = '#4444FF';
    } else if (buySellDiff < -CONFIG.COOL_MARKET_THRESHOLD * 100) {
        marketTemp = 'cool';
        tempColor = '#4488FF';
    }
    
    // Format volume for display
    const formatVolume = (vol) => {
        if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
        if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
        return vol.toString();
    };
    
    updateDisplay(buyPercent, sellPercent, currentSession.name, totalVolume, tempColor);
    
    // Update banner elements
    if (elements.buyInfo) {        elements.buyInfo.textContent = formatVolume(sessionData.buyVolume);
    }
    
    if (elements.sellInfo) {
        elements.sellInfo.textContent = formatVolume(sessionData.sellVolume);
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

// Initialize the application
function initialize() {
    if (!initializeElements()) {
        console.error("[progress] Failed to initialize DOM elements");
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

    // Set up periodic updates
    const updateInterval = setInterval(checkSessionAndUpdate, CONFIG.UPDATE_INTERVAL);
    
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
        const clockInterval = setInterval(() => {
            updateNYClock();
            updateCountdown();
        }, 1000);
        
        // Store interval for cleanup
        window.clockInterval = clockInterval;
    }, delayToNextSecond);

    console.log(`[progress] Initialized for session: ${currentSession.name}`);

    // Cleanup function
    return () => {
        clearInterval(updateInterval);
        if (window.clockInterval) {
            clearInterval(window.clockInterval);
        }
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
    module.exports = { 
        initialize, 
        processMarketEvent, 
        updateSessionDisplay, 
        getCurrentSession,
        SESSIONS 
    };
}
