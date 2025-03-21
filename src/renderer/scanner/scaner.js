document.addEventListener("DOMContentLoaded", async () => {
    window.settings = await window.settingsAPI.get();

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

    function playAudioAlert(symbol, alertType = "standard") {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
    
        oscillator.connect(gainNode).connect(audioCtx.destination);
    
        const baseFrequencies = { "new-high-price": 880, critical: 660, standard: 440 };
        let baseFrequency = baseFrequencies[alertType] || 440;
    
        let uptickCount = symbolUpticks[symbol] || 0;
        let frequency = baseFrequency + uptickCount * 50;
        oscillator.frequency.value = frequency;
    
        const volume = Math.max(0, Math.min(1, window.settings?.scanner?.scannerVolume ?? 0.5));
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    
        oscillator.onended = () => audioCtx.close();
    }

    function createAlertElement(alertData) {
        const { symbol, price, change_percent, direction } = alertData;
        const percent = direction === "DOWN" ? -change_percent : change_percent;

        const alertDiv = document.createElement("li");
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

        return alertDiv;
    }

    window.scannerAPI.onAlert((alertData) => {
        try {
            console.log("[CLIENT] Received via IPC:", alertData);
    
            // ✅ Scanner filters from settings
            const {
                minPrice = 0,
                maxPrice = Infinity,
                minChangePercent = 0,
                minVolume = 0,
                direction = null
            } = window.settings?.scanner || {};
    
            const passesFilters =
                alertData.price >= minPrice &&
                alertData.price <= maxPrice &&
                alertData.change_percent >= minChangePercent &&
                alertData.volume >= minVolume &&
                (direction === null || alertData.direction === direction);
    
            if (!passesFilters) return; // ❌ Skip alert if it doesn't match filters
    
            // 🔔 Logic continues as normal
            const currentMaxAlerts = window.settings?.scanner?.maxAlerts ?? 50;
            const alertType = alertData.type || "standard";
            const symbol = alertData.symbol;
            const percent = alertData.direction === "DOWN" ? -alertData.change_percent : alertData.change_percent;
    
            if (percent > 0) {
                symbolUpticks[symbol] = (symbolUpticks[symbol] || 0) + 1;
            } else {
                symbolUpticks[symbol] = 0;
            }
    
            if (alertData.direction === "UP") {
                playAudioAlert(symbol, alertType);
            }
    
            const alertElement = createAlertElement(alertData);
            logElement.appendChild(alertElement);
    
            while (logElement.children.length > currentMaxAlerts) {
                logElement.removeChild(logElement.firstChild);
            }
        } catch (error) {
            console.error("[CLIENT] Error handling alert:", error);
        }
    });
    
    
});
