(() => {
    function exposeStateManager() {
        window.heroesStateManager = {
            saveState,
            loadState,
            clearState,
            updateHeroData,
            nukeState,
            resetXpLevels,
        };
        if (window.isDev) console.log("⚡ heroesStateManager attached to window");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", exposeStateManager);
    } else {
        exposeStateManager(); // DOM already ready
    }

    // Returns YYYY-MM-DD string in EST
    function getMarketDateString() {
        const now = new Date();
        const offset = -5 * 60; // EST offset in minutes
        const localOffset = now.getTimezoneOffset();
        const estDate = new Date(now.getTime() + (localOffset - offset) * 60000);
        return estDate.toISOString().split("T")[0];
    }

    function saveState() {
        const existing = localStorage.getItem("heroesState");
        let sessionDate = getMarketDateString();
    
        if (existing) {
            try {
                const parsed = JSON.parse(existing);
                if (parsed.date && parsed.date !== sessionDate) {
                    if (window.isDev) console.log("🧼 Overwriting old session from", parsed.date);
                } else {
                    sessionDate = parsed.date || sessionDate;
                }
            } catch {
                console.warn("⚠️ Invalid existing heroes state. Overwriting.");
            }
        }
    
        const payload = {
            date: sessionDate,
            state: heroesState,
        };
    
        localStorage.setItem("heroesState", JSON.stringify(payload));
    }
    

    async function loadState() {
        if (window.isDev) {
            console.log("🧪 loadState() overridden for testing — skipping restore");
            return false;
        }
    
        const saved = localStorage.getItem("heroesState");
        if (!saved) return false;
    
        try {
            const parsed = JSON.parse(saved);
            const today = getMarketDateString();
    
            if (parsed.date === today) {
                if (window.isDev) console.log("🔄 Restored heroes state from earlier session.");
                return parsed.state;
            } else {
                if (window.isDev) console.log("🧼 Session from previous day. Skipping restore.");
                localStorage.removeItem("heroesState");
                return false;
            }
        } catch (err) {
            console.warn("⚠️ Could not parse heroes state. Clearing.");
            localStorage.removeItem("heroesState");
            return false;
        }
    }

    function clearState() {
        localStorage.removeItem("heroesState");
        for (const key in heroesState) {
            delete heroesState[key];
        }
        if (window.isDev) console.log("🧹 Cleared saved and in-memory heroes state.");
    }
    

    function updateHeroData(updatedHeroes) {
        updatedHeroes.forEach((u) => {
            const hero = heroesState[u.hero];
            if (!hero) return;
    
            hero.buffs = u.buffs || hero.buffs;
            hero.highestPrice = Math.max(hero.highestPrice || 0, u.highestPrice || 0);
            hero.lastEvent = u.lastEvent || hero.lastEvent;
            hero.xp = u.xp ?? hero.xp;
            hero.lv = u.lv ?? hero.lv;
            hero.totalXpGained = u.totalXpGained ?? hero.totalXpGained;
    
            if (window.isDev) console.log(`🎮 ${u.hero} XP → LV ${hero.lv}, XP ${hero.xp}, TOTAL ${hero.totalXpGained}`);
            updateCardDOM(hero.hero);
        });
    }

    function nukeState() {
        console.warn("🧨 Nuke signal received — clearing state.");
        window.heroesStateManager.clearState();
        location.reload();
    }

    function resetXpLevels() {
        console.log("🧼 XP Reset — resetting XP and LV");
        Object.values(heroesState).forEach((hero) => {
            hero.xp = 0;
            hero.lv = 1;
            updateCardDOM(hero.hero);
        });
        window.heroesStateManager.saveState();
    }
})();
