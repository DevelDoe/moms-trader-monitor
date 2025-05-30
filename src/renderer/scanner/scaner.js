function parseVolumeValue(str) {
    if (!str) return 0;
    let value = parseFloat(String(str).replace(/[^0-9.]/g, "")) || 0;

    if (/B/i.test(str)) value *= 1_000_000_000;
    else if (/M/i.test(str)) value *= 1_000_000;
    else if (/K/i.test(str)) value *= 1_000;

    return value;
}
const debug = true;
document.addEventListener("DOMContentLoaded", async () => {
    window.settings = await window.settingsAPI.get();
    console.log("loaded settings: ", window.settings);

    const magicDustAudio = new Audio("./magic.mp3");
    magicDustAudio.volume = 0.3;
    // magicDustAudio.volume = 0;

    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);
        window.settings = updatedSettings;
    });

    const logElement = document.getElementById("log");
    const symbolColors = {};
    const symbolUpticks = {}; // Track consecutive upticks per symbol

    function getSymbolColor(symbol) {
        if (!symbolColors[symbol]) {
            const hash = [...symbol].reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const hue = (hash * 37) % 360;
            symbolColors[symbol] = `hsla(${hue}, 80%, 50%, 0.5)`;
        }
        return symbolColors[symbol];
    }

    // function playAudioAlert(symbol, alertType = "standard") {
    //     const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    //     const oscillator = audioCtx.createOscillator();
    //     const gainNode = audioCtx.createGain();

    //     oscillator.connect(gainNode).connect(audioCtx.destination);

    //     const baseFrequencies = { "new-high-price": 880, critical: 660, standard: 440 };
    //     let baseFrequency = baseFrequencies[alertType] || 440;

    //     let uptickCount = symbolUpticks[symbol] || 0;
    //     let frequency = baseFrequency + uptickCount * 50;
    //     oscillator.frequency.value = frequency;

    //     const volume = Math.max(0, Math.min(1, window.settings?.scanner?.scannerVolume ?? 0.5));
    //     gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    //     gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

    //     oscillator.start();
    //     oscillator.stop(audioCtx.currentTime + 0.15);

    //     oscillator.onended = () => audioCtx.close();
    // }

    function playAudioAlert(symbol, alertType = "standard", volumeValue = 0) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode).connect(audioCtx.destination);

        const uptickCount = symbolUpticks[symbol] || 0;

        let baseFreq = 432;
        let duration = 0.15;
        let attack = 0.01;
        let decay = 0.05;
        let sustain = 0.3;
        let release = 0.1;

        if (volumeValue < 100000) {
            baseFreq = 64;
            duration = 0.12;
            attack = 0.005;
            decay = 0.02;
            sustain = 0.5;
            release = 0.03;
        } else if (volumeValue > 300000) {
            baseFreq = 432;
            duration = 0.4;
            attack = 0;
            decay = 0;
            sustain = 1;
            release = 0;
        } else {
            baseFreq = 216;
            duration = 0.3;
            attack = 0.4;
            decay = 0.05;
            sustain = 1;
            release = 0;
        }

        const frequency = baseFreq + uptickCount * 50;
        oscillator.frequency.value = frequency;

        // const volume = Math.max(0, Math.min(1, window.settings?.scanner?.scannerVolume ?? 0.5));
        const volume = 1;
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);

        oscillator.onended = () => audioCtx.close();
    }

    function createAlertElement(alertData) {
        const { symbol, price, change_percent = 0, direction = "", volume = 0, type = "" } = alertData;

        const alertDiv = document.createElement("li");

        if (type === "new-high-price") {
            console.log("🔥 New High Alert Volume Check:", alertData.fiveMinVolume);
            if (parseVolumeValue(alertData?.fiveMinVolume || 0) < 10_000) {
                console.log(`⏩ Skipping new-high alert for ${symbol} due to low volume (${alertData?.fiveMinVolume})`);
                return null;
            }
            alertDiv.className = "alert new-high";

            console.log("alertdata: ", alertData);

            const symbolSpan = document.createElement("span");
            symbolSpan.className = "alert-symbol no-drag";
            symbolSpan.textContent = symbol;
            symbolSpan.style.backgroundColor = getSymbolColor(symbol);
            symbolSpan.style.cursor = "pointer";
            symbolSpan.title = "Click to copy and set active ticker";

            symbolSpan.addEventListener("click", () => {
                navigator.clipboard.writeText(symbol);
                console.log(`📋 Copied ${symbol} to clipboard!`);
                window.activeAPI.setActiveTicker(symbol);
            });

            const contentDiv = document.createElement("div"); // 🛠️ You were missing this line!
            contentDiv.className = "alert-content";

            const valuesDiv = document.createElement("div");
            valuesDiv.className = "alert-values";
            const percent = direction === "DOWN" ? -change_percent : change_percent;

            valuesDiv.innerHTML = `
                <span>$${price.toFixed(2)}</span>
                <span>${percent.toFixed(2)}%</span>
            `;

            const newHighBar = document.createElement("div");
            newHighBar.className = "progress-bar";
            newHighBar.innerHTML = `<span style="color: gold; font-weight: bold;">✨ New High</span>`;

            contentDiv.appendChild(valuesDiv);
            contentDiv.appendChild(newHighBar);

            alertDiv.appendChild(symbolSpan);
            alertDiv.appendChild(contentDiv);

            magicDustAudio.currentTime = 0;
            magicDustAudio.play();

            return alertDiv;
        }

        const percent = direction === "DOWN" ? -change_percent : change_percent;
        alertDiv.className = `alert ${direction.toLowerCase()}`;

        const symbolSpan = document.createElement("span");
        symbolSpan.className = "alert-symbol no-drag";
        symbolSpan.textContent = symbol;
        symbolSpan.style.backgroundColor = getSymbolColor(symbol);
        symbolSpan.style.cursor = "pointer";
        symbolSpan.title = "Click to copy and set active ticker";

        // ✅ Click to copy and set active ticker
        symbolSpan.addEventListener("click", () => {
            navigator.clipboard.writeText(symbol);
            console.log(`📋 Copied ${symbol} to clipboard!`);
            window.activeAPI.setActiveTicker(symbol);
        });

        const contentDiv = document.createElement("div");
        contentDiv.className = "alert-content";

        const valuesDiv = document.createElement("div");
        valuesDiv.className = "alert-values";
        valuesDiv.innerHTML = `<span>$${price.toFixed(2)}</span><span>${percent.toFixed(2)}%</span>`;

        const progressBar = document.createElement("div");
        progressBar.className = "progress-bar";

        const totalSegments = 10;
        const midPoint = Math.floor(totalSegments / 2);
        const filledSegments = Math.min(5, Math.round(Math.abs(percent) / 2));

        for (let i = 0; i < totalSegments; i++) {
            const segment = document.createElement("span");
            segment.className = "segment";

            if (percent > 0 && i >= midPoint && i < midPoint + filledSegments) {
                segment.classList.add("filled", "up");
            } else if (percent < 0 && i < midPoint && i >= midPoint - filledSegments) {
                segment.classList.add("filled", "down");
            }

            progressBar.appendChild(segment);
        }

        contentDiv.appendChild(valuesDiv);
        contentDiv.appendChild(progressBar);

        alertDiv.appendChild(symbolSpan);
        alertDiv.appendChild(contentDiv);

        // Apply blinking effect only if the direction is UP (upticks)
        if (direction === "UP" && volume > 300000) {
            alertDiv.classList.add("blinking-alert"); // Add the blinking class for high volume
        }

        // Remove previous low classes just in case
        alertDiv.classList.remove("low-1", "low-2", "low-3", "low-4");

        if (volume < 100000 || direction === "DOWN") {
            if (volume >= 75000) {
                alertDiv.classList.add("low-1");
            } else if (volume >= 50000) {
                alertDiv.classList.add("low-2");
            } else if (volume >= 25000) {
                alertDiv.classList.add("low-3");
            } else {
                alertDiv.classList.add("low-4");
            }
        }

        return alertDiv;
    }

    window.eventsAPI.onAlert((alertData) => {
        try {
            console.log("[CLIENT] Received via IPC:", alertData);

            const topSettings = window.settings?.top || {};
            const scannerSettings = window.settings?.scanner || {};

            const { minChangePercent = 0, minVolume = 0, direction = null, maxAlerts = 50 } = scannerSettings;

            // ✅ minPrice and maxPrice always from top
            const minPrice = topSettings.minPrice ?? 0;
            const maxPrice = topSettings.maxPrice ?? Infinity;

            const passesFilters =
                (minPrice === 0 || alertData.price >= minPrice) &&
                (maxPrice === 0 || alertData.price <= maxPrice) &&
                (minChangePercent === 0 || alertData.change_percent >= minChangePercent) &&
                (minVolume === 0 || alertData.volume >= minVolume) &&
                (!direction || alertData.direction === direction);

            if (!passesFilters) {
                if (debug) console.log(`⛔ Skipping alert for ${alertData.symbol} — filter mismatch.`);
                return;
            }

            // 🔔 Logic continues as normal
            const currentMaxAlerts = maxAlerts;
            const alertType = alertData.type || "standard";
            const symbol = alertData.symbol;
            const percent = alertData.direction === "DOWN" ? -alertData.change_percent : alertData.change_percent;

            if (percent > 0) {
                symbolUpticks[symbol] = (symbolUpticks[symbol] || 0) + 1;
            } else {
                symbolUpticks[symbol] = 0;
            }

            if (alertData.direction === "UP" && alertData.volume >= 30000) {
                playAudioAlert(symbol, alertType, alertData.volume);
            }

            const alertElement = createAlertElement(alertData);
            if (alertElement instanceof Node) {
                logElement.appendChild(alertElement);

                while (logElement.children.length > currentMaxAlerts) {
                    logElement.removeChild(logElement.firstChild);
                }
            }
        } catch (error) {
            console.error("[CLIENT] Error handling alert:", error);
        }
    });
});
