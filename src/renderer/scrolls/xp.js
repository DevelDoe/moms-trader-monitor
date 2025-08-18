const symbolColors = {};
const allHeroes = {}; // 💾 all heroes, unfiltered
const heroes = {}; // 🧹 filtered heroes based on settings
const { isDev } = window.appFlags;
const debug = isDev;

let trackedTickers = []; // 🧠 source of truth lives in the store; XP writes it
const up = (s) => String(s || "").toUpperCase();

let _lastKey = "";
let _renderKey = "";

function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

function getSymbolLength() {
    return Math.max(1, Number(window.settings?.top?.symbolLength) || 25);
}

// XP publishes (writes) to the store whenever its computed top changes
const publishTrackedTickers = debounce(async () => {
    const tracked = Object.values(heroes)
        .sort((a, b) => (b.lv !== a.lv ? b.lv - a.lv : b.xp - a.xp))
        .slice(0, getSymbolLength())
        .map((h) => up(h.hero));

    if (!tracked.length) return;

    const key = tracked.join(",");
    if (key === _lastKey) return; // no change since last publish
    _lastKey = key;

    window.scrollXpAPI?.publishTrackedTickers(tracked);
    try {
        await window.storeAPI.setTracked(tracked, getSymbolLength()); // ← write to store
    } catch (e) {
        console.warn("Failed to save tracked list to store:", e);
    }
}, 400);

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");
    if (!container) return;

    // 1) load settings (for filters/length), and store (for tracked list)
    window.settings = await window.settingsAPI.get();
    try {
        trackedTickers = (await window.storeAPI.getTracked()).map(up);
    } catch (e) {
        console.warn("tracked:get failed; starting empty:", e);
        trackedTickers = [];
    }

    // 2) load all symbols -> seed allHeroes
    const all = await window.storeAPI.getSymbols();
    all.forEach(({ symbol, xp, lv, price, totalXpGained, firstXpTimestamp }) => {
        allHeroes[symbol] = {
            hero: symbol,
            xp: Number(xp) || 0,
            lv: Number(lv) || 1,
            price: Number(price) || 0,
            totalXpGained: totalXpGained !== undefined ? Number(totalXpGained) : Number(xp) || 0,
            firstXpTimestamp: typeof firstXpTimestamp === "number" ? firstXpTimestamp : Date.now(),
            lastUpdate: Date.now(),
        };
    });

    filterHeroes();
    refreshList();
    publishTrackedTickers(); // seed/refresh store immediately from XP’s current view

    // 3) live hero updates
    window.storeAPI.onHeroUpdate((payload) => {
        const updates = Array.isArray(payload) ? payload : [payload]; // ← normalize

        updates.forEach(({ hero, xp, lv, price, totalXpGained, firstXpTimestamp }) => {
            if (!hero) return;

            if (!allHeroes[hero]) {
                allHeroes[hero] = {
                    hero,
                    xp: 0,
                    lv: 1,
                    price: 0,
                    totalXpGained: 0,
                    firstXpTimestamp: Date.now(),
                };
            }

            const h = allHeroes[hero];
            h.xp = Number.isFinite(xp) ? Number(xp) : 0;
            h.lv = Number.isFinite(lv) ? Number(lv) : 1;
            h.price = Number.isFinite(price) ? Number(price) : 0;
            h.totalXpGained = Number.isFinite(totalXpGained) ? Number(totalXpGained) : h.xp;
            h.firstXpTimestamp = typeof firstXpTimestamp === "number" ? firstXpTimestamp : h.firstXpTimestamp ?? Date.now();
            h.lastUpdate = Date.now();
        });

        filterHeroes();
        refreshList();
        publishTrackedTickers(); // (debounced) keep store in sync with XP-derived top
    });

    // 4) settings updates — DO NOT touch trackedTickers here
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        window.settings = updatedSettings;
        filterHeroes();
        refreshList();
        publishTrackedTickers();
    });

    // 5) react to store changes (if some other view/tools modifies it)
    window.storeAPI.onTrackedUpdate((list) => {
        trackedTickers = (list || []).map(up);
        refreshList(); // will use exact saved order
        // no publish here — store is already the source; avoid loops
    });

    // 6) XP reset
    window.electronAPI.onXpReset(() => {
        Object.values(allHeroes).forEach((h) => {
            h.xp = 0;
            h.lv = 1;
            h.totalXpGained = 0;
            h.firstXpTimestamp = Date.now();
            h.lastUpdate = Date.now();
        });

        filterHeroes();
        refreshList();
        publishTrackedTickers();
    });

    // --- render using tracked list when available ---
    function refreshList() {
        const inactiveThreshold = 30_000; // 30s
        const order = new Map(trackedTickers.map((s, i) => [s, i]));

        let viewList =
            order.size > 0
                ? Object.values(heroes)
                      .filter((h) => order.has(up(h.hero)))
                      .sort((a, b) => order.get(up(a.hero)) - order.get(up(b.hero)))
                      .slice(0, getSymbolLength())
                : Object.values(heroes)
                      .filter((h) => h.xp > 0)
                      .sort((a, b) => (b.lv !== a.lv ? b.lv - a.lv : b.xp - a.xp))
                      .slice(0, getSymbolLength());

        // fallback if tracked list exists but filters hide everything
        if (order.size > 0 && viewList.length === 0) {
            viewList = Object.values(heroes)
                .filter((h) => h.xp > 0)
                .sort((a, b) => (b.lv !== a.lv ? b.lv - a.lv : b.xp - a.xp))
                .slice(0, getSymbolLength());
        }

        // skip DOM work if lineup unchanged
        const key = viewList.map((h) => up(h.hero)).join(",");
        if (key === _renderKey) return;
        _renderKey = key;

        const now = Date.now();

        container.innerHTML = viewList
            .map((h, i) => {
                const bg = getSymbolColor(h.hero);
                const age = now - (h.lastUpdate || 0);
                const isInactive = age > inactiveThreshold;
                const dullStyle = isInactive ? "opacity: 0.4; filter: grayscale(0.8);" : "";

                return `
          <div class="xp-line ellipsis" style="${dullStyle}; color: gray;">
            <span class="text-tertiary" style="margin-right:6px; opacity:0.5; display:inline-block; width: 20px; text-align: right;">${i + 1}.</span>
            <strong class="symbol" style="background: ${bg};">
              ${h.hero} 
            </strong>
            <span style="font-weight: 600; color: ${getXpColorByRank(i, viewList.length)}; opacity: 0.85; margin-left: 4px; font-size: 1rem;">
              ${abbreviateXp(h.totalXpGained)}
            </span>
          </div>`;
            })
            .join("");

        // Click → copy + set active
        container.querySelectorAll(".symbol").forEach((el) => {
            el.addEventListener("click", (e) => {
                const hero = el.textContent.trim().split(" ")[0].replace("$", "");
                try {
                    navigator.clipboard.writeText(hero);
                    if (window.activeAPI?.setActiveTicker) window.activeAPI.setActiveTicker(hero);
                    el.classList.add("symbol-clicked");
                    setTimeout(() => el.classList.remove("symbol-clicked"), 200);
                } catch (err) {
                    console.error(`⚠️ Failed to handle click for ${hero}:`, err);
                }
                e.stopPropagation();
            });
        });
    }
});

