const symbolColors = {};

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");
    const heroes = {};

    const refreshList = () => {
        const now = Date.now();
        const inactiveThreshold = 30_000; // 30 seconds

        const sorted = Object.values(heroes)
            .filter((h) => h.xp > 0)
            .sort((a, b) => {
                if (b.lv !== a.lv) return b.lv - a.lv;
                return b.xp - a.xp;
            })
            .slice(0, 16);

        container.innerHTML = sorted
            .map((h, i) => {
                const required = (h.lv + 1) * 1000;
                const bg = getSymbolColor(h.hero);

                const age = now - (h.lastUpdate || 0);
                const isInactive = age > inactiveThreshold;
                const dullStyle = isInactive ? "opacity: 0.4; filter: grayscale(0.8);" : "";

                return `
                    <div class="xp-line ellipsis" style="${dullStyle}">
                        <strong class="symbol" style="background: ${bg};">${h.hero}  <span class="lv">${h.lv}</span></strong>${getTotalXP(h.lv, h.xp)}
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

    const all = await window.storeAPI.getSymbols();
    all.forEach((h) => {
        heroes[h.symbol] = {
            hero: h.symbol,
            xp: h.xp || 0,
            lv: h.lv || 0,
            lastUpdate: Date.now(), // optional default
        };
    });

    refreshList();

    window.storeAPI.onHeroUpdate((updatedHeroes) => {
        updatedHeroes.forEach(({ hero, xp, lv }) => {
            if (!heroes[hero]) heroes[hero] = { hero, xp: 0, lv: 1 };
            if (typeof xp === "number") heroes[hero].xp = xp;
            if (typeof lv === "number") heroes[hero].lv = lv;
            heroes[hero].lastUpdate = Date.now();
        });

        refreshList();
    });

    window.electronAPI.onNukeState(async () => {
        console.warn("🧨 Nuke signal received in XP scroll — clearing and reloading heroes");

        // Clear
        Object.keys(heroes).forEach((key) => delete heroes[key]);
        container.innerHTML = "";

        // Re-fetch fresh symbols
        const all = await window.storeAPI.getSymbols();
        all.forEach((h) => {
            heroes[h.symbol] = {
                hero: h.symbol,
                xp: h.xp || 0,
                lv: h.lv || 0,
                lastUpdate: Date.now(),
            };
        });

        refreshList();
    });
});

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
