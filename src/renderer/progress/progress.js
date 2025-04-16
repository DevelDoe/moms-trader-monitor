// Configuration
const WINDOW_SIZE = 50; // How many events shape the sentiment
const INTENSITY_THRESHOLD = 0.7; // 70% dominance triggers glow

let tradeRate = 0; // trades per second (smoothed)
let tradeRateRaw = 0; // raw count within interval
let dynamicWindowSize = 50; // adaptive window size

// Update every second
setInterval(() => {
    const minSize = 10;
    const maxSize = 200;

    const smoothing = 0.94; // Higher = slower, smoother response (good for ketchup)
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
    if (event.strength < 1000) return; // ⛔️ Ignore weak trades

    tradeRateRaw++;

    const hpChange = Math.max(0, event.hp - (flowHistory[0]?.hp || 0));
    const dpChange = Math.max(0, event.dp - (flowHistory[0]?.dp || 0));

    flowHistory.unshift({ hp: event.hp, dp: event.dp });

    if (flowHistory.length > dynamicWindowSize) flowHistory.pop();

    hpTotal = hpTotal * 0.95 + hpChange;
    dpTotal = dpTotal * 0.95 + dpChange;

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
window.alertAPI.onAlertEvents((events) => {
    events.forEach(processMarketFlow);
});

// Initialize balanced flow
updateFlowVisual();

setInterval(() => {
    console.log("tradeRate:", tradeRate.toFixed(1), "windowSize:", dynamicWindowSize);
}, 2000);
