// frontline.refactor.js
(() => {
    /**************************************************************************
     * 0) Config
     **************************************************************************/
    const DECAY_INTERVAL_MS = 1000;
    const XP_DECAY_PER_TICK = 0.1;
    const SCORE_NORMALIZATION = 2;
    const BASE_MAX_SCORE = 3000;
    const BASE_MAX_HP = 10;
    const SCALE_DOWN_THRESHOLD = 1; // 100% of current scale
    const SCALE_DOWN_FACTOR = 0.9; // shrink by 10%

    // dev flag (keeps your behavior)
    window.isDev = window.appFlags?.isDev === true;

    /**************************************************************************
     * 1) Module state (single source of truth)
     **************************************************************************/
    const state = {
        // symbol -> hero object
        heroes: Object.create(null),

        // visual scale bounds
        maxHP: BASE_MAX_HP,
        maxScore: BASE_MAX_SCORE,

        // rendering
        container: null,
        rafPending: false,
        renderKey: "", // 🔑 skip redundant renders
        topKey: "", // compare top lineup to avoid reshuffle work

        // settings + buffs
        settings: {},
        buffs: [],

        // medals/top3
        rankMap: new Map(),
        trophyMap: new Map(),
    };

    /**************************************************************************
     * 2) Helpers exposed (unchanged behavior)
     **************************************************************************/
    const logScoring = window.appFlags?.isDev || false;
    let debugSamples = 0,
        debugLimitSamples = 5;

    function abbreviatedValues(num) {
        if (num < 1_000) return String(num);
        if (num < 1_000_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
        return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    }
    function getSymbolColor(hue) {
        return `hsla(${hue}, 80%, 50%, 0.5)`;
    }

    function computeVolumeScore(hero, event) {
        const price = hero.price || 1;
        const strength = event.one_min_volume || 0;
        if (strength < 100) return 0;
        const dollarVolume = price * strength;
        let score = Math.log10(dollarVolume + 1) * 100;
        if (price < 2) score *= 0.8;
        if (price > 12) score *= 0.9;
        if (price > 20) score *= 0.8;
        return score;
    }

    function calculateScore(hero, event) {
        debugSamples++;
        const currentScore = Number(hero.score) || 0;
        const shouldLog = logScoring && debugSamples <= debugLimitSamples;

        let baseScore = 0;
        const logStep = (emoji, msg, value) => {
            if (!shouldLog) return;
            console.log(`${emoji} ${msg.padEnd(28)} ${(Number(value) || 0).toFixed(2)}`);
        };

        try {
            if (event.hp > 0) {
                baseScore += event.hp * 10;
                logStep("💖", "Base HP Added", baseScore);
                const volScore = computeVolumeScore(hero, event);
                baseScore += volScore;
                logStep("📢", "Crowd Participation", volScore);
            } else if (event.dp > 0) {
                const reverseScore = event.dp * 5;
                baseScore -= reverseScore;
                logStep("💔", "Down Pressure", -reverseScore);
                const volPenalty = computeVolumeScore(hero, event) * 0.5;
                baseScore -= volPenalty;
                logStep("🔻", "Volume Selloff", -volPenalty);
            }
        } catch (err) {
            console.error(`⚠️ Scoring error for ${hero.hero}:`, err);
            baseScore = 0;
        }

        if (shouldLog) {
            console.log("━".repeat(44));
            logStep("🎯", "TOTAL SCORE Δ", baseScore);
            console.log(`🎼 FINAL SCORE → ${Math.max(0, currentScore + baseScore).toFixed(2)}\n`);
        }
        return baseScore;
    }

    // expose — keeps your other code working
    function exposeHelpers() {
        window.helpers = {
            calculateScore,
            computeVolumeScore,
            abbreviatedValues,
            getSymbolColor,
        };
        if (window.appFlags?.isDev) console.log("⚡ helpers attached");
    }

    // --- One-line buffs (frontline style) ---
    const BUFF_SORT_ORDER = ["volume", "float", "news", "bio", "weed", "space", "newHigh", "bounceBack", "highShort", "netLoss", "hasS3", "dilutionRisk", "china", "lockedShares"];

    function categorizeBuffKey(key) {
        const k = String(key || "").toLowerCase();
        if (k.includes("vol")) return "volume";
        if (k.startsWith("float")) return "float";
        return k;
    }

    function sortBuffsInline(arr) {
        return arr.sort((a, b) => {
            const ai = BUFF_SORT_ORDER.indexOf(a._sortKey);
            const bi = BUFF_SORT_ORDER.indexOf(b._sortKey);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
    }

    function buildBuffInlineHTML(hero) {
        const entries = Object.entries(hero?.buffs || {}).map(([key, v]) => ({
            ...(v || {}),
            key,
            _sortKey: categorizeBuffKey(key),
        }));

        const sorted = sortBuffsInline(entries);
        if (!sorted.length) return ""; // keep container empty ≈ previous behavior

        return sorted.map((b) => `<span class="buff-icon ${b.isBuff ? "buff-positive" : b.isBuff === false ? "buff-negative" : ""}" title="${b.desc || ""}">${b.icon || "•"}</span>`).join("");
    }

    function volumeColorFromImpact(hero) {
        try {
            const impact = window.hlpsFunctions?.calculateImpact?.(
                hero.strength || 0,
                hero.price || 0,
                window.buffs // keep using your global buffs source
            );
            return impact?.style?.color || "";
        } catch {
            return "";
        }
    }

    /**************************************************************************
     * 3) Render scheduling pattern
     **************************************************************************/
    function markDirty() {
        if (state.rafPending) return;
        state.rafPending = true;
        requestAnimationFrame(() => {
            state.rafPending = false;
            render();
        });
    }

    function medalForRank(rank) {
        if (rank === 1) return "🥇";
        if (rank === 2) return "🥈";
        if (rank === 3) return "🥉";
        return "";
    }

    function getSymbolMedal(sym) {
        const trophy = state.trophyMap.get(sym) || '';
        const medal = medalForRank(state.rankMap.get(sym) || 0);
        
        if (trophy && medal) {
            return `<span class="trophy">${trophy}</span><span class="medal">${medal}</span>`;
        } else if (trophy) {
            return `<span class="trophy">${trophy}</span>`;
        } else if (medal) {
            return `<span class="medal">${medal}</span>`;
        }
        return '';
    }

    // cheap per-card patch (kept minimal here — keep your existing visuals if needed)
    function patchCardDOM(sym, hero) {
        const card = state.container.querySelector(`.ticker-card[data-symbol="${sym}"]`);
        if (!card) return;
        const scoreFill = card.querySelector(".bar-fill.score");
        if (scoreFill) {
            const exponent = 0.75;
            const normalized = Math.min(hero.score / state.maxScore, 1);
            scoreFill.style.width = `${Math.pow(normalized, exponent) * 100}%`;
        }
        const volEl = card.querySelector(".bar-text");
        if (volEl) {
            volEl.textContent = abbreviatedValues(hero.strength || 0);
        }
        const priceEl = card.querySelector(".lv-price");
        if (priceEl) priceEl.textContent = `$${(hero.price ?? 0).toFixed(2)}`;

        const medalEl = card.querySelector(".lv-medal");
        if (medalEl) {
            medalEl.innerHTML = getSymbolMedal(sym);
        }

        // flash on update
        card.classList.add("card-update-highlight");
        setTimeout(() => card.classList.remove("card-update-highlight"), 220);

        const buffsEl = card.querySelector(".buffs-container");
        if (buffsEl) buffsEl.innerHTML = buildBuffInlineHTML(hero);
    }

    function createCard(hero) {
        const sym = hero.hero;
        const card = document.createElement("div");
        card.className = "ticker-card";
        card.dataset.symbol = sym;

        // const changeText = hero.lastEvent?.hp ? `+${hero.lastEvent.hp.toFixed(2)}%` : hero.lastEvent?.dp ? `-${hero.lastEvent.dp.toFixed(2)}%` : "";

        card.innerHTML = `
        <div class="ticker-header">
            <div class="ticker-symbol" style="background-color:${getSymbolColor(hero.hue || 0)}">
            ${sym}
            <span class="lv">
                <span class="lv-medal">${getSymbolMedal(sym)}</span>
                <span class="lv-price">$${(hero.price ?? 0).toFixed(2)}</span>
            </span>
            </div>
            <div class="ticker-info">
            <div class="ticker-data">
                <span class="bar-text" style="color:${volumeColorFromImpact(hero)}">
                ${abbreviatedValues(hero.strength || 0)}
                </span>
                <div class="buffs-container">${buildBuffInlineHTML(hero)}</div>
            </div>
            <div class="bars">
                <div class="bar"><div class="bar-fill score" style="width:0%"></div></div>
            </div>
            </div>
        </div>`;


        const symEl = card.querySelector(".ticker-symbol");
        symEl.onclick = (e) => {
            e.stopPropagation();
            try {
                navigator.clipboard.writeText(sym);
                window.activeAPI?.setActiveTicker?.(sym);
                symEl.classList.add("symbol-clicked");
                setTimeout(() => symEl.classList.remove("symbol-clicked"), 200);
            } catch {}
        };

        return card;
    }

    function render() {
        if (!state.container) return;

        const topN = state.settings?.top?.frontlineListLength ?? 8;

        // compute the top, deterministically
        const heroesArr = Object.values(state.heroes);
        const top = heroesArr
            .filter((h) => (h.score || 0) > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topN);

        // 🔑 key that represents what's on screen; rounded score keeps stability
        const key = top.map((h) => `${h.hero}:${Math.round(h.score)}`).join(",");

        if (key === state.renderKey) {
            // nothing meaningfully changed → cheap per-card patches only
            top.forEach((h) => patchCardDOM(h.hero, h));
            return;
        }
        state.renderKey = key;

        // reconcile cards
        const need = new Set(top.map((h) => h.hero));
        // remove stale
        state.container.querySelectorAll(".ticker-card").forEach((node) => {
            const sym = node.dataset.symbol?.toUpperCase() || "";
            if (!need.has(sym)) node.remove();
        });

        // insert/update in correct order
        top.forEach((h, i) => {
            const sym = h.hero;
            let card = state.container.querySelector(`.ticker-card[data-symbol="${sym}"]`);
            if (!card) {
                card = createCard(h);
                state.container.insertBefore(card, state.container.children[i] || null);
            } else if (state.container.children[i] !== card) {
                state.container.insertBefore(card, state.container.children[i] || null);
            }
            patchCardDOM(sym, h);
        });
    }

    /**************************************************************************
     * 4) Score decay — now uses markDirty instead of direct render calls
     **************************************************************************/
    function startScoreDecay() {
        setInterval(() => {
            let changed = false;
            Object.values(state.heroes).forEach((hero) => {
                const prev = hero.score || 0;
                if (prev <= 0) return;
                const scale = 1 + prev / SCORE_NORMALIZATION;
                const dec = XP_DECAY_PER_TICK * scale;
                const next = Math.max(0, prev - dec);
                if (next !== prev) {
                    hero.score = next;
                    hero.lastEvent = hero.lastEvent || {};
                    hero.lastEvent.hp = 0;
                    hero.lastEvent.dp = 0;
                    changed = true;
                }
            });
            if (changed) markDirty();
        }, DECAY_INTERVAL_MS);
    }

    /**************************************************************************
     * 5) Event handling → state updates → markDirty()
     **************************************************************************/
    function handleAlert(event) {
        const minPrice = state.settings?.top?.minPrice ?? 0;
        const maxPrice = state.settings?.top?.maxPrice > 0 ? state.settings.top.maxPrice : Infinity;

        if (!event?.hero) return;
        if (event.one_min_volume < 5000) return;
        if (event.price < minPrice || event.price > maxPrice) return;

        const sym = String(event.hero).toUpperCase();
        const h =
            state.heroes[sym] ||
            (state.heroes[sym] = {
                hero: sym,
                price: event.price || 1,
                hue: event.hue ?? 0,
                hp: 0,
                dp: 0,
                strength: event.one_min_volume || 0,
                xp: 0,
                lv: 0,
                score: 0,
                lastEvent: { hp: 0, dp: 0, score: 0 },
                buffs: event.buffs || {},
                highestPrice: event.price || 1,
                lastUpdate: 0,
            });

        // update baseline fields
        h.price = event.price ?? h.price;
        h.hue = event.hue ?? h.hue;
        h.strength = event.one_min_volume ?? h.strength;
        if (event.buffs && Object.keys(event.buffs).length) h.buffs = event.buffs;

        // HP/DP
        if (event.hp > 0) h.hp += event.hp;
        else if (event.dp > 0) h.hp = Math.max(h.hp - event.dp, 0);

        // score delta
        const delta = calculateScore(h, event);
        h.score = Math.max(0, (h.score || 0) + delta);
        h.lastEvent = { hp: event.hp || 0, dp: event.dp || 0, score: delta };
        h.lastUpdate = Date.now();

        // adapt scales
        let scaleChanged = false;
        if (h.hp > state.maxHP) {
            state.maxHP = h.hp * 1.05;
            scaleChanged = true;
        }
        if (h.score > state.maxScore) {
            state.maxScore = h.score * 1.05;
            scaleChanged = true;
        }

        // shrink scales if everything is below threshold
        const topN = state.settings?.top?.frontlineListLength ?? 8;
        const top = Object.values(state.heroes)
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topN);
        const allBelowHP = top.length && top.every((x) => x.hp < state.maxHP * SCALE_DOWN_THRESHOLD);
        const allBelowScore = top.length && top.every((x) => x.score < state.maxScore * SCALE_DOWN_THRESHOLD);

        if (allBelowHP && state.maxHP > BASE_MAX_HP) {
            state.maxHP = Math.max(BASE_MAX_HP, state.maxHP * SCALE_DOWN_FACTOR);
            scaleChanged = true;
        }
        if (allBelowScore && state.maxScore > BASE_MAX_SCORE) {
            state.maxScore = Math.max(BASE_MAX_SCORE, state.maxScore * SCALE_DOWN_FACTOR);
            scaleChanged = true;
        }

        // request a redraw (renderKey will skip if nothing visible changed)
        markDirty();
    }

    // ============================
    // Alert Event Listener
    // ============================
    
    // TEST: Check if the API is available
    console.log("🔍 [FRONTLINE] Checking if eventsAPI is available:", {
        hasEventsAPI: !!window.eventsAPI,
        hasOnAlert: !!(window.eventsAPI?.onAlert),
        eventsAPIType: typeof window.eventsAPI,
        onAlertType: typeof window.eventsAPI?.onAlert
    });
    
    if (!window.eventsAPI || !window.eventsAPI.onAlert) {
        console.error("❌ [FRONTLINE] eventsAPI.onAlert is NOT available! This is why alerts aren't working!");
        return;
    }
    
    console.log("✅ [FRONTLINE] eventsAPI.onAlert is available, setting up listener...");
    
    window.eventsAPI.onAlert(handleAlert);

    /**************************************************************************
     * 6) Top3 subscription (kept same contract, but lighter)
     **************************************************************************/
    let __top3Unsub = null;
    async function initTop3() {
        try {
            const { entries } = await window.top3API.get();
            state.rankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.rank) || 0]));
        } catch {}

        __top3Unsub = window.top3API.subscribe?.(({ entries }) => {
            state.rankMap = new Map((entries || []).map((e) => [String(e.symbol || "").toUpperCase(), Number(e.rank) || 0]));
            // medals updated next render; optionally patch visible cards:
            state.container?.querySelectorAll(".ticker-card").forEach((card) => {
                const sym = card.dataset.symbol?.toUpperCase();
                const medalEl = card.querySelector(".lv-medal");
                if (sym && medalEl) {
                    medalEl.innerHTML = getSymbolMedal(sym);
                }
            });
        });
    }
    window.addEventListener("beforeunload", () => {
        if (__top3Unsub) __top3Unsub();
    });

    /**************************************************************************
     * 7) Boot
     **************************************************************************/
    async function boot() {
        // DOM
        state.container = document.getElementById("frontline");
        if (!state.container) return;

        // settings & buffs
        try {
            state.settings = await window.settingsAPI.get();
        } catch {}
        try {
            state.buffs = await window.electronAPI.getBuffs();
            window.buffs = state.buffs; // keep legacy path alive for calculateImpact()
        } catch {}
        
        window.electronAPI.onBuffsUpdate?.((b) => {
            state.buffs = b || [];
            window.buffs = state.buffs; // keep OG compatibility
            markDirty();
        });

        // listeners
        window.settingsAPI.onUpdate((s) => {
            state.settings = s || {};
            markDirty();
        });
        window.electronAPI.onBuffsUpdate?.((b) => {
            state.buffs = b || [];
            markDirty();
        });

        // alerts + hero updates + nukes
        window.storeAPI.onHeroUpdate((payload) => {
            const items = Array.isArray(payload) ? payload : [payload];
            items.forEach(({ hero, price, one_min_volume, buffs }) => {
                if (!hero) return;
                const sym = String(hero).toUpperCase();
                const h = state.heroes[sym] || (state.heroes[sym] = { hero: sym, price: 1, hp: 0, dp: 0, strength: 0, xp: 0, lv: 0, score: 0, lastEvent: {}, buffs: {}, lastUpdate: 0 });
                if (Number.isFinite(price)) h.price = price;
                if (Number.isFinite(one_min_volume)) h.strength = one_min_volume;
                if (buffs) h.buffs = buffs;
                h.lastUpdate = Date.now();
            });
            markDirty();
        });
        window.electronAPI.onNukeState?.(() => {
            Object.keys(state.heroes).forEach((k) => delete state.heroes[k]);
            state.renderKey = "";
            state.container.innerHTML = "";
            markDirty();
        });

        // top3 medals
        await initTop3();

        // Initialize trophy data from the store
        try {
            const trophyData = await window.storeAPI.getTrophyData();
            state.trophyMap = new Map(trophyData.map((t) => [t.symbol.toUpperCase(), t.trophy]));
            console.log("🏆 [FRONTLINE] Initial trophy data loaded:", state.trophyMap);
        } catch (error) {
            console.error("❌ [FRONTLINE] Failed to load initial trophy data:", error);
        }

        // Subscribe to trophy updates
        window.storeAPI.onTrophyUpdate?.((trophyData) => {
            console.log("🏆 [FRONTLINE] Trophy update received:", trophyData);
            state.trophyMap = new Map(trophyData.map((t) => [t.symbol.toUpperCase(), t.trophy]));
            
            // Update visible cards with new trophies
            state.container?.querySelectorAll(".ticker-card").forEach((card) => {
                const sym = card.dataset.symbol?.toUpperCase();
                const medalEl = card.querySelector(".lv-medal");
                if (sym && medalEl) {
                    medalEl.innerHTML = getSymbolMedal(sym);
                }
            });
        });

        // decay
        startScoreDecay();

        // first paint
        markDirty();
    }

    /**************************************************************************
     * 8) Wire helpers & DOM ready
     **************************************************************************/
    function safeExpose() {
        exposeHelpers();
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            safeExpose();
            boot().catch((e) => console.error("frontline boot failed:", e));
        });
    } else {
        safeExpose();
        boot().catch((e) => console.error("frontline boot failed:", e));
    }
})();
