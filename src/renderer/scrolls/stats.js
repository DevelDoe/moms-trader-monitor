const symbolColors = {};
let globalBuffs = {};
const heroes = {};
const { isDev } = window.appFlags;
const debug = isDev;

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");

    try {
        const [symbols, fetchedBuffs, settings] = await Promise.all([window.storeAPI.getSymbols(), window.electronAPI.getBuffs(), window.settingsAPI.get()]);

        window.settings = settings;
        globalBuffs = Array.isArray(fetchedBuffs)
            ? fetchedBuffs.reduce((acc, buff) => {
                  if (buff.key) acc[buff.key] = buff;
                  return acc;
              }, {})
            : {};

        symbols.forEach(({ symbol, xp, lv, buffs, price, Price }) => {
            const parsedPrice = Number(price ?? Price);
            if (isNaN(parsedPrice)) {
                return;
            }

            const { minPrice, realMaxPrice } = getPriceLimits();
            if ((minPrice > 0 && parsedPrice < minPrice) || parsedPrice > realMaxPrice) {
                return;
            }

            heroes[symbol] = {
                hero: symbol,
                xp: Number(xp) || 0,
                lv: Number(lv) || 1,
                buffs: buffs || {},
                price: parsedPrice,
                lastUpdate: Date.now(),
            };
        });

        refreshList();
    } catch (err) {
        console.error("⚠️ Failed during initial load:", err);
    }

    window.storeAPI.onHeroUpdate((updatedHeroes) => {
        const { minPrice, realMaxPrice } = getPriceLimits();

        updatedHeroes.forEach(({ hero, xp, lv, buffs, price }) => {
            const parsedPrice = Number(price);
            if (isNaN(parsedPrice)) {
                return;
            }

            if ((minPrice > 0 && parsedPrice < minPrice) || parsedPrice > realMaxPrice) {
                return;
            }

            if (!heroes[hero]) {
                heroes[hero] = {
                    hero,
                    xp: 0,
                    lv: 1,
                    buffs: {},
                    price: 0,
                    lastUpdate: Date.now(),
                };
            }

            heroes[hero].xp = Number(xp) || 0;
            heroes[hero].lv = Number(lv) || 1;
            heroes[hero].buffs = buffs || {};
            heroes[hero].price = parsedPrice;
            heroes[hero].lastUpdate = Date.now();
        });

        refreshList();
    });

    window.settingsAPI.onUpdate(async (updatedSettings) => {
        if (debug) console.log("🎯 Settings updated, reapplying...", updatedSettings);
        window.settings = updatedSettings;
        refreshList();
    });

    window.electronAPI.onXpReset(() => {
        console.log("🧼 XP Reset received — zeroing XP and LV");

        Object.values(heroes).forEach((hero) => {
            hero.xp = 0;
            hero.lv = 1;
            hero.lastUpdate = Date.now();
        });

        refreshList();
    });

    window.electronAPI.onNukeState(async () => {
        console.warn("🧨 Nuke signal received in XP scroll — clearing and reloading heroes and buffs");

        Object.keys(heroes).forEach((key) => delete heroes[key]);
        container.innerHTML = "";

        try {
            const [symbols, fetchedBuffs] = await Promise.all([window.storeAPI.getSymbols(), window.electronAPI.getBuffs()]);

            // 🧠 Rebuild buff map
            globalBuffs = Array.isArray(fetchedBuffs)
                ? fetchedBuffs.reduce((acc, buff) => {
                      if (buff.key) acc[buff.key] = buff;
                      return acc;
                  }, {})
                : {};

            // 🧠 Rebuild heroes
            symbols.forEach((s) => {
                heroes[s.symbol] = {
                    hero: s.symbol,
                    xp: s.xp || 0,
                    lv: s.lv || 0,
                    buffs: s.buffs || {},
                    price: s.Price || s.price || 0,
                    lastUpdate: Date.now(),
                };
            });

            refreshList();
        } catch (err) {
            console.error("⚠️ Failed to reload heroes and buffs after nuke:", err);
        }
    });

    function refreshList() {
        const now = Date.now();
        const inactiveThreshold = 30_000;
        const { minPrice, realMaxPrice } = getPriceLimits();

        const topByXP = Object.values(heroes)
            .filter((h) => h.xp > 0 && h.price >= minPrice && h.price <= realMaxPrice)
            .sort((a, b) => {
                if (b.lv !== a.lv) return b.lv - a.lv;
                return b.xp - a.xp;
            })
            .slice(0, 15);

        const sorted = topByXP
            .map((h) => ({
                ...h,
                score: calculateScore(h.buffs, h.score || 0),
            }))
            .sort((a, b) => b.score - a.score);

        container.innerHTML = sorted
            .map((h) => {
                const bg = getSymbolColor(h.hero);
                const age = now - (h.lastUpdate || 0);
                const dullStyle = age > inactiveThreshold ? "opacity: 0.4; filter: grayscale(0.8);" : "";

                const buffIcons = Object.entries(h.buffs || {})
                    .filter(([key]) => !key.includes("vol") && key !== "volume" && key !== "newHigh")
                    .map(([key, val]) => (typeof val === "object" && val.icon ? val.icon : globalBuffs[key]?.icon || ""))
                    .join(" ");

                return `
                    <div class="xp-line ellipsis" style="${dullStyle}">
                        <strong class="symbol" style="background: ${bg};">${h.hero} <span class="lv">${formatPrice(h.price)}</span></strong>
                        <span class="score" title="${generateScoreTooltip(h)}">${h.score}</span>
                        <span class="buffs" style="margin-left: 8px; color: #e74c3c;">${buffIcons}</span>
                    </div>`;
            })
            .join("");

        container.querySelectorAll(".symbol").forEach((el) => {
            el.addEventListener("click", (e) => {
                const hero = el.textContent.trim().split(" ")[0].replace("$", "");
                try {
                    navigator.clipboard.writeText(hero);
                    if (window.activeAPI?.setActiveTicker) {
                        window.activeAPI.setActiveTicker(hero);
                    }
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

// Helpers
function getPriceLimits() {
    const minPrice = Number(window.settings?.top?.minPrice) || 0;
    const max = Number(window.settings?.top?.maxPrice) || 0;
    const realMaxPrice = max > 0 ? max : Infinity;
    return { minPrice, realMaxPrice };
}

function generateScoreTooltip(hero) {
    const base = hero.score - calculateScore(hero.buffs, 0);
    const lines = [`Base Score: ${base}`];

    let hasBullish = false;
    let hasBearish = false;
    let hasNeutral = false;

    Object.entries(hero.buffs || {}).forEach(([key, buff]) => {
        if (key === "volume" || key.startsWith("vol") || key.includes("Vol") || key === "newHigh") return;

        const ref = typeof buff === "object" ? buff : globalBuffs[key];
        if (!ref || typeof ref.score !== "number") return;

        if (key === "hasBullishNews") {
            hasBullish = true;
            return;
        }

        if (key === "hasBearishNews") {
            hasBearish = true;
            return;
        }

        if (key === "hasNews") {
            hasNeutral = true;
            return;
        }

        lines.push(`${ref.score >= 0 ? "+" : ""}${ref.score} — ${ref.desc || key}`);
    });

    // Only show one line for news
    if (hasBullish && !hasBearish) {
        lines.push(`+${globalBuffs.hasBullishNews?.score || 0} — ${globalBuffs.hasBullishNews?.desc || "Bullish News"}`);
    } else if (hasBearish && !hasBullish) {
        lines.push(`${globalBuffs.hasBearishNews?.score || 0} — ${globalBuffs.hasBearishNews?.desc || "Bearish News"}`);
    } else if (hasNeutral && !hasBullish && !hasBearish) {
        lines.push(`+${globalBuffs.hasNews?.score || 0} — ${globalBuffs.hasNews?.desc || "News Catalyst"}`);
    }

    lines.push(`= Total: ${hero.score}`);
    return lines.join("\n");
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

function calculateScore(heroBuffs = {}, baseScore = 0) {
    let totalScore = baseScore;
    let newsScore = 0;
    let hasBullish = false;
    let hasBearish = false;

    for (const key in heroBuffs) {
        if (key === "volume" || key.startsWith("vol") || key.includes("Vol") || key === "newHigh") continue;

        const buff = heroBuffs[key];
        const ref = typeof buff === "object" ? buff : globalBuffs[key];
        const score = ref?.score || 0;

        if (key === "hasBullishNews") {
            hasBullish = true;
            newsScore = score;
            continue;
        }

        if (key === "hasBearishNews") {
            hasBearish = true;
            newsScore = score;
            continue;
        }

        if (key === "hasNews") {
            // Only assign if no stronger sentiment already found
            if (!hasBullish && !hasBearish) {
                newsScore = score;
            }
            continue;
        }

        totalScore += score;
    }

    if (!(hasBullish && hasBearish)) {
        totalScore += newsScore;
    }

    return totalScore;
}

function formatPrice(price) {
    return typeof price === "number" ? `$${price.toFixed(2)}` : "—";
}
