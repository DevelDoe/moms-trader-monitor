const symbolColors = {};
let globalBuffs = {}; // ⬅️ Buff map for score lookup
const up = (s) => String(s || "").toUpperCase();

let trackedTickers = []; // ← persisted order from settings
let _renderKey = ""; // micro-perf: skip unchanged renders
let activeStocksData = null; // ← Oracle active stocks data

let _top3Debounce = null;
function pushTop3Debounced(entries) {
    clearTimeout(_top3Debounce);
    _top3Debounce = setTimeout(() => {
        try {
            window.top3API?.set?.(entries);
        } catch {}
    }, 150);
}

function getSymbolLength() {
    return Math.max(1, Number(window.statsSettings?.listLength) || 25);
}

// Load stats settings from electron store
async function loadStatsSettings() {
    try {
        const statsSettings = await window.statsSettingsAPI.get();
        window.statsSettings = statsSettings;
        console.log("✅ Loaded stats settings:", statsSettings);
    } catch (error) {
        console.error("❌ Failed to load stats settings:", error);
        window.statsSettings = { listLength: 25 }; // fallback
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");
    if (!container) return;

    const heroes = {};

    // --- helpers -------------------------------------------------------------

    const refreshList = () => {
        const inactiveThreshold = 30_000;
        const now = Date.now();

        // trackedTickers defines WHO can show; not the order
        const order = new Map(trackedTickers.map((s, i) => [up(s), i]));

        // Filter heroes to only include those in the active Oracle stocks list
        const activeHeroes = activeStocksData?.symbols 
            ? Object.values(heroes).filter(h => 
                activeStocksData.symbols.some(s => s.symbol === h.hero)
            )
            : Object.values(heroes);

        // 1) pick candidates
        const candidates = order.size
            ? activeHeroes.filter((h) => order.has(up(h.hero)))
            : activeHeroes
                  .filter((h) => h.xp > 0)
                  .sort((a, b) => (b.lv !== a.lv ? b.lv - a.lv : b.xp - a.xp))
                  .slice(0, getSymbolLength());

        // if filters wipe them out, fallback to LV/XP
        const baseList =
            order.size && candidates.length === 0
                ? activeHeroes
                      .filter((h) => h.xp > 0)
                      .sort((a, b) => (b.lv !== a.lv ? b.lv - a.lv : b.xp - a.xp))
                : candidates;

        // 2) score
        const scored = baseList.map((h) => ({
            ...h,
            score: calculateScore(h.buffs, h.score || 0),
        }));

        // 3) sort by score desc; tiebreakers: tracked order, then LV/XP
        const display = scored
            .sort((a, b) => {
                const diff = (b.score || 0) - (a.score || 0);
                if (diff) return diff;
                if (order.size) {
                    return (order.get(up(a.hero)) ?? Infinity) - (order.get(up(b.hero)) ?? Infinity);
                }
                if (b.lv !== a.lv) return b.lv - a.lv;
                return b.xp - a.xp;
            })
            .slice(0, getSymbolLength());

        // micro-perf: re-render if order OR the shown score changed
        const key = display.map((h) => `${up(h.hero)}:${(h.score / 10).toFixed(1)}`).join(",");
        if (key === _renderKey) return;
        _renderKey = key;

        container.innerHTML = display
            .map((h, idx) => {
                const bg = getSymbolColor(h.hero);
                const age = now - (h.lastUpdate || 0);
                // const dullStyle = age > inactiveThreshold ? "opacity: 0.4; filter: grayscale(0.8);" : "";
                const displayScore = (h.score / 10).toFixed(1);

                return `
              <div class="xp-line ellipsis" >
                <span class="text-tertiary" style="display:inline-block; min-width: 24px; text-align:right; margin-right: 4px; opacity: 1;">
                  ${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1 + "."}
                </span>
                <strong class="symbol" style="background: ${bg};">
                  ${h.hero}
                </strong>
                <span class="buffs" style="font-weight: 600; ">${displayScore}</span>
              </div>`;
            })
            .join("");

        const ranked = display.slice(0, 3).map((h, i) => ({
            symbol: up(h.hero),
            rank: i + 1,
            score: Number(h.score ?? 0),
        }));
        pushTop3Debounced(ranked);

        // click handler
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
    };

    // --- boot ---------------------------------------------------------------

    try {
        // Load settings (for symbolLength etc.), and the tracked list from the STORE
        window.settings = await window.settingsAPI.get();
        
        // Load stats settings from electron store
        await loadStatsSettings();
        
        try {
            trackedTickers = (await window.storeAPI.getTracked()).map(up);
        } catch (e) {
            console.warn("tracked:get failed; starting empty:", e);
            trackedTickers = [];
        }

        // Stay in sync if XP updates the store
        window.storeAPI.onTrackedUpdate((list) => {
            // console.log("tracked", list);
            trackedTickers = (list || []).map(up);
            refreshList(); // re-render using the latest canonical order
        });

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
                price: s.Price || s.price || 0,
                lastUpdate: Date.now(),
            };
        });

        refreshList();

        // live hero updates
        window.storeAPI.onHeroUpdate((payload) => {
            const items = Array.isArray(payload) ? payload : [payload];

            items.forEach(({ hero, buffs, xp, lv, price, firstXpTimestamp, lastEvent }) => {
                if (!hero) return;

                if (!heroes[hero]) {
                    heroes[hero] = {
                        hero,
                        xp: 0,
                        lv: 1,
                        buffs: {},
                        price: 0,
                        firstXpTimestamp: Date.now(),
                        lastUpdate: Date.now(),
                    };
                }

                const h = heroes[hero];
                if (buffs) h.buffs = buffs; // or: h.buffs = { ...h.buffs, ...buffs }
                if (typeof xp === "number") h.xp = xp;
                if (typeof lv === "number") h.lv = lv;
                if (typeof price === "number") h.price = price;

                if (typeof firstXpTimestamp === "number") h.firstXpTimestamp = firstXpTimestamp;
                if (lastEvent) h.lastEvent = lastEvent;

                h.lastUpdate = Date.now();
            });

            refreshList();
        });

        window.settingsAPI.onUpdate((updated) => {
            window.settings = updated;
            refreshList(); // use the new symbolLength/filters, but don't touch trackedTickers
        });

        // Listen for stats settings updates from electron store
        window.statsSettingsAPI.onUpdate((updatedSettings) => {
            if (updatedSettings) {
                window.statsSettings = updatedSettings;
                console.log("✅ Stats settings updated from settings:", updatedSettings);
                refreshList(); // re-render with new list length
            }
        });

        // Listen for Oracle active stocks updates
        window.xpAPI.onActiveStocksUpdate((data) => {
            console.log("🔄 Oracle active stocks update received:", data);
            activeStocksData = data;
            refreshList();
        });

        // Get initial Oracle data
        try {
            activeStocksData = await window.xpAPI.getActiveStocks();
            console.log("📊 Initial Oracle active stocks data:", activeStocksData);
        } catch (e) {
            console.warn("Failed to get initial Oracle data:", e);
        }
    } catch (err) {
        console.error("Failed to load stats scroll:", err);
    }

    // state nuke
    window.electronAPI.onNukeState(async () => {
        Object.keys(heroes).forEach((k) => delete heroes[k]);
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

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

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
        const saturation = 80,
            lightness = 50,
            alpha = 0.5;
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
            if (!hasBullish && !hasBearish) newsScore = score;
            continue;
        }

        totalScore += score;
    }

    if (!(hasBullish && hasBearish)) totalScore += newsScore;
    return totalScore;
}

function formatPrice(price) {
    return typeof price === "number" ? `$${price.toFixed(2)}` : "—";
}
