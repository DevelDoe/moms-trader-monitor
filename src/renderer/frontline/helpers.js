(() => {
    function exposeHelpers() {
        window.helpers = {
            calculateScore,
            computeVolumeScore,
            startScoreDecay,
            abbreviatedValues,
            getSymbolColor,
        };
        if (window.isDev) console.log("⚡ helper functions attached to window");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", exposeHelpers);
    } else {
        exposeHelpers(); // DOM already ready
    }

    function calculateScore(hero, event) {
        // if (event.one_min_volume < 1000) {
        //     if (window.isDev && debugSamples < debugLimitSamples) {
        //         console.log(`⚠️ Skipping event ${hero.hero} to low volume (strength: ${event.one_min_volume})`);
        //     }
        //     return 0;
        // }

        debugSamples++;
        const currentScore = Number(hero.score) || 0;

        if (window.isDev && debugSamples < debugLimitSamples) {
            console.log(`\n⚡⚡⚡ [${hero.hero}] SCORING BREAKDOWN ⚡⚡⚡`);
            console.log(`📜 INITIAL STATE → Price: ${hero.price} | Score: ${currentScore.toFixed(2)} | HP: ${hero.hp || 0} | DP: ${hero.dp || 0}`);
        }

        let baseScore = 0;
        const logStep = (emoji, message, value) => console.log(`${emoji} ${message.padEnd(30)} ${(Number(value) || 0).toFixed(2)}`);

        try {
            if (event.hp > 0) {
                baseScore += event.hp * 10;
                logStep("💖", "Base HP Added", baseScore);

                // const floatBuff = getHeroBuff(hero, "float");
                // const floatMult = floatBuff?.multiplier ?? 1;
                // baseScore *= floatMult;
                // logStep(floatBuff?.key === "floatCorrupt" ? "🧨" : "🏷️", `Float Mult (${abbreviatedValues(hero.floatValue)})`, floatMult);

                const volScore = computeVolumeScore(hero, event);
                baseScore += volScore;
                logStep("📢", "Crowd Participation Score", volScore);
            }

        } catch (err) {
            console.error(`⚠️ Scoring error for ${hero.hero}:`, err);
            baseScore = 0;
        }

        if (window.isDev && debugSamples < debugLimitSamples) {
            console.log("━".repeat(50));
            logStep("🎯", "TOTAL SCORE CHANGE", baseScore);
            console.log(`🎼 FINAL SCORE → ${Math.max(0, currentScore + baseScore).toFixed(2)}\n\n\n`);
        }

        return baseScore;
    }

    function computeVolumeScore(hero, event) {
        const price = hero.price || 1;
        const strength = event.one_min_volume || 0;

        if (strength < 1000) return 0;

        const dollarVolume = price * strength;
        let score = dollarVolume / 1000;

        // Penny penalty
        if (price < 2) score *= 0.8;

        // Optional cap
        score = Math.min(score, 1000);

        if (window.isDev && debugSamples < debugLimitSamples) {
            const volStr = abbreviatedValues(strength);
            const usdStr = abbreviatedValues(dollarVolume);
            console.log(`📊 Volume Score: ${hero.hero} — ${volStr} @ $${price.toFixed(2)} → $${usdStr} → Score: ${score.toFixed(1)}`);
        }

        return score;
    }

    function startScoreDecay() {
        let decayTickCount = 0;
        const DECAY_TICKS_BETWEEN_LOGS = 5;
    
        setInterval(() => {
            decayTickCount++;
            let changed = false;
            let totalDecay = 0;
            let heroesDecayed = 0;
            const activeHeroes = [];
    
            Object.entries(frontlineState).forEach(([symbol, hero]) => {
                if (hero.score > 0) {
                    const originalScore = hero.score;
                    const scale = 1 + hero.score / SCORE_NORMALIZATION;
                    const decayAmount = XP_DECAY_PER_TICK * scale;
                    let newScore = Math.max(0, hero.score - decayAmount);

    
                    if (hero.score !== newScore) {
                        hero.score = newScore;
                        hero.lastEvent.hp = 0;
                        hero.lastEvent.dp = 0;
    
                        changed = true;
                        totalDecay += originalScore - newScore;
                        heroesDecayed++;
                        activeHeroes.push(hero);
                    }
                } else if (hero.score === 0) {
                    if (window.isDev) console.log(`🧹 Removing ${symbol} from state (fully decayed)`);
                    delete frontlineState[symbol];
                    changed = true;
                }
            });
    
            if (changed) {
                renderAll();
                window.frontlineStateManager.saveState();
            }
        }, DECAY_INTERVAL_MS);
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