(() => {
    const logScoring = window.appFlags?.isDev || false;

    function exposeHelpers() {
        window.helpers = {
            calculateScore,
            computeVolumeScore,
            abbreviatedValues,
            getSymbolColor,
        };
        if (window.appFlags?.isDev) console.log("⚡ helper functions attached to window");
    }

    let debugSamples = 0;
    const debugLimitSamples = 5; // Fix: use global or default

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", exposeHelpers);
    } else {
        exposeHelpers(); // DOM already ready
    }

    function calculateScore(hero, event) {
        debugSamples++;
        const currentScore = Number(hero.score) || 0;
        const shouldLog = logScoring && debugSamples <= debugLimitSamples;

        if (shouldLog) {
            console.log(`\n⚡⚡⚡ [${hero.hero}] SCORING BREAKDOWN ⚡⚡⚡`);
            console.log(`📜 INITIAL STATE → Price: ${hero.price} | Score: ${currentScore.toFixed(2)} | HP: ${hero.hp || 0} | DP: ${hero.dp || 0}`);
        }

        let baseScore = 0;

        const logStep = (emoji, message, value) => {
            if (!shouldLog) return;
            console.log(`${emoji} ${message.padEnd(30)} ${(Number(value) || 0).toFixed(2)}`);
        };

        try {
            if (event.hp > 0) {
                baseScore += event.hp * 10;
                logStep("💖", "Base HP Added", baseScore);
        
                const volScore = computeVolumeScore(hero, event);
                baseScore += volScore;
                logStep("📢", "Crowd Participation Score", volScore);
            } else if (event.dp > 0) {
                const reverseScore = event.dp * 5 // Slightly weaker than up-score
                baseScore -= reverseScore;
                logStep("💔", "Down Pressure Penalty", -reverseScore);
        
                // Optionally, volume can dampen or amplify penalty:
                const volPenalty = computeVolumeScore(hero, event) * 0.5;
                baseScore -= volPenalty;
                logStep("🔻", "Volume-Backed Selloff", -volPenalty);
            }
        } catch (err) {
            console.error(`⚠️ Scoring error for ${hero.hero}:`, err);
            baseScore = 0;
        }

        if (shouldLog) {
            console.log("━".repeat(50));
            logStep("🎯", "TOTAL SCORE CHANGE", baseScore);
            console.log(`🎼 FINAL SCORE → ${Math.max(0, currentScore + baseScore).toFixed(2)}\n\n\n`);
        }

        return baseScore;
    }

    function computeVolumeScore(hero, event) {
        const price = hero.price || 1;
        const strength = event.one_min_volume || 0;
    
        if (strength < 100) return 0;
    
        const dollarVolume = price * strength;
    
        // Experimental log-based score (volume decoupled from hard domination)
        let score = Math.log10(dollarVolume + 1) * 100;
    
        if (price < 2) score *= 0.8;
        if (price > 12) score *= 0.9;
        if (price > 20) score *= 0.8;
    
        // return Math.min(score, 1000);
        return score;
    }
    
    function abbreviatedValues(num) {
        if (num < 1000) return num.toString();          // No abbreviation under 1K
        if (num < 1_000_000) return (num / 1_000).toFixed(1) + "K";
        return (num / 1_000_000).toFixed(1) + "M";
    }

    function getSymbolColor(hue) {
        return `hsla(${hue}, 80%, 50%, 0.5)`;
    }
})();