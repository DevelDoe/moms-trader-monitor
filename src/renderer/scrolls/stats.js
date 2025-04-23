const symbolColors = {};
let globalBuffs = {}; // ⬅️ Buff map for score lookup

const { isDev } = window.appFlags;

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");
    const heroes = {};

    function calculateScore(heroBuffs = {}) {
        return Object.keys(heroBuffs).reduce((acc, key) => {
            // Skip volume-based buffs
            if (key === "volume" || key.startsWith("vol") || key.includes("Vol")) return acc;

            const buff = heroBuffs[key];
            if (typeof buff === "object" && buff?.score != null) {
                return acc + buff.score;
            }

            const lookup = globalBuffs[key];
            return acc + (lookup?.score || 0);
        }, 0);
    }

    const refreshList = () => {
        const now = Date.now();
        const inactiveThreshold = 30_000;

        // Step 1: Pick top XP-based pool (level and xp)
        const topByXP = Object.values(heroes)
            .filter((h) => h.xp > 0)
            .sort((a, b) => {
                if (b.lv !== a.lv) return b.lv - a.lv;
                return b.xp - a.xp;
            })
            .slice(0, 16);

        // Step 2: Sort that pool by buff score
        const sorted = topByXP
            .map((h) => ({
                ...h,
                score: calculateScore(h.buffs),
            }))
            .sort((a, b) => b.score - a.score);
        // .slice(0, 10);

        // if (debugScroll) {
        //     console.groupCollapsed("📦 Full Heroes Snapshot (Raw)");
        //     Object.values(heroes).forEach((h) => {
        //         console.log(`🧙 ${h.hero} — XP: ${h.xp} | LV: ${h.lv} | Score: ${calculateScore(h.buffs)}`);
        //         console.table(h.buffs);
        //     });
        //     console.groupEnd();
        // }

        container.innerHTML = sorted
            .map((h) => {
                const bg = getSymbolColor(h.hero);
                const age = now - (h.lastUpdate || 0);
                const dullStyle = age > 30_000 ? "opacity: 0.4; filter: grayscale(60%);" : "";

                const buffIcons = Object.entries(h.buffs || {})
                    .filter(([key]) => !key.includes("vol") && key !== "volume") // exclude volume-related buffs
                    .map(([key, val]) => (typeof val === "object" && val.icon ? val.icon : globalBuffs[key]?.icon || ""))
                    .join(" ");

                return `
                    <div class="xp-line" style="${dullStyle}">
                        <strong class="symbol" style="background: ${bg};">$${h.hero}</strong><span>${h.score}</span><span class="buffs" style="margin-left: 8px; color: #e74c3c;">${buffIcons}</span>
                    </div>`;
            })
            .join("");
    };

    try {
        const [symbols, fetchedBuffs] = await Promise.all([window.storeAPI.getSymbols(), window.electronAPI.getBuffs()]);

        // 🧠 Convert buffs list into { key: buffObj }
        globalBuffs = Array.isArray(fetchedBuffs)
            ? fetchedBuffs.reduce((acc, buff) => {
                  if (buff.key) acc[buff.key] = buff;
                  return acc;
              }, {})
            : {};

        symbols.forEach((s) => {
            heroes[s.symbol] = {
                hero: s.symbol,
                xp: s.xp || 0,
                lv: s.lv || 0,
                buffs: s.buffs || {},
                lastUpdate: Date.now(),
            };
        });

        refreshList();

        window.electronAPI.onXpUpdate(({ symbol, xp, lv }) => {
            if (!heroes[symbol]) heroes[symbol] = { hero: symbol, xp, lv, buffs: {} };
            heroes[symbol].xp = xp;
            heroes[symbol].lv = lv;
            heroes[symbol].lastUpdate = Date.now();
            refreshList();
        });

        window.storeAPI.onBuffsUpdate((updatedSymbols) => {
            updatedSymbols.forEach(({ symbol, buffs }) => {
                if (!heroes[symbol]) return;
                heroes[symbol].buffs = buffs;
                refreshList();
            });
        });
    } catch (err) {
        console.error("Failed to load stats scroll:", err);
    }
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
