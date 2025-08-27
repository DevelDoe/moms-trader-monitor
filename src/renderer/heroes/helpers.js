(() => {
    function exposeHelpers() {
        window.helpers = {
            calculateScore,
            computeVolumeScore,
            isSurging,
            abbreviatedValues,
            getSymbolColor,
            getFloatScore,
            getXpProgress,
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

        // Logging initial state
        if (window.appFlags?.isDev && debugSamples < debugLimitSamples) console.log(`\n⚡⚡⚡ [${hero.hero}] SCORING BREAKDOWN ⚡⚡⚡`);
        if (window.appFlags?.isDev && debugSamples < debugLimitSamples)
            console.log(`📜 LV: ${hero.lv || 0} | Price: ${hero.price} | Score: ${currentScore.toFixed(2)} | HP: ${hero.hp || 0} | DP: ${hero.dp || 0}`);
        if (window.appFlags?.isDev && debugSamples < debugLimitSamples) console.log("━ ".repeat(25));

        let baseScore = 0;

        try {
            // If it's an "up" event (hp > 0)
            if (event.hp > 0) {
                baseScore += event.hp * 10;
                if (window.appFlags?.isDev && debugSamples < debugLimitSamples) logStep("💖", "Base HP Added", baseScore);

                // 💪 Base level boost
                const level = hero.lv || 1;
                const levelBoost = level * 100;
                baseScore += levelBoost;

                if (window.appFlags?.isDev && debugSamples < debugLimitSamples) {
                    logStep("⚡", `Surge Detected! Level Boost (LV ${level})`, levelBoost);
                }

                // 🧪 Rookie tier bonus (amplify surge for LV 1–3)
                if (level <= 3) {
                    const tierBoostMultiplier = 1.5 - (level - 1) * 0.1;
                    const boostedScore = baseScore * tierBoostMultiplier;

                    if (window.appFlags?.isDev && debugSamples < debugLimitSamples) {
                        logStep("🧪", `Tier Surge Bonus (x${tierBoostMultiplier.toFixed(2)})`, boostedScore - baseScore);
                    }

                    baseScore = boostedScore;
                }

                const volScore = computeVolumeScore(hero, event);
                baseScore += volScore;

                baseScore = Math.max(0, baseScore);
            }

            // If it's a "down" event (dp > 0) - this should give NEGATIVE score
            if (event.dp > 0 ) {
                const reverseScore = event.dp * 10; // Slightly weaker than up-score
                baseScore -= reverseScore; // ✅ This makes it negative

                if (window.appFlags?.isDev && debugSamples < debugLimitSamples) logStep("💔", "Down Pressure Penalty", -reverseScore);

                const volPenalty = computeVolumeScore(hero, event) * 0.5;
                baseScore -= volPenalty; // ✅ This also makes it negative

                if (window.appFlags?.isDev && debugSamples < debugLimitSamples) logStep("🔻", "Volume-Backed Selloff", -volPenalty);
            }
        } catch (err) {
            console.error(`⚠️ Scoring error for ${hero.hero}:`, err);
            baseScore = 0; // Reset on error
        }

        // Final log and result
        if (window.appFlags?.isDev && debugSamples < debugLimitSamples) console.log("━".repeat(50));
        if (window.appFlags?.isDev && debugSamples < debugLimitSamples) logStep("🎯", "TOTAL SCORE CHANGE", baseScore);
        if (window.appFlags?.isDev && debugSamples < debugLimitSamples) console.log(`🎼 FINAL SCORE → ${Math.max(0, currentScore + baseScore).toFixed(2)}\n\n\n`);

        return baseScore;
    }

    function computeVolumeScore(hero, event) {
        const price = hero.price || 1;
        const strength = event.one_min_volume || 0;
    
        if (strength < 100) return 0;
    
        const dollarVolume = price * strength;
    
        // Experimental log-based score (volume decoupled from hard domination)
        let score = Math.log10(dollarVolume + 1) * 100;
    
        if (price < 2) score *= 0.75;
        if (price > 12) score *= 0.9;
        if (price > 20) score *= 0.7;
    
        // return Math.min(score, 1000);
        return score;
    }

    function isSurging(hero, { slice = 3, minUps = 2, direction = "hp" } = {}) {
        if (!hero?.history?.length) return false;

        const recent = hero.history.slice(-slice);
        const active = recent.filter((e) => e[direction] > 0);

        return active.length >= minUps;
    }

    function getFloatScore(floatValue) {
        if (!floatValue || !Number.isFinite(floatValue)) return 1;

        const floatBuff = window.buffs
            .filter((b) => b.key?.startsWith("float") && "threshold" in b)
            .sort((a, b) => a.threshold - b.threshold)
            .find((b) => floatValue < b.threshold);

        return floatBuff?.score ?? 0;
    }

    function abbreviatedValues(value) {
        if (value === null || value === undefined || isNaN(value) || value === "") {
            return "-";
        }
        const num = Number(value);
        if (num >= 1_000_000_000) {
            return (num / 1_000_000_000).toFixed(2) + "B";
        }
        if (num >= 1_000_000) {
            return (num / 1_000_000).toFixed(2) + "M";
        }
        if (num >= 1_000) {
            return (num / 1_000).toFixed(2) + "K";
        }
        return num.toLocaleString();
    }

    function getSymbolColor(hue) {
        return `hsla(${hue}, 80%, 50%, 0.5)`;
    }

    function logStep(emoji, message, value) {
        if (window.appFlags?.isDev && debugSamples < debugLimitSamples) {
            console.log(`${emoji} ${message.padEnd(30)} ${(Number(value) || 0).toFixed(2)}`);
        }
    }

    function getTotalXpToReachLevel(level) {
        if (level <= 1) return 0;
        let totalXp = 0;
        for (let i = 1; i < level; i++) {
            totalXp += i * 1000;
        }
        return totalXp;
    }

    function getXpProgress(state) {
        const totalXp = state.totalXpGained || 0;
        const lv = Math.max(1, state.lv || 1);

        // Total XP needed to reach the next level
        const xpForNextLevel = getTotalXpToReachLevel(lv + 1);

        // Percentage progress toward next level based on total XP
        const xpPercent = xpForNextLevel > 0 ? Math.min((totalXp / xpForNextLevel) * 100, 100) : 100;

        return { totalXp, xpForNextLevel, xpPercent };
    }
})();