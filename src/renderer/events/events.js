// ============================
// Global Variables
// ============================
// Debug Mode
const debugMode = window.appFlags?.isDev === true;
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

// ============================
// App Initialization
// ============================
document.addEventListener("DOMContentLoaded", async () => {
    window.settings = await window.settingsAPI.get();
    console.log("loaded settings:", window.settings);

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
    const fSharpMajorHz = buildFSharpMajorScale();

    function getAudioCtx() {
        if (!audioCtx || audioCtx.state === "closed") {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } else if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function buildFSharpMajorScale(minFreq = 20, maxFreq = 20000) {
        const semitoneSteps = [0, 2, 4, 5, 7, 9, 11]; // intervals in major scale
        const baseNote = 54; // F#3 ~ 185 Hz
        const scale = [];

        for (let midi = baseNote; midi < 128; midi++) {
            const semitoneFromBase = (midi - baseNote) % 12;
            if (semitoneSteps.includes(semitoneFromBase)) {
                const freq = 440 * Math.pow(2, (midi - 69) / 12);
                if (freq >= minFreq && freq <= maxFreq) {
                    scale.push(freq);
                }
            }
        }

        return scale;
    }

    function quantizeToFSharpMajor(freq) {
        return fSharpMajorHz.reduce((prev, curr) => (Math.abs(curr - freq) < Math.abs(prev - freq) ? curr : prev));
    }

    function playAudioAlert(symbol, volumeValue = 0) {
        const audioCtx = getAudioCtx();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode).connect(audioCtx.destination);

        const uptickCount = symbolUpticks[symbol] || 0;

        let baseFreq = 180; // was 216
        let duration = 0.2; // was 0.3

        if (volumeValue > 5000) {
            baseFreq = 320;
            duration = 0.5;
        }

        const rawFreq = baseFreq + uptickCount * 30; // less aggressive ramp
        const quantizedFreq = quantizeToFSharpMajor(rawFreq);

        oscillator.frequency.value = quantizedFreq;
        gainNode.gain.setValueAtTime(0.75, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
        oscillator.onended = () => {
            // Do nothing — keep AudioContext alive
        };
    }

    function createAlertElement(alertData) {
        const { hero, price, strength = 0, type = "", hp = 0, dp = 0, fiveMinVolume = 0 } = alertData;
        const percent = hp || -dp;
        const isUp = hp > 0;
        const volume = strength;
        const isNewHigh = alertData.isHighOfDay === true;
        const isNewEntry = alertData.isNewEntry === true;

        const alertDiv = document.createElement("li");

        const contentDiv = document.createElement("div");
        contentDiv.className = "alert-content";

        const valuesDiv = document.createElement("div");
        valuesDiv.className = "alert-values";
        valuesDiv.innerHTML = `
            <span class="alert-symbol no-drag"
                  style="background-color: ${getSymbolColor(alertData.hue || 0)}"
                  title="Click to copy and set active ticker">${hero}</span>
            <span class="price">$${price.toFixed(2)}</span>
            <span class="${isUp ? "change-up" : "change-down"}">${percent.toFixed(2)}%</span>
            <span class="size">${(volume / 1000).toFixed(1)}K</span>
        `;
        contentDiv.appendChild(valuesDiv);

        valuesDiv.querySelector(".alert-symbol").onclick = () => {
            navigator.clipboard.writeText(hero);
            window.activeAPI.setActiveTicker(hero);
        };

        alertDiv.className = `alert ${isUp ? "up" : "down"}`;

        if (isNewHigh) {
            alertDiv.classList.add("new-high");
            contentDiv.innerHTML += `<div class="progress-bar"><span style="color: gold; font-weight: bold;">✨ High of Day</span></div>`;
            magicDustAudio.currentTime = 0;
            magicDustAudio.play();
        }

        if (isNewEntry) {
            alertDiv.classList.add("new-entry");
            contentDiv.innerHTML += `<div class="progress-bar"><span style="color: lightblue; font-weight: bold;">🆕 New Entry</span></div>`;
        }

        if (isUp && volume > 9000) alertDiv.classList.add("blinking-alert");

        alertDiv.classList.remove("low-1", "low-2", "low-3", "low-4");

        let brightnessClass = "";
        if (volume >= 7500) brightnessClass = "low-1";
        else if (volume >= 5000) brightnessClass = "low-2";
        else if (volume >= 2500) brightnessClass = "low-3";
        else brightnessClass = "low-4";

        if (hp > 0 || dp > 0) {
            alertDiv.classList.add(brightnessClass);
        }

        alertDiv.appendChild(contentDiv);
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

    // ============================
    // Alert Event Listener
    // ============================
    window.eventsAPI.onAlert((alertData) => {
        try {
            if (debugMode) console.log("[CLIENT] Received via IPC:", alertData);

            const topSettings = window.settings?.top || {};
            const scannerSettings = window.settings?.scanner || {};
            const { minChangePercent = 0, minVolume = 0, maxAlerts = 50 } = scannerSettings;
            const { minPrice = 0, maxPrice = Infinity } = topSettings;

            const symbol = alertData.hero || alertData.symbol;
            const { price = 0, hp = 0, dp = 0, strength = 0 } = alertData;

            // 🔍 Debug the actual filter values and the incoming data
            if (debugMode) {
                console.log("🧪 Settings:", { minPrice, maxPrice, minChangePercent, minVolume });
                console.log("🧪 Alert candidate:", { symbol, price, hp, dp, strength });
            }

            const passesFilters = (minPrice === 0 || price >= minPrice) && (maxPrice === 0 || price <= maxPrice) && hp >= minChangePercent && strength >= minVolume;

            if (!passesFilters) {
                if (debugMode) console.log("⛔️ Filtered out:", symbol);
                return;
            }

            if (hp > 0 && strength >= 1000) {
                const now = Date.now();

                if (now - lastAudioTime >= MIN_AUDIO_INTERVAL_MS) {
                    // Reset upticks only per symbol still (optional)
                    symbolUpticks[symbol] = (symbolUpticks[symbol] || 0) + 1;
                    playAudioAlert(symbol, strength);
                    lastAudioTime = now;
                } else if (debugMode) {
                    console.log(`🔕 Skipped global alert (debounced, ${now - lastAudioTime}ms)`);
                }
            } else if (dp > 0) {
                // ⬇️ Reset pitch counter on downtick
                symbolUpticks[symbol] = 0;
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
