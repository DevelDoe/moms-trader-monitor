// scanner.js

// Initialize scanner module when document is ready
document.addEventListener("DOMContentLoaded", async () => {
    window.settings = await window.settingsAPI.get();

    // ✅ Listen for settings updates globally
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        console.log("🎯 Settings updated in Top Window, applying changes...", updatedSettings);
        window.settings = updatedSettings;
    });

    const logElement = document.getElementById("log");
    const symbolListElement = document.getElementById("symbol-list");

    const symbolPercents = {};
    const symbolPrices = {};
    const symbolColors = {};

    function getSymbolColor(symbol) {
        if (!symbolColors[symbol]) {
            const hash = [...symbol].reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const hue = (hash * 37) % 360;
            symbolColors[symbol] = `hsla(${hue}, 80%, 50%, 0.5)`;
        }
        return symbolColors[symbol];
    }

    function play(alertType = "standard") {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode).connect(audioCtx.destination);

        const frequencies = { "new-high-price": 880, critical: 660, standard: 440 };
        oscillator.frequency.value = frequencies[alertType] || 440;

        gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);

        oscillator.onended = () => audioCtx.close();
    }

    function updateSymbolSummary() {
        const alerts = [...logElement.querySelectorAll(".alert")].slice(-5);
        symbolListElement.innerHTML = "";
    
        alerts.forEach((alert) => {
            const symbol = alert.querySelector(".alert-symbol")?.textContent.trim();
            if (!symbol) return; // Skip invalid alerts
    
            const percentText = alert.querySelector(".symbol-data span:first-child")?.textContent.trim() || "0%";
            const percent = parseFloat(percentText.replace("%", "")) || 0;
    
            const symbolSpan = document.createElement("span");
            symbolSpan.textContent = symbol;
            symbolSpan.style.backgroundColor = getSymbolColor(symbol);
            symbolSpan.className = "symbol";
            symbolSpan.style.cursor = "pointer";
            symbolSpan.title = "Click to copy and set active ticker";
    
            // ✅ Click to copy and set active ticker
            symbolSpan.addEventListener("click", () => {
                navigator.clipboard.writeText(symbol);
                console.log(`📋 Copied ${symbol} to clipboard!`);
                window.activeAPI.setActiveTicker(symbol);
            });
    
            // ✅ Fix: Ensure progress bar fills correctly
            const progressBar = document.createElement("span");
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
    
            const li = document.createElement("li");
            li.className = "symbol-item";
            li.append(symbolSpan, progressBar);
            symbolListElement.appendChild(li);
        });
    }
    

    function formatLargeNumber(value) {
        if (!value || isNaN(value)) return "-";
        const num = Number(value);
        if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
        if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
        return num.toLocaleString();
    }

    window.scannerAPI.onAlert((alertData) => {
        try {
            console.log("[CLIENT] Received via IPC:", alertData);
            const currentMaxAlerts = window.settings?.scanner?.maxAlerts ?? 50;
            const alertType = alertData.type || "standard";
            const settings = window.settings?.scanner || {};

            const alertPrice = Number(alertData.price) || 0;
            const minPrice = Number(settings.minPrice) || 0;
            const maxPrice = Number(settings.maxPrice) || 0;
            const minChangePercent = Number(settings.minChangePercent) || 0;
            const minVolume = Number(settings.minVolume) || 0;
            const percent = alertData.direction === "DOWN" ? -alertData.change_percent : alertData.change_percent;

            // ✅ Apply filters to ALL alert types, including new-high-price:
            const passesFilters =
                (!settings.direction || alertData.direction === settings.direction) &&
                (minChangePercent <= 0 || Math.abs(percent) >= minChangePercent) &&
                (minPrice <= 0 || alertPrice >= minPrice) &&
                (maxPrice <= 0 || alertPrice <= maxPrice) &&
                (minVolume <= 0 || alertData.volume >= minVolume);

            if (!passesFilters) return; // 🛑 Stop if filters fail

            // ✅ Play sound for specific alert type
            if (alertType === "new-high-price") play("new-high-price");

            // ✅ Generate segment visuals before appending alert
            const totalSegments = 10;
            const midPoint = Math.floor(totalSegments / 2);
            let segmentsHtml = Array(totalSegments).fill('<span class="segment"></span>');
            const filledSegments = Math.min(5, Math.round(Math.abs(percent) / 2));

            if (percent > 0) {
                play("standard");
                for (let i = midPoint; i < midPoint + filledSegments && i < totalSegments; i++) {
                    segmentsHtml[i] = '<span class="segment filled up"></span>';
                }
            } else if (percent < 0) {
                for (let i = midPoint - 1; i >= midPoint - filledSegments && i >= 0; i--) {
                    segmentsHtml[i] = '<span class="segment filled down"></span>';
                }
            }

            const alertDiv = document.createElement("li");
            alertDiv.className = `alert ${alertType === "new-high-price" ? "new-high-price" : alertData.direction.toLowerCase()}`;

            if (alertType === "new-high-price") {
                alertDiv.innerHTML = `
                    <div class="alert-header">
                        <span class="alert-symbol" style="background-color: ${getSymbolColor(alertData.symbol)}; padding: 2px 5px; border-radius: 3px; color: #1c1d23;">${alertData.symbol}</span>
                        <span class="symbol-data">New High 🚀 (${percent.toFixed(2)}%)</span>
                    </div>`;
            } else {
                alertDiv.innerHTML = `
                    <div class="alert-header">
                        <span class="alert-symbol" style="background-color: ${getSymbolColor(alertData.symbol)}; padding: 2px 5px; border-radius: 3px; color: #1c1d23;">${alertData.symbol}</span>
                        <span class="symbol-data">$${alertPrice.toFixed(2)}</span>
                        <span class="symbol-data">${percent.toFixed(2)}%</span>
                    </div>`; // ✅ Closing </div> was missing
            }

            logElement.appendChild(alertDiv);
            updateSymbolSummary();

            while (logElement.children.length > currentMaxAlerts) {
                logElement.removeChild(logElement.firstChild);
            }
        } catch (error) {
            console.error("[CLIENT] Error handling alert:", error);
        }
    });
});
