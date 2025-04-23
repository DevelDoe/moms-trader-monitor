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
                const dullStyle = isInactive ? "opacity: 0.4; filter: grayscale(60%);" : "";

                return `
                    <div class="xp-line" style="${dullStyle}">
                        <strong class="symbol" style="background: ${bg};">$${h.hero}  <span class="lv">${h.lv}</span></strong>${getTotalXP(h.lv, h.xp)}
                    </div>`;
            })
            .join("");
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

    window.electronAPI.onXpUpdate(({ symbol, xp, lv }) => {
        if (!heroes[symbol]) heroes[symbol] = { hero: symbol, xp, lv };
        heroes[symbol].xp = xp;
        heroes[symbol].lv = lv;
        heroes[symbol].lastUpdate = Date.now(); // ⏱️
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