// -------------------- helpers (unchanged) --------------------

function filterHeroes() {
    const { minPrice, realMaxPrice } = getPriceLimits();
    Object.keys(heroes).forEach((key) => delete heroes[key]); // Clear heroes
    for (const symbol in allHeroes) {
        const h = allHeroes[symbol];
        if (h.price >= minPrice && h.price <= realMaxPrice) {
            heroes[symbol] = h;
        }
    }
}

function getPriceLimits() {
    const min = Number(window.settings?.top?.minPrice) || 0;
    const max = Number(window.settings?.top?.maxPrice) || 0;
    const realMax = max > 0 ? max : Infinity;
    return { minPrice: min, realMaxPrice: realMax };
}

function getTotalXP(lv, xp) {
    let total = 0;
    for (let i = 1; i < lv; i++) total += i * 1000;
    return total + xp;
}

function getSymbolColor(symbol) {
    if (!symbolColors[symbol]) {
        const hash = [...symbol].reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const hue = (hash * 37) % 360;
        const saturation = 80;
        const lightness = 50;
        const alpha = 0.5;
        symbolColors[symbol] = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    }
    return symbolColors[symbol];
}

function formatPrice(price) {
    return typeof price === "number" ? `$${price.toFixed(2)}` : "—";
}

function abbreviateXp(num) {
    if (num < 100) return String(num);
    if (num < 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    if (num < 1_000_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    if (num < 1_000_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
}

function computeXpSegments(count) {
    let para = Math.max(1, Math.floor(count * 0.1));
    let high = Math.floor(count * 0.2);
    let med = Math.floor(count * 0.3);
    let used = para + high + med;
    if (used > count) {
        let over = used - count;
        const take = (n, min) => {
            const d = Math.min(over, Math.max(0, n - min));
            over -= d;
            return n - d;
        };
        med = take(med, 0);
        high = take(high, 0);
        para = take(para, 1);
    }
    const low = Math.max(0, count - (para + high + med));
    return { para, high, med, low };
}

function getXpStageByRank(index, count) {
    if (count <= 0) return "lowVol";
    const { para, high, med } = computeXpSegments(count);
    if (index < para) return "parabolicVol";
    if (index < para + high) return "highVol";
    if (index < para + high + med) return "mediumVol";
    return "lowVol";
}

function getXpColorByRank(index, count) {
    const stage = getXpStageByRank(index, count);
    const getColorForStage = window.hlpsFunctions?.getColorForStage || ((key) => ({ lowVol: "#ccc", mediumVol: "#00aeff", highVol: "#263cff", parabolicVol: "#e25822" }[key] || "#ccc"));
    return getColorForStage(stage);
}
