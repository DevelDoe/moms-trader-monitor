const symbolColors = {};
let globalBuffs = {}; // ⬅️ Buff map for score lookup
const symbolLength = 14;

const { isDev } = window.appFlags;

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");
    const heroes = {};

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
            .slice(0, symbolLength);

        // Step 2: Sort that pool by buff score
        // Step 2: Sort that pool by buff score
        const sorted = topByXP
            .map((h) => {
                const finalScore = calculateScore(h.buffs, h.score || 0);

                Object.entries(h.buffs || {}).forEach(([key, val]) => {
                    const ref = typeof val === "object" ? val : globalBuffs[key];
                    if (!ref || ref.score === 0) return;

                    console.log(`   🔸 ${key}: ${ref.score} (${ref.desc || "no desc"})`);
                });

                return {
                    ...h,
                    score: finalScore,
                };
            })
            .sort((a, b) => b.score - a.score);

        container.innerHTML = sorted
            .map((h, idx) => {
                const bg = getSymbolColor(h.hero);
                const age = now - (h.lastUpdate || 0);
                const dullStyle = age > inactiveThreshold ? "opacity: 0.4; filter: grayscale(0.8);" : "";

                const buffIcons = Object.entries(h.buffs || {})
                    .filter(([key]) => !key.includes("vol") && key !== "volume" && key !== "newHigh")
                    .map(([key, val]) => (typeof val === "object" && val.icon ? val.icon : globalBuffs[key]?.icon || ""))
                    .join(" ");

                return `
                <div class="xp-line ellipsis" style="${dullStyle}">
                    <span class="text-tertiary" style="display:inline-block; min-width: 24px; text-align:right; margin-right: 4px; opacity: 0.5;">
                        ${idx + 1}.
                    </span>
                    <strong class="symbol" style="background: ${bg};">
                        ${h.hero} <span class="lv">${formatPrice(h.price)}</span>
                    </strong>
                    <span class="buffs" style="margin-left: 8px; color: #e74c3c; font-size: 1rem;">${buffIcons}</span>
                </div>`;
            })

            .join("");

        // <span class="score" title="${generateScoreTooltip(h)}">${h.score}</span>

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
                price: s.Price || s.price || 0, // ✅ Grab price from incoming symbol
                lastUpdate: Date.now(),
            };
        });

        refreshList();

        window.storeAPI.onHeroUpdate((updatedHeroes) => {
            updatedHeroes.forEach(({ hero, buffs, xp, lv, price }) => {
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

                if (typeof xp === "number") heroes[hero].xp = xp;
                if (typeof lv === "number") heroes[hero].lv = lv;
                if (buffs) heroes[hero].buffs = buffs;
                if (typeof price === "number") heroes[hero].price = price;

                heroes[hero].lastUpdate = Date.now();
            });

            refreshList();
        });
    } catch (err) {
        console.error("Failed to load stats scroll:", err);
    }

    window.electronAPI.onXpReset(() => {
        console.log("🧼 XP Reset received in Foundations — zeroing XP and LV");

        Object.values(heroes).forEach((hero) => {
            hero.xp = 0;
            hero.lv = 1;
            hero.lastUpdate = Date.now();
        });

        refreshList();
    });

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
