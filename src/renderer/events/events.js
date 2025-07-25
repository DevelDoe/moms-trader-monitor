// ============================
// Global Variables
// ============================
// Debug Mode
const debugMode = window.appFlags?.isDev === true;
const debugCombo = true;
if (!debugMode) {
    console.log = () => {};
    console.debug = () => {};
    console.warn = () => {};
}
// Alert Queue
const alertQueue = [];
let flushScheduled = false;

// Audio
let lastAudioTime = 0;
const MIN_AUDIO_INTERVAL_MS = 93;

const symbolUptickTimers = {};
const symbolNoteIndices = {};
const UPTICK_WINDOW_MS = 20_000;

const fSharpMajorHz = [
    92.5, // F#2
    110.0, // G#2
    123.47, // A#2
    138.59, // B2
    155.56, // D#3
    174.61, // F3
    196.0, // G#3

    185.0, // F#3
    220.0, // G#3
    246.94, // A#3
    277.18, // B3
    311.13, // D#4
    349.23, // F4
    392.0, // G#4

    369.99, // F#4
    440.0, // G#4
    493.88, // A#4
    554.37, // B4
    622.25, // D#5
    698.46, // F5
    783.99, // G#5

    739.99, // F#5
    880.0, // G#5
    987.77, // A#5
    1108.73, // B5
    1244.51, // D#6
    1396.91, // F6
    1567.98, // G#6
];

// Minimum volume required to reach each combo leve
const COMBO_VOLUME_REQUIREMENTS = [
    0,      // Level 0 → just started, no requirement
    50,    // Level 1 → first real alert
    150,   // Level 2
    1000,  // Level 3
    2000,  // Level 4
    4000,  // Level 5
    6000,  // Level 6+
];

// ============================
// Utility: Parse Volume String
// ============================
function parseVolumeValue(str) {
    if (!str) return 0;
    let value = parseFloat(String(str).replace(/[^0-9.]/g, "")) || 0;
    if (/B/i.test(str)) value *= 1_000_000_000;
    else if (/M/i.test(str)) value *= 1_000_000;
    else if (/K/i.test(str)) value *= 1_000;
    return value;
}

// Utility function to check if current time is quiet time (8:00-8:12 EST)
function isQuietTimeEST() {
    const estNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const h = estNow.getHours();
    const m = estNow.getMinutes();

    return (
        (h === 8 && m < 3) || // 08:00–08:02
        (h === 9 && m >= 30 && m < 34) // 09:30–09:33
    );
}

function abbreviatedValues(num) {
    if (num < 1000) return num.toString(); // No abbreviation under 1K
    if (num < 1_000_000) return (num / 1_000).toFixed(1) + "K";
    return (num / 1_000_000).toFixed(1) + "M";
}

