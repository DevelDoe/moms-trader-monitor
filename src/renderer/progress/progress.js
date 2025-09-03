// Configuration
const WINDOW_SIZE = 50; // How many events shape the sentiment
const INTENSITY_THRESHOLD = 0.7; // 70% dominance triggers glow

let tradeRate = 0; // trades per second (smoothed)
let tradeRateRaw = 0; // raw count within interval
let dynamicWindowSize = 50; // adaptive window size

// logging volumes
let currentVolumeBucket = 0;

function accumulateStrength(event) {
    if (event.strength) {
        currentVolumeBucket += event.strength;
    }
}

// Every incoming trade alert:
window.eventsAPI.onAlert((events) => {
    console.log(`[progress] 🎯 Received ${events.length} events:`, events);
    
    events.forEach((event, index) => {
        console.log(`[progress] 📊 Event ${index + 1}:`, {
            symbol: event.hero,
            price: event.price,
            volume: event.one_min_volume,
            hp: event.hp,
            dp: event.dp,
            strength: event.strength
        });
        
        accumulateStrength(event);
        processMarketFlow(event);
    });
});

// Every 5 min, dump and reset:
setInterval(() => {
    const now = new Date().toISOString();
    window.progressAPI.log(now, currentVolumeBucket);
    currentVolumeBucket = 0;
}, 5 * 60 * 1000);

// Update every second
setInterval(() => {
    const minSize = 0;
    const maxSize = 400;

    const smoothing = 0.98; // Higher = slower, smoother response (good for ketchup)
    tradeRate = tradeRate * smoothing + tradeRateRaw * (1 - smoothing);

    const normalizedRate = Math.min(tradeRate, 2) / 2;
    dynamicWindowSize = Math.floor(minSize + normalizedRate * (maxSize - minSize));

    // Optional: decay further when idle
    if (tradeRateRaw === 0) tradeRate *= 0.95;

    tradeRateRaw = 0;
}, 1000);

let flowHistory = [];
let hpTotal = 0;
let dpTotal = 0;

function processMarketFlow(event) {
    // Check if this is a valid trade event with hp/dp data
    if (!event.hp && !event.dp) {
        console.log(`[progress] ⚠️ Skipping event without direction data:`, event);
        return;
    }
    
    // Use strength if available, otherwise use volume as fallback
    const eventStrength = event.strength || event.one_min_volume || 1000;
    if (eventStrength < 1000) {
        console.log(`[progress] ⚠️ Skipping weak trade (strength: ${eventStrength}):`, event);
        return;
    }

    console.log(`[progress] ✅ Processing market flow for:`, {
        symbol: event.hero,
        hp: event.hp,
        dp: event.dp,
        strength: eventStrength
    });

    tradeRateRaw++;

    // Normalize strength to 0–1 (e.g., using 500k as strong)
    const normalizedStrength = Math.min(eventStrength / 500000, 1);

    const hpChange = event.hp > 0 ? event.hp * normalizedStrength : 0;
    const dpChange = event.dp > 0 ? event.dp * normalizedStrength : 0;

    flowHistory.unshift({ hp: event.hp, dp: event.dp });

    if (flowHistory.length > dynamicWindowSize) flowHistory.pop();

    hpTotal = hpTotal * 0.95 + hpChange;
    dpTotal = dpTotal * 0.95 + dpChange;

    console.log(`[progress] 📈 Updated totals:`, { hpTotal, dpTotal, hpChange, dpChange });

    updateFlowVisual();
}

let lastDirection = null;

function updateFlowVisual() {
    const total = hpTotal + dpTotal;
    const hpPercent = total > 0 ? (hpTotal / total) * 100 : 50;
    const dpPercent = total > 0 ? (dpTotal / total) * 100 : 50;
    const imbalance = Math.abs(hpPercent - dpPercent);
    const volumeMomentum = hpTotal + dpTotal;

    const hpEl = document.getElementById("flow-hp");
    const dpEl = document.getElementById("flow-dp");
    const flowEl = document.querySelector(".sentiment-flow");

    // Set bar widths
    hpEl.style.width = `${hpPercent}%`;
    dpEl.style.width = `${dpPercent}%`;

    // Swoosh speed based on momentum
    const flowVelocity = imbalance / 100;
    document.documentElement.style.setProperty("--swoosh-speed", `${3 - flowVelocity * 1.5}s`);

    // Animation control
    const isBalanced = imbalance < 15;
    hpEl.style.animationPlayState = isBalanced ? "paused" : "running";
    dpEl.style.animationPlayState = isBalanced ? "paused" : "running";

    // Glow based on imbalance
    flowEl.classList.toggle("glow", imbalance > 25);

    // Directional flash on trend change
    const currentDirection = hpPercent > dpPercent ? "hp" : "dp";
    if (currentDirection !== lastDirection && imbalance > 10) {
        const flashClass = currentDirection === "hp" ? "flash-green" : "flash-red";
        flowEl.classList.remove("flash-green", "flash-red"); // reset
        flowEl.classList.add(flashClass);
        setTimeout(() => flowEl.classList.remove(flashClass), 150);
        lastDirection = currentDirection;
    }

    // Heartbeat on high flow
    if (volumeMomentum > 80) {
        flowEl.classList.add("heartbeat");
        void flowEl.offsetWidth; // retrigger animation
        setTimeout(() => flowEl.classList.remove("heartbeat"), 1000);
    }

    // Optional: strong glow aura toggles
    document.body.classList.toggle("strong-hp", hpPercent > INTENSITY_THRESHOLD * 100);
    document.body.classList.toggle("strong-dp", dpPercent > INTENSITY_THRESHOLD * 100);
}

// Connect to your event stream
window.eventsAPI.onAlert((events) => {
    events.forEach(processMarketFlow);
});

// Initialize balanced flow
updateFlowVisual();

setInterval(() => {
    console.log("tradeRate:", tradeRate.toFixed(1), "windowSize:", dynamicWindowSize);
}, 2000);
