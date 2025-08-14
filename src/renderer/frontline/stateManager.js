(() => {
    function exposeStateManager() {
        window.frontlineStateManager = {
            // saveState,
            // loadState,
            // clearState,
            updateHeroData,
            handleNuke,
            resetXpLevels,
        };
        if (window.isDev) console.log("⚡ frontlineStateManager attached to window");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", exposeStateManager);
    } else {
        exposeStateManager(); // DOM already ready
    }

    /**
     * The `getMarketDateString()` function returns the current date in "YYYY-MM-DD" format in the Eastern
     * Standard Time (EST) timezone.
     * @returns The `getMarketDateString()` function returns a string in the format "YYYY-MM-DD"
     * representing the current date in the Eastern Standard Time (EST) timezone.
     */
    // // Returns YYYY-MM-DD string in EST
    // function /* The `getMarketDateString()` function is used to get the current date in the format
    // "YYYY-MM-DD" in the Eastern Standard Time (EST) timezone. */
    // getMarketDateString() {
    //     const now = new Date();
    //     const offset = -5 * 60; // EST offset in minutes
    //     const localOffset = now.getTimezoneOffset();
    //     const estDate = new Date(now.getTime() + (localOffset - offset) * 60000);
    //     return estDate.toISOString().split("T")[0];
    // }

    // function saveState() {
    //     const existing = localStorage.getItem("frontlineState");
    //     let sessionDate = getMarketDateString();

    //     if (existing) {
    //         try {
    //             const parsed = JSON.parse(existing);
    //             if (parsed.date && parsed.date !== sessionDate) {
    //                 if (window.isDev) console.log("🧼 Overwriting old session from", parsed.date);
    //             } else {
    //                 sessionDate = parsed.date || sessionDate;
    //             }
    //         } catch {
    //             console.warn("⚠️ Invalid existing frontline state. Overwriting.");
    //         }
    //     }

    //     const payload = {
    //         date: sessionDate,
    //         state: frontlineState,
    //     };

    //     localStorage.setItem("frontlineState", JSON.stringify(payload));
    // }

    // async function loadState() {
    //     if (window.isDev) {
    //         console.log("🧪 loadState() overridden for testing — skipping restore");
    //         return null;
    //     }

    //     const saved = localStorage.getItem("frontlineState");
    //     if (!saved) return null;

    //     try {
    //         const parsed = JSON.parse(saved);
    //         const today = getMarketDateString();

    //         if (parsed.date === today) {
    //             if (window.isDev) console.log("🔄 Restored frontline state from earlier session.");
    //             return parsed.state || null;
    //         } else {
    //             if (window.isDev) console.log("🧼 Session from previous day. Skipping restore.");
    //             localStorage.removeItem("frontlineState");
    //             return null;
    //         }
    //     } catch (err) {
    //         console.warn("⚠️ Could not parse frontline state. Clearing.");
    //         localStorage.removeItem("frontlineState");
    //         return null;
    //     }
    // }

    // function clearState() {
    //     localStorage.removeItem("frontlineState");
    //     for (const key in frontlineState) {
    //         delete frontlineState[key];
    //     }
    //     if (window.isDev) console.log("🧹 Cleared saved and in-memory frontline state.");
    // }

    function updateHeroData(updated) {
        const hero = frontlineState[updated.hero];
        if (!hero) return;

        hero.buffs = updated.buffs ?? hero.buffs;
        hero.highestPrice = Math.max(hero.highestPrice || 0, updated.highestPrice || 0);
        hero.lastEvent = updated.lastEvent ?? hero.lastEvent;
        hero.xp = updated.xp ?? hero.xp;
        hero.lv = updated.lv ?? hero.lv;
        hero.price = updated.price ?? hero.price;

        updateCardDOM(updated.hero);
    }

    async function handleNuke() {
        console.warn("🧨 Nuke signal received — clearing local state.");
        window.frontlineStateManager.clearState();

        try {
            const fetchedBuffs = await window.electronAPI.getBuffs();
            window.buffs = fetchedBuffs;
            console.log("🔄 Buffs reloaded after nuke:", fetchedBuffs.length);
        } catch (err) {
            console.error("⚠️ Failed to reload buffs after nuke:", err);
        }

        location.reload();
    }

    function resetXpLevels() {
        console.log("🧼 XP Reset received — resetting XP and LV in frontline");

        Object.values(frontlineState).forEach((hero) => {
            hero.xp = 0;
            hero.lv = 1;
            updateCardDOM(hero.hero);
        });

        window.frontlineStateManager.saveState();
    }
})();
