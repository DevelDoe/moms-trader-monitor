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

        container.innerHTML = sorted
            .map((h) => {
                const bg = getSymbolColor(h.hero);
                const age = now - (h.lastUpdate || 0);
                const dullStyle = age > inactiveThreshold ? "opacity: 0.4; filter: grayscale(0.8);" : "";

                const buffIcons = Object.entries(h.buffs || {})
                    .filter(([key]) => !key.includes("vol") && key !== "volume") // exclude volume-related buffs
                    .map(([key, val]) => (typeof val === "object" && val.icon ? val.icon : globalBuffs[key]?.icon || ""))
                    .join(" ");

                return `
                    <div class="xp-line ellipsis" style="${dullStyle}">
                        <strong class="symbol" style="background: ${bg};">${h.hero}  <span class="lv">${h.lv}</strong><span>${h.score}</span><span class="buffs" style="margin-left: 8px; color: #e74c3c;">${buffIcons}</span>
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

        window.storeAPI.onHeroUpdate((updatedHeroes) => {
            updatedHeroes.forEach(({ hero, buffs, xp, lv }) => {
                if (!heroes[hero]) {
                    heroes[hero] = {
                        hero,
                        xp: 0,
                        lv: 1,
                        buffs: {},
                        lastUpdate: Date.now(),
                    };
                }

                if (typeof xp === "number") heroes[hero].xp = xp;
                if (typeof lv === "number") heroes[hero].lv = lv;
                if (buffs) heroes[hero].buffs = buffs;
                heroes[hero].lastUpdate = Date.now();
            });

            refreshList();
        });
    } catch (err) {
        console.error("Failed to load stats scroll:", err);
    }

    window.electronAPI.onNukeState(async () => {
        console.warn("🧨 Nuke signal received in XP scroll — clearing and reloading heroes");

        Object.keys(heroes).forEach((key) => delete heroes[key]);
        container.innerHTML = "";

        try {
            const symbols = await window.storeAPI.getSymbols();
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
        } catch (err) {
            console.error("⚠️ Failed to reload heroes after nuke:", err);
        }
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
