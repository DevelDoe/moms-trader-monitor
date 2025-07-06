(() => {
    function exposeHelpers() {
        window.helpers = {
            calculateScore,
            computeVolumeScore,
            isSurging,
            startScoreDecay,
            abbreviatedValues,
            getSymbolColor,
            getFloatScore,
            getXpProgress,
        };
        if (window.isDev) console.log("⚡ helper functions attached to window");
    }

    let debugSamples = 0;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", exposeHelpers);
    } else {
        exposeHelpers(); // DOM already ready
    }

    function calculateScore(hero, event) {
        if (event.strength < 1000) {
            if (window.isDev && debugSamples < debugLimitSamples) {
                console.log(`⚠️ Skipping event due to low volume (strength: ${event.strength})`);
            }
            return 0; // Skip this event entirely
        }
    
        debugSamples++;
        const currentScore = Number(hero.score) || 0;
    
        // Logging initial state
        if (window.isDev && debugSamples < debugLimitSamples) console.log(`\n⚡⚡⚡ [${hero.hero}] SCORING BREAKDOWN ⚡⚡⚡`);
        if (window.isDev && debugSamples < debugLimitSamples) console.log(`📜 LV: ${hero.lv || 0} | Price: ${hero.price} | Score: ${currentScore.toFixed(2)} | HP: ${hero.hp || 0} | DP: ${hero.dp || 0}`);
        if (window.isDev && debugSamples < debugLimitSamples) console.log("━ ".repeat(25));
    
        let baseScore = 0;
    
        try {
            // If it's an "up" event (hp > 0)
            if (event.hp > 0 && isSurging(hero, { slice: 5, minUps: 2 })) {
                baseScore += event.hp * 10;
                if (window.isDev && debugSamples < debugLimitSamples) logStep("💖", "Base HP Added", baseScore);
    
                // 💪 Add bonus score per level (100 points per level) only if surging
    
                // 🧠 Evaluate surge once
                const surging = isSurging(hero);
    
                if (surging) {
                    // 💪 Base level boost
                    const level = hero.lv || 1;
                    const levelBoost = level * 100;
                    baseScore += levelBoost;
    
                    if (window.isDev && debugSamples < debugLimitSamples) {
                        logStep("⚡", `Surge Detected! Level Boost (LV ${level})`, levelBoost);
                    }
    
                    // 🧪 Rookie tier bonus (amplify surge for LV 1–3)
                    if (level <= 3) {
                        const tierBoostMultiplier = 1.5 - (level - 1) * 0.1;
                        const boostedScore = baseScore * tierBoostMultiplier;
    
                        if (window.isDev && debugSamples < debugLimitSamples) {
                            logStep("🧪", `Tier Surge Bonus (x${tierBoostMultiplier.toFixed(2)})`, boostedScore - baseScore);
                        }
    
                        baseScore = boostedScore;
                    }
                } else if (window.isDev && debugSamples < debugLimitSamples) {
                    logStep("💤", "No surge — Level Boost skipped", 0);
                }
    
                // Apply Float score
                // const floatBuff = getHeroBuff(hero, "float");
                // const floatScore = floatBuff?.score ?? 0;
                // baseScore += floatScore;
    
                // if (debug && debugSamples < debugLimitSamples) {
                //     const label = floatBuff?.key === "floatCorrupt" ? "🧨" : "🏷️";
                //     const formattedFloat = abbreviatedValues(hero.floatValue) || "N/A";
                //     logStep(label, `Float Score (${formattedFloat})`, floatScore);
                // }
    
                const volScore = computeVolumeScore(hero, event);
                baseScore += volScore;
                
                // Clamp total baseScore to positive only (no negative scoring on "up" events)
                baseScore = Math.max(0, baseScore);
            }
        } catch (err) {
            console.error(`⚠️ Scoring error for ${hero.hero}:`, err);
            baseScore = 0; // Reset on error
        }
    
        // Final log and result
        if (window.isDev && debugSamples < debugLimitSamples) console.log("━".repeat(50));
        if (window.isDev && debugSamples < debugLimitSamples) logStep("🎯", "TOTAL SCORE CHANGE", baseScore);
        if (window.isDev && debugSamples < debugLimitSamples) console.log(`🎼 FINAL SCORE → ${Math.max(0, currentScore + baseScore).toFixed(2)}\n\n\n`);
    
        return baseScore;
    }

    function computeVolumeScore(hero, event) {
        const price = hero.price || 1;
        const strength = event.strength || 0;
    
        // Skip weak trades
        if (strength < 1000) return 0;
    
        // Estimated dollar volume
        const dollarVolume = price * strength;
    
        // Estimate number of participants (assume avg trade = $1000)
        let score = dollarVolume / 1000;
    
        // Penalize penny stocks
        if (price < 2) {
            score *= 0.8; // 20% penalty
        }
    
        // Optional clamp for extreme events
        score = Math.min(score, 1000);
    
        // Optional: logging
        if (window.isDev && debugSamples < debugLimitSamples) {
            const displayVolume = abbreviatedValues(strength);
            const displayDollarVol = abbreviatedValues(dollarVolume);
            logStep("📊", `Volume Score (${displayVolume} @ $${price}) → $${displayDollarVol}`, score);
        }
    
        return score;
    }

    function isSurging(hero, { slice = 4, minUps = 3, direction = "hp" } = {}) {
        if (!hero?.history?.length) return false;
    
        const recent = hero.history.slice(-slice);
        const active = recent.filter((e) => e[direction] > 0);
    
        return active.length >= minUps;
    }

    function startScoreDecay() {
        let decayTickCount = 0;
        const DECAY_TICKS_BETWEEN_LOGS = 5; // Only log every 5 ticks to avoid spam
    
        console.log(`\n🌌🌠 STARTING SCORE DECAY SYSTEM 🌠🌌`);
        console.log(`⏱️  Decay Interval: ${DECAY_INTERVAL_MS}ms`);
        console.log(`📉 Base Decay/Tick: ${XP_DECAY_PER_TICK}`);
        console.log(`⚖️  Normalization Factor: ${SCORE_NORMALIZATION}\n`);
    
        setInterval(() => {
            decayTickCount++;
            let changed = false;
            let totalDecay = 0;
            let heroesDecayed = 0;
            const activeHeroes = [];
    
            Object.values(heroesState).forEach((hero) => {
                if (hero.score > 0) {
                    const originalScore = hero.score;
                    const scale = 1 + hero.score / SCORE_NORMALIZATION;
                    const cling = 0.2;
                    const taper = Math.max(cling, Math.min(1, hero.score / 10)); // Tapers when score < 10
                    const decayAmount = XP_DECAY_PER_TICK * scale * taper;
                    const newScore = Math.max(0, hero.score - decayAmount);
    
                    if (hero.score !== newScore) {
                        hero.score = newScore;
                        hero.lastEvent.hp = 0;
                        hero.lastEvent.dp = 0;
    
                        changed = true;
                        totalDecay += originalScore - newScore;
                        heroesDecayed++;
                        activeHeroes.push(hero);
                    }
                }
            });
    
            if (changed) {
                // Only show full details periodically
                if (decayTickCount % DECAY_TICKS_BETWEEN_LOGS === 0) {
                    console.log(`\n⏳ [DECAY TICK #${decayTickCount}]`);
                    console.log(`🌡️ ${heroesDecayed} heroes decaying | Total decay: ${totalDecay.toFixed(2)}`);
                    console.log("━".repeat(50));
    
                    // Show top 3 most affected heroes (or all if ≤3)
                    activeHeroes
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 3)
                        .forEach((hero) => {
                            const decayAmount = XP_DECAY_PER_TICK * (1 + hero.score / SCORE_NORMALIZATION);
                            console.log(`🧙 ${hero.hero.padEnd(15)}`);
                            console.log(`   📊 Score: ${hero.score.toFixed(2).padStart(8)} → ${(hero.score - decayAmount).toFixed(2)}`);
                            console.log(`   🔻 Decay: ${decayAmount.toFixed(2)} (scale: ${(1 + hero.score / SCORE_NORMALIZATION).toFixed(2)}x)`);
                            console.log("─".repeat(50));
                        });
                }
    
                renderAll();
                window.heroesStateManager.saveState();
            }
        }, DECAY_INTERVAL_MS);
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
        if (window.isDev && debugSamples < debugLimitSamples) {
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