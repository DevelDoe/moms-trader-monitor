(() => {
    // ---------- Safe accessors / shims ----------
    const getState = () => (window.heroesState ??= {}); // ensure global bag
    const log = (...a) => (window.isDev ? console.log("[heroesMgr]", ...a) : void 0);

    // Call the card renderer if present, otherwise broadcast an event
    const renderSymbol = (sym) => {
        if (!sym) return;
        if (typeof window.updateCardDOM === "function") {
            try {
                window.updateCardDOM(sym);
            } catch (e) {
                console.warn("updateCardDOM failed:", e);
            }
        } else {
            document.dispatchEvent(new CustomEvent("heroes:update-card", { detail: { symbol: sym } }));
        }
    };

    // Optional global for old code that expects it
    // Debug sample counter (optional logging guard)
    window.debugSamples ??= 0;
    window.debugLimitSamples ??= 1500;

    // ---------- Public API ----------
    function exposeStateManager() {
        window.heroesStateManager = {
            updateHeroData,
            nukeState,
            resetXpLevels,
            // saveState, loadState, clearState, // keep commented if you’re not using them
        };
        log("heroesStateManager attached to window");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", exposeStateManager);
    } else {
        exposeStateManager(); // DOM already ready
    }

    // ---------- Helpers ----------
    function getMarketDateString() {
        const now = new Date();
        const estOffsetMin = -5 * 60; // EST
        const localOffsetMin = now.getTimezoneOffset();
        const est = new Date(now.getTime() + (localOffsetMin - estOffsetMin) * 60000);
        return est.toISOString().split("T")[0];
    }

    // ---------- API methods ----------
    function updateHeroData(payload) {
        const items = Array.isArray(payload) ? payload : [payload];
        const state = getState();

        for (const u of items) {
            const sym = String(u?.hero || "").toUpperCase();
            if (!sym) continue;

            // ensure hero exists (don’t crash if view hasn’t seeded it)
            const h =
                state[sym] ??
                (state[sym] = {
                    hero: sym,
                    price: 1,
                    hue: 0,
                    hp: 0,
                    dp: 0,
                    score: 0,
                    xp: 0,
                    lv: 1,
                    totalXpGained: 0,
                    lastEvent: { hp: 0, dp: 0 },
                    strength: 0,
                    floatValue: 0,
                    buffs: {},
                    highestPrice: 1,
                    lastUpdate: 0,
                });

            // Use nullish coalescing so 0/false don’t get clobbered
            if (u.buffs && typeof u.buffs === "object") h.buffs = u.buffs;
            h.highestPrice = Math.max(h.highestPrice ?? 0, u.highestPrice ?? 0);
            h.lastEvent = u.lastEvent ?? h.lastEvent;
            h.xp = u.xp ?? h.xp;
            h.lv = u.lv ?? h.lv;
            h.totalXpGained = u.totalXpGained ?? h.totalXpGained;
            h.price = u.price ?? h.price;
            if (u.hue != null) h.hue = u.hue;

            h.lastUpdate = Date.now();

            if (window.isDev) {
                log(`update ${sym} → LV ${h.lv}, XP ${h.xp}, TOTAL ${h.totalXpGained}`);
            }

            renderSymbol(sym);
        }
    }

    function nukeState() {
        console.warn("🧨 Nuke signal — clearing heroes state.");
        const state = getState();
        // keep object identity for consumers holding window.heroesState
        for (const k of Object.keys(state)) delete state[k];

        // If your view exposes a full re-render, trigger it
        if (typeof window.renderAll === "function") {
            try {
                window.renderAll();
            } catch {}
        } else {
            // otherwise tell listeners to refresh everything
            document.dispatchEvent(new CustomEvent("heroes:refresh"));
        }
    }

    function resetXpLevels() {
        log("XP reset → set LV=1, XP=0");
        const state = getState();
        for (const h of Object.values(state)) {
            h.xp = 0;
            h.lv = 1;
            renderSymbol(h.hero);
        }
    }

    // ---------- (Optional) persistence stubs ----------
    // Keeping your originals here, commented, so you can toggle on later.

    // function saveState() {
    //   const state = getState();
    //   const existing = localStorage.getItem("heroesState");
    //   let sessionDate = getMarketDateString();
    //   if (existing) {
    //     try {
    //       const parsed = JSON.parse(existing);
    //       if (parsed.date && parsed.date !== sessionDate) {
    //         if (window.isDev) log("Overwriting old session from", parsed.date);
    //       } else {
    //         sessionDate = parsed.date || sessionDate;
    //       }
    //     } catch {}
    //   }
    //   localStorage.setItem("heroesState", JSON.stringify({ date: sessionDate, state }));
    // }

    // async function loadState() {
    //   if (window.isDev) { log("loadState skipped in dev"); return false; }
    //   const saved = localStorage.getItem("heroesState");
    //   if (!saved) return false;
    //   try {
    //     const parsed = JSON.parse(saved);
    //     if (parsed.date === getMarketDateString()) return parsed.state;
    //     localStorage.removeItem("heroesState"); return false;
    //   } catch { localStorage.removeItem("heroesState"); return false; }
    // }

    // function clearState() {
    //   localStorage.removeItem("heroesState");
    //   const state = getState();
    //   for (const k of Object.keys(state)) delete state[k];
    //   log("Cleared saved + in-memory heroes state.");
    // }
})();
