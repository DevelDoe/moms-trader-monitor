const symbolColors = {};
const allHeroes = {}; // 💾 all heroes, unfiltered
const heroes = {}; // 🧹 filtered heroes based on settings
const { isDev } = window.appFlags;
const debug = isDev;

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");

    window.settings = await window.settingsAPI.get();
    const all = await window.storeAPI.getSymbols();

    const refreshList = () => {
        const now = Date.now();
        const inactiveThreshold = 30_000; // 30 seconds

        const { min, realMax } = getPriceLimits();

        const sorted = Object.values(heroes)
            .filter((h) => h.xp > 0)
            .sort((a, b) => {
                if (b.lv !== a.lv) return b.lv - a.lv;
                return b.xp - a.xp;
            })
            .slice(0, 11);

        const xpPerMinutes = sorted.map((h) => parseFloat(getXpPerMinute(h)));
        const maxXpm = Math.max(...xpPerMinutes, 1); // fallback 1 to avoid division by 0

        container.innerHTML = sorted
            .map((h, i) => {
                const required = (h.lv + 1) * 1000;
                const bg = getSymbolColor(h.hero);

                const age = now - (h.lastUpdate || 0);
                const isInactive = age > inactiveThreshold;
                const dullStyle = isInactive ? "opacity: 0.4; filter: grayscale(0.8);" : "";

                const xpm = parseFloat(getXpPerMinute(h));
                const xpmColor = getXpmColor(xpm, maxXpm);

                return `
            <div class="xp-line ellipsis" style="${dullStyle}; color: gray;">
        <span class="text-tertiary" style="margin-right:6px; opacity:0.5; display:inline-block; width: 20px; text-align: right;">${i + 1}.</span>
        <strong class="symbol" style="background: ${bg};">${h.hero} <span class="lv">${formatPrice(h.price)}</span></strong>
        <span style="font-weight: 600; color: #04f370; opacity: 0.75;">${h.totalXpGained}</span>
        (<span class="xpm" style="font-size: 11px; color: ${xpmColor};">${xpm}</span>)
    </div>`;
            })
            .join("");

        // Add click listeners to symbol elements
        container.querySelectorAll(".symbol").forEach((el) => {
            el.addEventListener("click", (e) => {
                const hero = el.textContent.trim().split(" ")[0].replace("$", ""); // Remove $ if included

                try {
                    navigator.clipboard.writeText(hero);
                    console.log(`📋 Copied ${hero} to clipboard`);

                    if (window.activeAPI?.setActiveTicker) {
                        window.activeAPI.setActiveTicker(hero);
                        console.log(`🎯 Set ${hero} as active ticker`);
                    }

                    el.classList.add("symbol-clicked");
                    setTimeout(() => el.classList.remove("symbol-clicked"), 200);
                } catch (err) {
                    console.error(`⚠️ Failed to handle click for ${hero}:`, err);
                }

                e.stopPropagation();
            });
        });
    };

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
    });

    // 3. Settings updates
    window.settingsAPI.onUpdate(async (updatedSettings) => {
        if (debug) console.log("🎯 Settings updated:", updatedSettings);
        window.settings = updatedSettings;
        filterHeroes();
        refreshList();
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

function getXpPerMinute(hero) {
    const now = Date.now();
    const start = hero.firstXpTimestamp || now;
    const minutes = (now - start) / 60000;
    const gained = hero.totalXpGained || 0;
    return minutes > 0 ? `${(gained / minutes).toFixed(0)}` : "—";
}

function getXpmColor(xpm, maxXpm) {
    const ratio = xpm / maxXpm;
    if (ratio > 0.66) return "orange"; // Top 33%
    if (ratio > 0.33) return "dodgerblue"; // Middle 33%
    return "gray"; // Bottom 33%
}
