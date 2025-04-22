const { isDev } = window.appFlags;
const freshStart = isDev; // Fresh session each time while developing

const symbolColors = {};
document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");
    const heroes = {};

    loadScrollState();

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
                const xpPercent = Math.round((h.xp / required) * 100).toFixed(0);
                const bg = getSymbolColor(h.hero);

                const age = now - (h.lastUpdate || 0);
                const isInactive = age > inactiveThreshold;
                const dullStyle = isInactive ? "opacity: 0.4; filter: grayscale(60%);" : "";

                return `
                    <div class="xp-line" style="${dullStyle}">
                       
                        <strong class="symbol" style="background: ${bg};">$${h.hero}  <span class="lv">${h.lv}</span></strong>
                         XP ${h.xp}
                    </div>
                `;
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
        saveScrollState();
    });
});

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

////////////////////////////////////// State
function getMarketDateString() {
    const now = new Date();
    const offset = -5 * 60; // EST
    const localOffset = now.getTimezoneOffset();
    const estDate = new Date(now.getTime() + (localOffset - offset) * 60000);
    return estDate.toISOString().split("T")[0];
}

function saveScrollState() {
    const sessionDate = getMarketDateString();
    const payload = {
        date: sessionDate,
        heroes,
    };
    localStorage.setItem("scrollXpState", JSON.stringify(payload));
}

function loadScrollState() {
    if (freshStart) {
        console.log("🧪 Dev mode: skipping XP restore");
        return;
    }

    const saved = localStorage.getItem("scrollXpState");
    if (!saved) return;

    try {
        const parsed = JSON.parse(saved);
        const today = getMarketDateString();
        if (parsed.date === today && parsed.heroes) {
            Object.assign(heroes, parsed.heroes);
            console.log("🔄 Scroll state restored.");
        } else {
            console.log("🧼 Scroll state outdated or missing. Skipping restore.");
        }
    } catch (err) {
        console.warn("⚠️ Invalid scroll state.");
    }
}
