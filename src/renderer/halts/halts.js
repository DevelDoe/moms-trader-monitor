// halts.js — Trading Halts Monitor: real-time halt data consumption and display

// --- StackAnimator (FLIP) ---
class StackAnimator {
    constructor({ keyAttr = "data-key", duration = 500, easing = "cubic-bezier(.2,.8,.2,1)" } = {}) {
        this.keyAttr = keyAttr;
        this.duration = duration;
        this.easing = easing;
        this.first = new Map();
        this.removing = new Set();
    }
    capture(container) {
        this.first.clear();
        if (!container) return;
        for (const el of container.querySelectorAll(`[${this.keyAttr}]`)) {
            const r = el.getBoundingClientRect();
            this.first.set(el.getAttribute(this.keyAttr), { top: r.top, height: r.height });
        }
    }
    animate(container) {
        if (!container) return Promise.resolve();
        const promises = [];
        for (const el of container.querySelectorAll(`[${this.keyAttr}]`)) {
            const key = el.getAttribute(this.keyAttr);
            const r = el.getBoundingClientRect();
            if (!this.first.has(key)) {
                // Large cards: drop from ~1.25x their own height (+ gap)
                const gap = 8; // matches your .halts-list gap
                const dropFrom = -(Math.round(r.height * 1.25) + gap);
                el.style.transform = `translateY(${dropFrom}px)`;
                el.style.opacity = "0";
                el.getBoundingClientRect(); // reflow
                promises.push(this.#play(el, 0, 1));
                continue;
            }
            const { top: firstTop } = this.first.get(key);
            const dy = firstTop - r.top;
            if (dy !== 0) {
                el.style.transform = `translateY(${dy}px)`;
                el.style.opacity = "1";
                el.getBoundingClientRect(); // reflow
                promises.push(this.#play(el, 0, 1));
            }
        }
        return Promise.all(promises);
    }
    animateRemoval(el, onDone) {
        if (!el || this.removing.has(el)) return;
        this.removing.add(el);
        el.style.willChange = "transform, opacity";
        el.style.transition = `transform ${this.duration}ms ${this.easing}, opacity ${this.duration}ms ${this.easing}`;
        el.style.transformOrigin = "top center";
        el.style.opacity = "0";
        el.style.transform = "translateY(-6px) scaleY(0.9)";
        const h = el.getBoundingClientRect().height;
        const cs = getComputedStyle(el);
        el.style.maxHeight = `${h}px`;
        el.style.marginTop = cs.marginTop;
        el.style.marginBottom = cs.marginBottom;
        requestAnimationFrame(() => {
            el.style.transition = `${el.style.transition}, max-height ${this.duration}ms ${this.easing}, margin ${this.duration}ms ${this.easing}, padding ${this.duration}ms ${this.easing}`;
            el.style.maxHeight = "0px";
            el.style.marginTop = "0px";
            el.style.marginBottom = "0px";
            el.style.paddingTop = "0px";
            el.style.paddingBottom = "0px";
            setTimeout(() => {
                this.removing.delete(el);
                onDone?.();
            }, this.duration);
        });
    }
    #play(el, toTranslateY = 0, toOpacity = 1) {
        return new Promise((resolve) => {
            el.style.willChange = "transform, opacity";
            el.style.transition = `transform ${this.duration}ms ${this.easing}, opacity ${this.duration}ms ${this.easing}`;
            requestAnimationFrame(() => {
                el.style.transform = `translateY(${toTranslateY}px)`;
                el.style.opacity = String(toOpacity);
                requestAnimationFrame(() => {
                    el.style.transform = "translateY(0)";
                    const done = () => {
                        el.removeEventListener("transitionend", done);
                        // micro bounce
                        el.classList.add("landed");
                        setTimeout(() => el.classList.remove("landed"), 250);
                        el.style.willChange = "";
                        el.style.transition = "";
                        resolve();
                    };
                    el.addEventListener("transitionend", done);
                });
            });
        });
    }
}
const stackAnimator = new StackAnimator({
    keyAttr: "data-key",
    duration: 500,
    easing: "cubic-bezier(.2,.8,.2,1)",
});
// --- end StackAnimator ---

let allHalts = [];
let currentlyHaltedSymbols = new Set();
let symbolStates = new Map(); // Track current state for each symbol
let maxHaltsLength = 100; // Keep last 100 halt events
let settings = {};
let countdownTimer = null; // Timer for updating countdowns
let expiredHalts = new Set(); // Track halts that have expired
let animationQueue = []; // Queue for managing animations

// Card layout configuration
let cardLayoutConfig = {
    maxLargeCards: 3, // Switch to small cards when more than this many halts
    currentLayout: "large", // 'large' or 'small'
};

// Mock data system
let mockSystem = {
    enabled: false,
    symbols: ["AAPL", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "NFLX", "AMD", "INTC"],
    haltStates: new Map(), // Track each symbol's current state and timing
    reasons: ["Circuit Breaker", "News Pending", "Volatility Halt", "Trading Halt", "Limit Up/Down"],
    exchanges: ["NYSE", "NASDAQ", "AMEX"],
};

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
            ALL_FIELDS: Object.keys(halt),
        });
    });
    console.log(`🔍 ================================`);
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("🚨 Halts: Initializing halt monitor...");

    // Initialize header component
    const headerContainer = document.getElementById("header-container");
    if (headerContainer && window.HeaderComponent) {
        window.haltsHeader = new window.HeaderComponent(headerContainer, {
            icon: "⚖️",
            text: "Edict of stasis (halts)",
            className: "halts-header",
        });
    }

    // Set up event delegation for symbol clicks (similar to sessionHistory)
    document.addEventListener("click", function (event) {
        const symbolElement = event.target.closest('.symbol[data-clickable="true"]');
        if (symbolElement) {
            const symbol = symbolElement.getAttribute("data-symbol");
            if (symbol) {
                console.log(`🖱️ [Halts] Symbol clicked: ${symbol}`);
                window.handleSymbolClick(symbol, event);
            }
        }
    });

    // Start mock system for testing
    startMockSystem();

    // Settings are now managed by Electron stores
    settings = {}; // fallback

    // Test data removed - ready for production

    // Request initial halt data from main process
    try {
        const halts = await window.haltAPI.getHeadlines();
        if (halts && Array.isArray(halts)) {
            console.log(`📊 Received ${halts.length} initial halts from Oracle`);

            // Filter out expired halts (older than 5 minutes) BEFORE adding to allHalts
            const now = Date.now();
            const validHalts = halts.filter((halt) => {
                let haltTimeMs;

                if (halt.halt_time && typeof halt.halt_time === "number") {
                    haltTimeMs = halt.halt_time * 1000;
                } else {
                    const timestampStr = halt.timestamp_et || halt.timestamp || halt.received_at;
                    if (timestampStr) {
                        try {
                            haltTimeMs = new Date(timestampStr).getTime();
                        } catch (e) {
                            return false; // Invalid timestamp, remove it
                        }
                    } else {
                        return false; // No timestamp, remove it
                    }
                }

                // Keep only halts that are less than 5 minutes old (300 seconds)
                const elapsedMs = now - haltTimeMs;
                const elapsedSeconds = Math.floor(elapsedMs / 1000);
                return elapsedSeconds < 300;
            });

            console.log(`📊 Filtered to ${validHalts.length} non-expired halts from ${halts.length} total`);
            allHalts = [...allHalts, ...validHalts];

            // Sort halts by timestamp (newest first)
            allHalts.sort((a, b) => {
                const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
                const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;
                // Compare timestamps (newest first)
                if (typeof timeA === "number" && typeof timeB === "number") {
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
    const countdownElements = document.querySelectorAll(".halt-time.countdown[data-halt-time], .halt-countdown-badge.countdown[data-halt-time]");
    const haltsToRemove = [];

    countdownElements.forEach((element) => {
        const haltTimeStr = element.getAttribute("data-halt-time");
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
            countdownStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
        } else {
            // Countdown reached 0 - restart from 5 minutes (loop)
            const minutes = Math.floor(300 / 60); // 5 minutes = 300 seconds
            const seconds = 300 % 60;
            countdownStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

            // Update the data-halt-time to restart the countdown
            const haltElement = element.closest(".halt-event");
            if (haltElement) {
                // Set halt time to current time to restart 5-minute countdown
                const newHaltTime = Math.floor(Date.now() / 1000);
                haltElement.setAttribute("data-halt-time", newHaltTime);
                element.setAttribute("data-halt-time", newHaltTime);
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
    element.classList.remove("green", "yellow", "red", "critical");

    // Apply color based on remaining time
    if (countdownSeconds > 180) {
        // More than 3 minutes (180 seconds)
        element.classList.add("green");
    } else if (countdownSeconds > 60) {
        // More than 1 minute (60 seconds)
        element.classList.add("yellow");
    } else if (countdownSeconds > 10) {
        // 10-60 seconds
        element.classList.add("red");
    } else {
        // 10 seconds or less - critical blinking
        element.classList.add("red", "critical");

        // Log when critical blinking starts (only once per halt)
        const haltElement = element.closest(".halt-event");
        const symbol = haltElement?.getAttribute("data-symbol");
        if (symbol && !haltElement.hasAttribute("data-critical-logged")) {
            console.log(`🚨 CRITICAL: ${symbol} countdown in final 10 seconds!`);
            haltElement.setAttribute("data-critical-logged", "true");
        }
    }
}

// Mark halt as expired instead of removing it
function markHaltAsExpired(haltElement, symbol) {
    console.log(`🚨 Marking ${symbol} as EXPIRED - halt did not resume`);

    // Update the halt state in our data
    const haltIndex = allHalts.findIndex((halt) => halt.symbol === symbol);
    if (haltIndex !== -1) {
        allHalts[haltIndex].state = "expired";
        allHalts[haltIndex].expired_at = new Date().toISOString();
    }

    // Update the visual state
    const stateElement = haltElement.querySelector(".halt-state");
    const timeElement = haltElement.querySelector(".halt-time");

    if (stateElement) {
        stateElement.textContent = "EXPIRED";
        stateElement.className = "halt-state expired";
    }

    if (timeElement) {
        timeElement.textContent = "EXPIRED";
        timeElement.className = "halt-time countdown expired";
    }

    // Remove from currently halted symbols
    currentlyHaltedSymbols.delete(symbol);
}

// Mark halt as resumed (when trading actually resumes)
function markHaltAsResumed(haltElement, symbol) {
    console.log(`✅ Marking ${symbol} as RESUMED - trading has resumed`);

    // Update the halt state in our data
    const haltIndex = allHalts.findIndex((halt) => halt.symbol === symbol);
    if (haltIndex !== -1) {
        allHalts[haltIndex].state = "resumed";
        allHalts[haltIndex].resumed_at = new Date().toISOString();
    }

    // Update the visual state
    const stateElement = haltElement.querySelector(".halt-state");
    const timeElement = haltElement.querySelector(".halt-time");

    if (stateElement) {
        stateElement.textContent = "RESUMED";
        stateElement.className = "halt-state resumed";
    }

    if (timeElement) {
        timeElement.textContent = "RESUMED";
        timeElement.className = "halt-time countdown resumed";
    }

    // Remove from currently halted symbols
    currentlyHaltedSymbols.delete(symbol);
}

// Legacy animation functions removed - now using StackAnimator

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
        if (typeof timeA === "number" && typeof timeB === "number") {
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
                low_price: halt.low_price,
            });

            // Add to halted symbols set if currently halted
            if (halt.state === "HALTED") {
                currentlyHaltedSymbols.add(halt.symbol);
            }
        }
    }
}

// Render halt events to the DOM
function renderHalts() {
    const container = document.getElementById("halts-list");
    if (!container) return;

    // 1) capture BEFORE DOM change
    stackAnimator.capture(container);

    // lock layout for this render pass
    const cardSize = allHalts.length <= cardLayoutConfig.maxLargeCards ? "large" : "small";
    const prev = container.getAttribute("data-card-size");
    container.setAttribute("data-card-size", prev || cardSize); // keep previous if present
    const activeSize = container.getAttribute("data-card-size");

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
    } else {
        // Sort halts by timestamp (newest first)
        const sortedHalts = [...allHalts].sort((a, b) => {
            const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
            const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;

            // Compare timestamps (newest first)
            if (typeof timeA === "number" && typeof timeB === "number") {
                return timeB - timeA;
            }
            return timeB.localeCompare(timeA);
        });

        container.innerHTML = sortedHalts.map((halt) => createHaltElement(halt, activeSize)).join("");
    }

    // 2) animate AFTER DOM change
    stackAnimator.animate(container).then(() => {
        // release lock after animation ends
        container.setAttribute("data-card-size", cardSize);
    });
}

// Create HTML element for a halt event (large or small card)
function createHaltElement(halt, cardSize = null) {
    // Calculate countdown from unix timestamp
    let countdownStr = "Unknown";

    // For RESUMED state, show "RESUMED" instead of countdown
    if (halt.state === "RESUMED") {
        countdownStr = "RESUMED";
    } else if (halt.halt_time && typeof halt.halt_time === "number") {
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
            countdownStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
        } else {
            countdownStr = "0:00";
        }
    } else {
        // Fallback for old timestamp format
        const timestampStr = halt.timestamp_et || halt.timestamp || halt.received_at;
        if (timestampStr) {
            // For ET timestamps, extract the time directly from the string
            if (timestampStr.includes("T")) {
                // Format: "2025-09-11T12:10:40.368613-04:00"
                const timePart = timestampStr.split("T")[1];
                const timeWithoutTz = timePart.split("-")[0].split("+")[0]; // Remove timezone
                // Get just HH:MM:SS (no milliseconds for compact view)
                countdownStr = timeWithoutTz.substring(0, 8); // "12:10:40"
            } else {
                countdownStr = "Unknown";
            }
        }
    }

    // Determine initial color class
    let colorClass = "red"; // default
    let criticalClass = "";

    if (halt.state === "RESUMED") {
        colorClass = "green"; // Green for RESUMED state
    } else if (halt.halt_time && typeof halt.halt_time === "number") {
        const haltTimeMs = halt.halt_time * 1000;
        const now = Date.now();
        const elapsedMs = now - haltTimeMs;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const countdownSeconds = Math.max(0, 300 - elapsedSeconds);

        if (countdownSeconds > 180) {
            colorClass = "green";
        } else if (countdownSeconds > 60) {
            colorClass = "yellow";
        } else if (countdownSeconds > 10) {
            colorClass = "red";
        } else {
            colorClass = "red";
            criticalClass = "critical";
        }
    }

    const stateClass = halt.state.toLowerCase().replace(/_/g, "-");
    // Use reason for display, trim unnecessary "Halt/Pause" text
    let haltTypeDisplay = halt.reason || halt.state.replace(/_/g, " ");
    // Remove redundant "Halt/Pause" text - we know these are halts
    haltTypeDisplay = haltTypeDisplay.replace(/\s*Halt\/Pause\s*/gi, " ").trim();

    // Use a stable, unique key per row in the list
    // Use symbol + timestamp for uniqueness in case multiple rows per symbol are ever shown
    const key = `${halt.symbol}-${halt.halt_time ?? halt.timestamp ?? halt.timestamp_et ?? 'x'}`;

    // Determine card layout based on current configuration or passed parameter
    const activeCardSize = cardSize || (allHalts.length <= cardLayoutConfig.maxLargeCards ? "large" : "small");

    if (activeCardSize === "large") {
        // Large card layout with modular badges
        const reasonText = halt.reason || "Trading Halt";
        const exchangeText = halt.tape_description || "NYSE";
        const combinedText = `${reasonText} • <span class="exchange-text">🏛️ ${exchangeText}</span>`;

        return `
            <div class="halt-event large ${stateClass}" 
                 data-key="${key}" 
                 data-symbol="${halt.symbol}" 
                 data-halt-time="${halt.halt_time || ""}">
                <div class="halt-content">
                    <div class="halt-badges">
                        <div class="halt-symbol-badge" data-clickable="true" data-symbol="${halt.symbol}">${halt.symbol}</div>
                        <div class="halt-state-badge ${stateClass}">${halt.state}</div>
                        <div class="halt-reason-badge">${combinedText}</div>
                        <div class="halt-countdown-badge countdown ${colorClass} ${criticalClass}" data-halt-time="${halt.halt_time || ""}">${countdownStr}</div>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Small card layout - compact single line
        return `
            <div class="halt-event small ${stateClass}" 
                 data-key="${key}" 
                 data-symbol="${halt.symbol}" 
                 data-halt-time="${halt.halt_time || ""}">
                <div class="halt-content">
                    <div class="halt-symbol-container" data-clickable="true" data-symbol="${halt.symbol}">${halt.symbol}</div>
                    <div class="halt-state ${stateClass}">${haltTypeDisplay}</div>
                    <div class="halt-time countdown ${colorClass} ${criticalClass}" data-halt-time="${halt.halt_time || ""}">${countdownStr}</div>
                </div>
            </div>
        `;
    }
}

// Handle new halt delta from Oracle
function handleHaltDelta(haltData, metadata = {}) {
    console.log(`🚨 Received halt delta:`, haltData);

    if (!haltData || !haltData.symbol) {
        console.warn("⚠️ Invalid halt data received:", haltData);
        return;
    }

    // Handle RESUMED state - remove the halt
    if (haltData.state === "RESUMED") {
        console.log(`✅ Received RESUMED message for ${haltData.symbol} - removing halt`);

        const container = document.getElementById("halts-list");
        // Find element by symbol (since we need to find the existing halt to remove)
        const el = container?.querySelector(`[data-symbol="${haltData.symbol}"]`);

        if (el) {
            // animate removal first; only then remove from data + re-render with FLIP
            stackAnimator.animateRemoval(el, () => {
                // Now update data and animate neighbors dropping
                stackAnimator.capture(container);
                allHalts = allHalts.filter((halt) => halt.symbol !== haltData.symbol);
                currentlyHaltedSymbols.delete(haltData.symbol);
                symbolStates.delete(haltData.symbol);
                renderHalts();
                stackAnimator.animate(container);
            });
        } else {
            // fallback (no element found)
            allHalts = allHalts.filter((halt) => halt.symbol !== haltData.symbol);
            currentlyHaltedSymbols.delete(haltData.symbol);
            symbolStates.delete(haltData.symbol);
            renderHalts();
        }

        // Log structure for debugging
        if (window.appFlags?.eventsDebug) {
            logHaltStructure([haltData], "RESUMED");
        }
        return;
    }

    // Handle HALTED state - add or update the halt
    if (haltData.state === "HALTED") {
        // BEFORE you call renderHalts()
        const container = document.getElementById("halts-list");
        stackAnimator.capture(container);

        // Remove any existing halt for this symbol first
        allHalts = allHalts.filter((halt) => halt.symbol !== haltData.symbol);

        // Add new halt to array
        allHalts.push(haltData);

        // Sort halts by timestamp (newest first) and keep only the most recent
        allHalts.sort((a, b) => {
            const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
            const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;

            // Compare timestamps (newest first)
            if (typeof timeA === "number" && typeof timeB === "number") {
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

        // AFTER render: hint which key just got inserted (optional; the module auto-detects)
        if (metadata.isDelta) {
            stackAnimator.animate(container, { insertedKey: haltData.symbol });
        }

        // Log structure for debugging
        if (window.appFlags?.eventsDebug) {
            logHaltStructure([haltData], "HALTED");
        }
    }
}

// Handle halt headlines (bulk data)
function handleHaltHeadlines(haltsData, metadata = {}) {
    console.log(`🚨 Received halt headlines:`, haltsData);

    if (!Array.isArray(haltsData)) {
        console.warn("⚠️ Invalid halt headlines data:", haltsData);
        return;
    }

    // Filter out expired halts (older than 5 minutes) BEFORE processing
    const now = Date.now();
    const validHalts = haltsData.filter((halt) => {
        let haltTimeMs;

        if (halt.halt_time && typeof halt.halt_time === "number") {
            haltTimeMs = halt.halt_time * 1000;
        } else {
            const timestampStr = halt.timestamp_et || halt.timestamp || halt.received_at;
            if (timestampStr) {
                try {
                    haltTimeMs = new Date(timestampStr).getTime();
                } catch (e) {
                    return false; // Invalid timestamp, remove it
                }
            } else {
                return false; // No timestamp, remove it
            }
        }

        // Keep only halts that are less than 5 minutes old (300 seconds)
        const elapsedMs = now - haltTimeMs;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        return elapsedSeconds < 300;
    });

    console.log(`🔄 Filtered to ${validHalts.length} non-expired halts from ${haltsData.length} total`);

    if (metadata.isHydration) {
        console.log(`🔄 Hydrating with ${validHalts.length} halt events`);
        allHalts = validHalts;
    } else {
        // Merge with existing data
        allHalts = [...validHalts, ...allHalts];
    }

    // Sort halts by timestamp (newest first)
    allHalts.sort((a, b) => {
        const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
        const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;

        // Compare timestamps (newest first)
        if (typeof timeA === "number" && typeof timeB === "number") {
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
    window.haltAPI
        .getHeadlines()
        .then((halts) => {
            if (halts && Array.isArray(halts)) {
                console.log(`🔄 Refreshed with ${halts.length} halts after hydration`);
                allHalts = halts;

                // Sort halts by timestamp (newest first)
                allHalts.sort((a, b) => {
                    const timeA = a.halt_time || a.timestamp_et || a.timestamp || a.received_at;
                    const timeB = b.halt_time || b.timestamp_et || b.timestamp || b.received_at;

                    // Compare timestamps (newest first)
                    if (typeof timeA === "number" && typeof timeB === "number") {
                        return timeB - timeA;
                    }
                    return timeB.localeCompare(timeA);
                });

                updateHaltedSymbols();
                renderHalts();
            }
        })
        .catch((e) => {
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
// Settings are now managed by Electron stores

// Utility functions for external access
window.haltsAPI = {
    getAllHalts: () => allHalts,
    getCurrentlyHaltedSymbols: () => Array.from(currentlyHaltedSymbols),
    isSymbolHalted: (symbol) => currentlyHaltedSymbols.has(symbol),
    getSymbolState: (symbol) => symbolStates.get(symbol),
    getAllSymbolStates: () => Object.fromEntries(symbolStates),
    getHaltCount: () => allHalts.length,
    getRecentHalts: (minutes = 60) => {
        const cutoff = Date.now() - minutes * 60 * 1000;
        return allHalts.filter((halt) => {
            const haltTime = halt.halt_time || halt.timestamp_et || halt.timestamp || halt.received_at;

            // Handle unix timestamp (seconds)
            if (typeof haltTime === "number") {
                return haltTime * 1000 > cutoff;
            }

            // Handle string timestamps
            const haltTimeMs = new Date(haltTime).getTime();
            return haltTimeMs > cutoff;
        });
    },
};

// Cleanup function to clear timer when window is closed
window.addEventListener("beforeunload", () => {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
});

console.log("✅ Halts monitor initialized and ready");

// Legacy mock loop function removed - now using proper mock system with StackAnimator

// Mock system implementation
function startMockSystem() {
    console.log("🧪 Starting mock halt system...");
    mockSystem.enabled = true;

    // Initialize all symbols as not halted
    mockSystem.symbols.forEach((symbol) => {
        mockSystem.haltStates.set(symbol, {
            state: "NONE",
            haltTime: null,
            resumePendingTime: null,
            reason: null,
            exchange: null,
        });
    });

    // Start the mock cycle
    startMockCycle();
}

function startMockCycle() {
    if (!mockSystem.enabled) return;

    // Randomly halt a symbol every 10-30 seconds
    const nextHaltDelay = Math.random() * 20000 + 10000; // 10-30 seconds

    setTimeout(() => {
        if (mockSystem.enabled) {
            haltRandomSymbol();
            startMockCycle(); // Continue the cycle
        }
    }, nextHaltDelay);
}

function haltRandomSymbol() {
    // Find symbols that are not currently halted
    const availableSymbols = mockSystem.symbols.filter((symbol) => {
        const state = mockSystem.haltStates.get(symbol);
        return state.state === "NONE";
    });

    if (availableSymbols.length === 0) {
        console.log("🧪 All symbols are already halted, skipping...");
        return;
    }

    // Pick a random symbol
    const symbol = availableSymbols[Math.floor(Math.random() * availableSymbols.length)];
    const reason = mockSystem.reasons[Math.floor(Math.random() * mockSystem.reasons.length)];
    const exchange = mockSystem.exchanges[Math.floor(Math.random() * mockSystem.exchanges.length)];

    // Create halt data with random elapsed time (0-4 minutes) to show different countdown colors
    const now = Math.floor(Date.now() / 1000);
    const elapsedSeconds = Math.floor(Math.random() * 240); // 0-4 minutes elapsed
    const haltTime = now - elapsedSeconds;

    const mockHalt = {
        symbol: symbol,
        state: "HALTED",
        reason: reason,
        halt_time: haltTime,
        timestamp: haltTime * 1000000000, // Nanoseconds
        timestamp_et: new Date(haltTime * 1000).toISOString(),
        et_date: new Date(haltTime * 1000).toISOString().split("T")[0],
        tape: 1,
        tape_description: exchange,
        band_high: 0,
        band_low: 0,
        indicators: [],
    };

    // Update mock state
    mockSystem.haltStates.set(symbol, {
        state: "HALTED",
        haltTime: haltTime,
        resumePendingTime: haltTime + 240, // 4 minutes (240 seconds) before resume pending
        reason: reason,
        exchange: exchange,
    });

    console.log(`🧪 Mock halt: ${symbol} - ${reason} on ${exchange} (${elapsedSeconds}s elapsed)`);

    // Add to halts and render with stack animation
    const container = document.getElementById("halts-list");
    stackAnimator.capture(container);
    
    allHalts.push(mockHalt);
    updateHaltedSymbols();
    renderHalts();
    
    // Trigger animation for new halt
    stackAnimator.animate(container, { insertedKey: symbol });

    // Schedule state transitions based on remaining time
    scheduleHaltTransitions(symbol, haltTime, elapsedSeconds);
}

function scheduleHaltTransitions(symbol, haltTime, elapsedSeconds = 0) {
    const remainingToResumePending = Math.max(0, (240 - elapsedSeconds) * 1000); // Time until RESUME_PENDING
    const remainingToResumed = Math.max(0, (300 - elapsedSeconds) * 1000); // Time until RESUMED

    // After remaining time to 4 minutes, change to RESUME_PENDING
    if (remainingToResumePending > 0) {
        setTimeout(() => {
            if (mockSystem.enabled && mockSystem.haltStates.get(symbol)?.state === "HALTED") {
                transitionToResumePending(symbol);
            }
        }, remainingToResumePending);
    }

    // After remaining time to 5 minutes, change to RESUMED
    if (remainingToResumed > 0) {
        setTimeout(() => {
            if (mockSystem.enabled && mockSystem.haltStates.get(symbol)?.state === "RESUME_PENDING") {
                transitionToResumed(symbol);
            }
        }, remainingToResumed);
    }
}

function transitionToResumePending(symbol) {
    const state = mockSystem.haltStates.get(symbol);
    if (!state || state.state !== "HALTED") return;

    // Update mock state
    state.state = "RESUME_PENDING";
    mockSystem.haltStates.set(symbol, state);

    // Update halt data
    const haltIndex = allHalts.findIndex((halt) => halt.symbol === symbol && halt.state === "HALTED");
    if (haltIndex !== -1) {
        allHalts[haltIndex].state = "RESUME_PENDING";
        allHalts[haltIndex].reason = "Trading Resumed - " + state.reason;

        console.log(`🧪 Mock transition: ${symbol} -> RESUME_PENDING`);

        updateHaltedSymbols();
        renderHalts();
    }
}

function transitionToResumed(symbol) {
    const state = mockSystem.haltStates.get(symbol);
    if (!state || state.state !== "RESUME_PENDING") return;

    // Update mock state to RESUMED
    state.state = "RESUMED";
    mockSystem.haltStates.set(symbol, state);

    // Update halt data to RESUMED state
    const haltIndex = allHalts.findIndex((halt) => halt.symbol === symbol && halt.state === "RESUME_PENDING");
    if (haltIndex !== -1) {
        allHalts[haltIndex].state = "RESUMED";
        allHalts[haltIndex].reason = "Trading Resumed - " + state.reason;
        // Clear the countdown by removing halt_time
        allHalts[haltIndex].halt_time = null;

        console.log(`🧪 Mock transition: ${symbol} -> RESUMED (countdown cleared, will fade out in 10s)`);

        updateHaltedSymbols();
        renderHalts();

        // Wait 10 seconds, then fade out and remove
        setTimeout(() => {
            fadeOutAndRemoveHalt(symbol);
        }, 10000); // 10 seconds
    }
}

function fadeOutAndRemoveHalt(symbol) {
    const container = document.getElementById("halts-list");
    const haltElement = container?.querySelector(`[data-symbol="${symbol}"]`);
    
    if (haltElement) {
        console.log(`🎭 Starting fadeout and stack drop for ${symbol}`);

        // Use stack animator for smooth removal
        stackAnimator.animateRemoval(haltElement, () => {
            // Now update data and animate neighbors dropping
            stackAnimator.capture(container);
            removeHaltFromData(symbol);
            renderHalts();
            stackAnimator.animate(container);
        });
    } else {
        // If element not found, just remove from data
        removeHaltFromData(symbol);
    }
}

function removeHaltFromData(symbol) {
    console.log(`🧪 Removing ${symbol} from data after fadeout`);

    // Update mock state
    const state = mockSystem.haltStates.get(symbol);
    if (state) {
        state.state = "NONE";
        state.haltTime = null;
        state.resumePendingTime = null;
        mockSystem.haltStates.set(symbol, state);
    }

    // Remove from halts
    allHalts = allHalts.filter((halt) => !(halt.symbol === symbol && halt.state === "RESUMED"));

    updateHaltedSymbols();
    renderHalts();
}

// Make mock system functions available globally for testing
window.startMockSystem = startMockSystem;
window.stopMockSystem = () => {
    mockSystem.enabled = false;
};
window.mockSystem = mockSystem;

// Card layout control functions
window.setCardLayout = (layout) => {
    if (layout === "large" || layout === "small") {
        cardLayoutConfig.currentLayout = layout;
        renderHalts();
        console.log(`🎨 Card layout set to: ${layout}`);
    }
};

window.setMaxLargeCards = (max) => {
    cardLayoutConfig.maxLargeCards = max;
    renderHalts();
    console.log(`🎨 Max large cards set to: ${max}`);
};

// Test function to create halts with specific countdown states
window.createTestHalts = () => {
    const testSymbols = ["TEST1", "TEST2", "TEST3", "TEST4"];
    const now = Math.floor(Date.now() / 1000);

    // Create halts with different elapsed times to show different countdown colors
    const testHalts = [
        { symbol: "TEST1", elapsed: 30, reason: "Green Countdown" }, // Green (>3min)
        { symbol: "TEST2", elapsed: 120, reason: "Yellow Countdown" }, // Yellow (1-3min)
        { symbol: "TEST3", elapsed: 250, reason: "Red Countdown" }, // Red (<1min)
        { symbol: "TEST4", elapsed: 290, reason: "Critical Countdown" }, // Critical (<10s)
    ];

    testHalts.forEach((test) => {
        const haltTime = now - test.elapsed;
        const mockHalt = {
            symbol: test.symbol,
            state: "HALTED",
            reason: test.reason,
            halt_time: haltTime,
            timestamp: haltTime * 1000000000,
            timestamp_et: new Date(haltTime * 1000).toISOString(),
            et_date: new Date(haltTime * 1000).toISOString().split("T")[0],
            tape: 1,
            tape_description: "NYSE",
            band_high: 0,
            band_low: 0,
            indicators: [],
        };

        allHalts.push(mockHalt);
    });

    updateHaltedSymbols();
    renderHalts();
    console.log("🧪 Created test halts with different countdown states");
};

// Test function to manually trigger animation using StackAnimator
window.testAnimation = () => {
    const now = Math.floor(Date.now() / 1000);
    const testHalt = {
        symbol: "ANIMTEST",
        state: "HALTED",
        reason: "Animation Test",
        halt_time: now,
        timestamp: now * 1000000000,
        timestamp_et: new Date(now * 1000).toISOString(),
        et_date: new Date(now * 1000).toISOString().split("T")[0],
        tape: 1,
        tape_description: "NYSE",
        band_high: 0,
        band_low: 0,
        indicators: [],
    };

    // Use stack animator for smooth animation
    const container = document.getElementById("halts-list");
    stackAnimator.capture(container);
    
    allHalts.push(testHalt);
    updateHaltedSymbols();
    renderHalts();
    
    // Trigger animation for new halt
    stackAnimator.animate(container, { insertedKey: "ANIMTEST" });
};

window.cardLayoutConfig = cardLayoutConfig;

