const symbolColors = {};
const allHeroes = {}; // 💾 all heroes, unfiltered
const heroes = {}; // 🧹 filtered heroes based on settings
const { isDev } = window.appFlags;
const debug = isDev;
const symbolLength = 13;

// --- add this helper (renderer only) ---
let _lastKey = "";
function publishIfChanged(list) {
    const key = list.join(",");
    if (key === _lastKey) return; // no change
    _lastKey = key;
    window.scrollXpAPI?.publishTrackedTickers(list);
}

// (keep your debounce + call sites as-is)
const publishTrackedTickers = debounce(() => {
    const tracked = Object.values(heroes)
        .sort((a, b) => (b.lv !== a.lv ? b.lv - a.lv : b.xp - a.xp))
        .slice(0, symbolLength)
        .map((h) => String(h.hero).toUpperCase());

    if (tracked.length) publishIfChanged(Array.from(new Set(tracked)));
}, 400);

function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");

    window.settings = await window.settingsAPI.get();
    const all = await window.storeAPI.getSymbols();

    function refreshList() {
        const now = Date.now();
        const inactiveThreshold = 30_000; // 30 seconds

        const sorted = Object.values(heroes)
            .filter((h) => h.xp > 0)
            .sort((a, b) => {
                if (b.lv !== a.lv) return b.lv - a.lv;
                return b.xp - a.xp;
            })
            .slice(0, symbolLength);

        container.innerHTML = sorted
            .map((h, i) => {
                const bg = getSymbolColor(h.hero);
                const age = now - (h.lastUpdate || 0);
                const isInactive = age > inactiveThreshold;
                const dullStyle = isInactive ? "opacity: 0.4; filter: grayscale(0.8);" : "";

                return `
            <div class="xp-line ellipsis" style="${dullStyle}; color: gray;">
                <span class="text-tertiary" style="margin-right:6px; opacity:0.5; display:inline-block; width: 20px; text-align: right;">${i + 1}.</span>
                <strong class="symbol" style="background: ${bg};">
                    ${h.hero} <span class="lv">${formatPrice(h.price)}</span>
                </strong>
                <span style="font-weight: 600; color: ${getXpColorByRank(i, sorted.length)}; opacity: 0.85; margin-left: 4px; font-size: 1.3rem;">
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

    // 1. Insert all heroes
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

    filterHeroes(); // 🎯 create filtered heroes based on settings
    refreshList();
    publishTrackedTickers();

    // 2. Hero updates
    window.storeAPI.onHeroUpdate((updatedHeroes) => {
        updatedHeroes.forEach(({ hero, xp, lv, price, totalXpGained, firstXpTimestamp }) => {
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
            h.xp = Number(xp) || 0;
            h.lv = Number(lv) || 1;
            h.price = price !== undefined ? Number(price) : 0;
            h.totalXpGained = totalXpGained !== undefined ? Number(totalXpGained) : h.xp;
            h.firstXpTimestamp = typeof firstXpTimestamp === "number" ? firstXpTimestamp : Date.now();
            h.lastUpdate = Date.now();
        });

        filterHeroes();
        refreshList();
        publishTrackedTickers();
    });

    // 3. Settings updates
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        if (debug) console.log("🎯 Settings updated:", updatedSettings);
        window.settings = updatedSettings;
        filterHeroes();
        refreshList();
        publishTrackedTickers();
    });

    // 4. XP Reset
    window.electronAPI.onXpReset(() => {
        console.log("🧼 XP Reset received — zeroing XP and LV");

        Object.values(allHeroes).forEach((h) => {
            h.xp = 0;
            h.lv = 1;
            h.totalXpGained = 0; // ✅ Reset this too
            h.firstXpTimestamp = Date.now(); // ✅ Reset session start
            h.lastUpdate = Date.now();
        });

        filterHeroes();
        refreshList();
        publishTrackedTickers();
    });
});

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
    for (let i = 1; i < lv; i++) {
        total += i * 1000;
    }
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
    let out;
    if (num < 100) return num.toString();
    if (num < 1_000) out = (num / 1_000).toFixed(1) + "K";
    else if (num < 1_000_000) out = (num / 1_000).toFixed(1) + "K";
    else if (num < 1_000_000_000) out = (num / 1_000_000).toFixed(1) + "M";
    else out = (num / 1_000_000_000).toFixed(1) + "B";
    return out.replace(/\.0(?=[KMB])/, ""); // remove .0 before K/M/B
}

function computeXpSegments(count) {
    // target shares: para=10%, high=20%, med=30%, low=40%
    let para = Math.max(1, Math.floor(count * 0.1));
    let high = Math.floor(count * 0.2);
    let med = Math.floor(count * 0.3);

    let used = para + high + med;
    if (used > count) {
        // reduce in order: med → high → (keep para ≥ 1)
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