// ============================
// App Initialization
// ============================
document.addEventListener("DOMContentLoaded", async () => {
    window.settings = await window.settingsAPI.get();
    // console.log("loaded settings:", window.settings);

    const magicDustAudio = new Audio("./magic.mp3");
    magicDustAudio.volume = 0.3;

    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);
        window.settings = updatedSettings;
    });

    const logElement = document.getElementById("log");
    const symbolColors = {};
    const symbolUpticks = {};

    function getSymbolColor(hue) {
        return `hsla(${hue}, 80%, 50%, 0.5)`;
    }

    let audioCtx = null;

    function getAudioCtx() {
        if (!audioCtx || audioCtx.state === "closed") {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } else if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function playNote(frequency, volumeValue = 0) {
        const audioCtx = getAudioCtx();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        filter.type = "lowpass";
        filter.frequency.value = 1000;
        filter.Q.value = 1;

        oscillator.connect(filter).connect(gainNode).connect(audioCtx.destination);

        oscillator.frequency.value = frequency;

        // ⏱️ Duration based on volume
        let duration = 0.150;
        if (volumeValue > 60_000) duration = 0.6;
        else if (volumeValue > 30_000) duration = 0.45;
        else if (volumeValue > 10_000) duration = 0.35;

        gainNode.gain.setValueAtTime(0.75, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
    }

    function createAlertElement(alertData) {
        const { hero, price, strength = 0, hp = 0, dp = 0 } = alertData;
        const comboLevel = Math.max(0, symbolNoteIndices[hero] ?? -1);
        const maxCombo = 16;
        const comboPercent = Math.min(1, Math.pow(comboLevel / maxCombo, 0.65)) * 100;
        const percent = hp || -dp;
        const isUp = hp > 0;
        const volume = strength;
        const isNewHigh = alertData.isHighOfDay === true;
        const isNewEntry = alertData.isNewEntry === true;

        const alertDiv = document.createElement("li");
        alertDiv.dataset.symbol = hero;

        const fillDiv = document.createElement("div");
        fillDiv.className = "combo-fill";
        alertDiv.appendChild(fillDiv);

        const contentDiv = document.createElement("div");
        contentDiv.className = "alert-content";

        const valuesDiv = document.createElement("div");
        valuesDiv.className = "alert-values";
        valuesDiv.innerHTML = `
            <span class="alert-symbol no-drag" style="background-color: ${getSymbolColor(alertData.hue || 0)}" title="Click to copy and set active ticker">${hero}</span>
            <span class="price">$${price.toFixed(2)}</span>
            <span class="${isUp ? "change-up" : "change-down"}">${percent.toFixed(2)}%</span>
            <span class="size">${abbreviatedValues(volume)}</span>
        `;
        contentDiv.appendChild(valuesDiv);

        valuesDiv.querySelector(".alert-symbol").onclick = () => {
            navigator.clipboard.writeText(hero);
            window.activeAPI.setActiveTicker(hero);
        };

        const symbolEl = valuesDiv.querySelector(".alert-symbol");

        alertDiv.className = `alert ${isUp ? "up" : "down"}`;

        // In createAlertElement, for high-of-day sound:
        if (isNewHigh) {
            const now = Date.now();
            if (now - lastAudioTime >= MIN_AUDIO_INTERVAL_MS) {
                alertDiv.classList.add("new-high");
                if (!isQuietTimeEST()) {
                    magicDustAudio.volume = Math.min(1.0, Math.max(0.1, volume / 10000));
                    magicDustAudio.currentTime = 0;
                    magicDustAudio.play();
                    lastAudioTime = now;
                } else if (debugMode) {
                    console.log(`🔕 Magic dust audio suppressed during quiet time (8:00-8:12 EST)`);
                }
            }
        }

        if (isNewEntry) {
            alertDiv.classList.add("new-entry");
            // contentDiv.innerHTML += `<div class="progress-bar"><span style="color: lightblue; font-weight: bold;">🆕 New Entry</span></div>`;
        }

        if (isUp && volume > 9000) alertDiv.classList.add("blinking-alert");

        alertDiv.classList.remove("low-1", "low-2", "low-3", "low-4");

        let brightnessClass = "";
        if (volume >= 60_000) brightnessClass = "low-1";
        else if (volume >= 30_000) brightnessClass = "low-2";
        else if (volume >= 10_000) brightnessClass = "low-3";
        else brightnessClass = "low-4";

        if (hp > 0 || dp > 0) {
            alertDiv.classList.add(brightnessClass);
        }

        alertDiv.appendChild(contentDiv);
        if (hp > 0 && comboLevel >= 1) {
            fillDiv.style.width = `${comboPercent}%`;

            // 🔴 Add combo border to alert card itself
            alertDiv.classList.add("combo-active");

            // 🎵 Add pulse class based on combo level

            fillDiv.classList.remove("combo-pulse-1", "combo-pulse-2", "combo-pulse-3", "combo-pulse-4");
            const pulseStep = Math.min(4, Math.floor(comboLevel / 2)); // 0–4
            if (pulseStep >= 1) fillDiv.classList.add(`combo-pulse-${pulseStep}`);
        }

        return alertDiv;
    }

    function flushAlerts() {
        flushScheduled = false;
        const maxAlerts = window.settings?.scanner?.maxAlerts || 50;

        for (const data of alertQueue) {
            const alertElement = createAlertElement(data);
            if (alertElement instanceof Node) {
                logElement.appendChild(alertElement);
            }
        }

        // ⏱ Do this only once per frame
        while (logElement.children.length > maxAlerts) {
            logElement.removeChild(logElement.firstChild);
        }

        alertQueue.length = 0;
    }

    function resetCombo(symbol) {
        delete symbolUptickTimers[symbol];
        delete symbolNoteIndices[symbol];

        document.querySelectorAll(`.alert[data-symbol="${symbol}"]`).forEach((alertDiv) => {
            alertDiv.classList.remove("combo-active");
            const fillDiv = alertDiv.querySelector(".combo-fill");
            if (fillDiv) {
                fillDiv.classList.remove("combo-pulse-1", "combo-pulse-2", "combo-pulse-3", "combo-pulse-4");
                fillDiv.style.width = "0%";
                fillDiv.style.background = "";
            }
        });

        if (debugMode) console.log(`🔄 ${symbol} combo fully reset`);
    }

    // ============================
    // Alert Event Listener
    // ============================
    window.eventsAPI.onAlert((alertData) => {
        try {
            // if (debugMode) console.log("[CLIENT] Received via IPC:", alertData);

            const topSettings = window.settings?.top || {};
            const scannerSettings = window.settings?.scanner || {};
            const { minChangePercent = 0, minVolume = 0, maxAlerts = 50 } = scannerSettings;
            const { minPrice = 0, maxPrice = Infinity } = topSettings;

            const symbol = alertData.hero || alertData.symbol;
            const { price = 0, hp = 0, dp = 0, strength = 0 } = alertData;

            // 🔍 Debug the actual filter values and the incoming data
            // if (debugMode) {
            //     console.log("🧪 Settings:", { minPrice, maxPrice, minChangePercent, minVolume });
            //     console.log("🧪 Alert candidate:", { symbol, price, hp, dp, strength });
            // }

            const passesFilters = (minPrice === 0 || price >= minPrice) && (maxPrice === 0 || price <= maxPrice) && (hp >= minChangePercent || dp >= minChangePercent) && strength >= minVolume;

            if (!passesFilters) {
                // if (debugMode) console.log("⛔️ Filtered out:", symbol);
                return;
            }

            const now = Date.now(); // 🧼 keep only this one at the top of the block

            const quietTime = isQuietTimeEST();

            if (hp > 0 && strength >= minVolume) {
                if (debugMode && debugCombo) console.log(`🔍 ${symbol} tick detected — HP: ${hp.toFixed(2)} | Volume: ${strength}`);


                if (debugMode && debugCombo) {
                    console.log(`\n📌 ${symbol} — Incoming Tick`);
                    console.log(`   🧭 Previous Level: ${symbolNoteIndices[symbol] ?? "N/A (defaulting to 0)"}`);
                    console.log(`   💪 Volume: ${strength} | 🔺 HP: ${hp.toFixed(2)}`);
                }

                const currentLevel = symbolNoteIndices[symbol] ?? -1;
                const nextLevel = currentLevel + 1;
                
                const currentRequiredVolume = COMBO_VOLUME_REQUIREMENTS[Math.min(currentLevel, COMBO_VOLUME_REQUIREMENTS.length - 1)];
                const requiredVolume = COMBO_VOLUME_REQUIREMENTS[Math.min(nextLevel, COMBO_VOLUME_REQUIREMENTS.length - 1)];
                
                if (symbolUptickTimers[symbol]) {
                    clearTimeout(symbolUptickTimers[symbol]);
                
                    if (strength >= requiredVolume) {
                        symbolNoteIndices[symbol] = nextLevel;
                
                        if (nextLevel >= 1 && !quietTime && now - lastAudioTime >= MIN_AUDIO_INTERVAL_MS) {
                            const note = fSharpMajorHz[Math.min(nextLevel, fSharpMajorHz.length - 1)];
                            playNote(note, strength);
                            lastAudioTime = now;
                            if (debugMode && debugCombo) console.log(`🎵 ${symbol} combo advanced to LV${nextLevel}`);
                        }
                
                        // 🔁 Restart timer on successful uptick
                        symbolUptickTimers[symbol] = setTimeout(() => {
                            if (debugMode && debugCombo) console.log(`⌛ ${symbol} combo expired`);
                            resetCombo(symbol);
                        }, UPTICK_WINDOW_MS);
                
                    } else {
                        if (debugMode && debugCombo) console.log(`❌ ${symbol} combo reset — volume too low`);
                        resetCombo(symbol);
                        return;
                    }
                } else {
                    // First uptick — start tracking
                    symbolNoteIndices[symbol] = 0;
                    if (debugMode && debugCombo) console.log(`🧪 ${symbol} started tracking (LV0)`);
                
                    symbolUptickTimers[symbol] = setTimeout(() => {
                        if (debugMode && debugCombo) console.log(`⌛ ${symbol} combo expired`);
                        resetCombo(symbol);
                    }, UPTICK_WINDOW_MS);
                }
            }

            alertQueue.push(alertData);
            if (!flushScheduled) {
                flushScheduled = true;
                requestAnimationFrame(flushAlerts);
            }
        } catch (error) {
            console.error("[CLIENT] Error handling alert:", error);
        }
    });
});
//
