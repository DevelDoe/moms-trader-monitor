// Configuration
const WINDOW_SIZE = 50; // How many events shape the sentiment
const INTENSITY_THRESHOLD = 0.7; // 70% dominance triggers glow

let flowHistory = [];
let hpTotal = 0;
let dpTotal = 0;

function processMarketFlow(event) {
    // Simple edge detection - only register changes
    const hpChange = Math.max(0, event.hp - (flowHistory[0]?.hp || 0));
    const dpChange = Math.max(0, event.dp - (flowHistory[0]?.dp || 0));

    // Add to history
    flowHistory.unshift({ hp: event.hp, dp: event.dp });
    if (flowHistory.length > WINDOW_SIZE) flowHistory.pop();

    // Calculate flow momentum (exponential decay)
    hpTotal = hpTotal * 0.95 + hpChange;
    dpTotal = dpTotal * 0.95 + dpChange;

    updateFlowVisual();
}

function updateFlowVisual() {
    const total = hpTotal + dpTotal;
    const hpPercent = total > 0 ? (hpTotal / total) * 100 : 50;
    const dpPercent = total > 0 ? (dpTotal / total) * 100 : 50;

    document.getElementById("flow-hp").style.width = `${hpPercent}%`;
    document.getElementById("flow-dp").style.width = `${dpPercent}%`;

    // Subtle intensity indicators
    document.body.classList.toggle("strong-hp", hpPercent > INTENSITY_THRESHOLD * 100);
    document.body.classList.toggle("strong-dp", dpPercent > INTENSITY_THRESHOLD * 100);

    // Dynamic swoosh speed based on momentum
    const flowVelocity = Math.abs(hpPercent - dpPercent) / 100;
    document.documentElement.style.setProperty("--swoosh-speed", `${3 - flowVelocity * 1.5}s`);

    // Pause animations when balanced
    if (Math.abs(hpPercent - dpPercent) < 15) {
        document.getElementById("flow-hp").style.animationPlayState = "paused";
        document.getElementById("flow-dp").style.animationPlayState = "paused";
    } else {
        document.getElementById("flow-hp").style.animationPlayState = "running";
        document.getElementById("flow-dp").style.animationPlayState = "running";
    }
}

// Connect to your event stream
window.alertAPI.onAlertEvents((events) => {
    events.forEach(processMarketFlow);
});

// Initialize balanced flow
updateFlowVisual();
