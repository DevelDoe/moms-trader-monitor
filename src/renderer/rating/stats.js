// ============================================================================
// STATS SCROLL - REFACTORED VERSION
// ============================================================================
// This module manages the stats scroll view that displays ranked active stocks
// based on their calculated scores from buffs and XP data.

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const TOP3_DEBOUNCE_MS = 150;

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

class StatsState {
    constructor() {
        this.symbolColors = {};
        this.globalBuffs = {};
        this.trackedTickers = [];
        this.activeStocksData = null;
        this.heroes = {};
        this.renderKey = "";
        this.top3Debounce = null;
        this.settings = { listLength: 10 };
    }

    // Utility function to normalize symbol names
    normalizeSymbol(symbol) {
        return String(symbol || "").toUpperCase();
    }

    // Get the configured list length (no longer used since backend controls list size)
    getListLength() {
        return Math.max(1, Number(this.settings?.listLength) || 25);
    }

    // Update tracked tickers from store
    updateTrackedTickers(tickers) {
        this.trackedTickers = (tickers || []).map(t => this.normalizeSymbol(t));
    }

    // Update active stocks data from Oracle
    updateActiveStocks(data) {
        this.activeStocksData = data;
        console.log("🔄 Active stocks updated:", data?.symbols?.length || 0, "symbols");
    }

    // Update settings
    updateSettings(newSettings) {
        this.settings = newSettings || { listLength: 25 };
    }
}

// Global state instance
const state = new StatsState();

// ============================================================================
// SCORING & RANKING LOGIC
// ============================================================================

class StatsScorer {
    constructor(state) {
        this.state = state;
    }

    // Calculate score for a hero based on their buffs
    calculateScore(heroBuffs = {}, baseScore = 0) {
        let totalScore = baseScore;
        let newsScore = 0;
        let hasBullish = false;
        let hasBearish = false;

        for (const key in heroBuffs) {
            // Skip volume-related buffs
            if (key === "volume" || key.startsWith("vol") || key.includes("Vol") || key === "newHigh") {
                continue;
            }

            const buff = heroBuffs[key];
            const ref = typeof buff === "object" ? buff : this.state.globalBuffs[key];
            const score = ref?.score || 0;

            // Handle news buffs specially
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

        // Add news score only if not conflicting
        if (!(hasBullish && hasBearish)) {
            totalScore += newsScore;
        }
        
        return totalScore;
    }

    // Get ranked heroes from active stocks (no additional filtering - backend handles pruning)
    getRankedHeroes() {
        // Simply get heroes that are in the active Oracle stocks list
        // Backend has already done all the pruning and filtering
        const activeHeroes = this.state.activeStocksData?.symbols 
            ? Object.values(this.state.heroes).filter(h => 
                this.state.activeStocksData.symbols.some(s => s.symbol === h.hero)
            )
            : [];

        // Calculate scores for all active heroes
        const scored = activeHeroes.map((h) => {
            const newScore = this.calculateScore(h.buffs, h.score || 0);
            const oldScore = h.score || 0;
            
            // Log score changes for debugging
            if (Math.abs(newScore - oldScore) > 0.1) {
                console.log(`📊 [Rating] ${h.hero} score recalculated: ${oldScore.toFixed(1)} → ${newScore.toFixed(1)} (Δ${(newScore - oldScore).toFixed(1)})`);
            }
            
            return {
                ...h,
                score: newScore,
            };
        });

        // Sort by score (descending) and limit to configured list length
        return scored
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, this.state.getListLength());
    }
}

// ============================================================================
// UI RENDERING
// ============================================================================

class StatsRenderer {
    constructor(state, container) {
        this.state = state;
        this.container = container;
        this.scorer = new StatsScorer(state);
    }

    // Generate symbol color
    getSymbolColor(symbol) {
        if (!this.state.symbolColors[symbol]) {
            const hash = [...symbol].reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const hue = (hash * 37) % 360;
            this.state.symbolColors[symbol] = `hsla(${hue}, 80%, 50%, 0.5)`;
        }
        return this.state.symbolColors[symbol];
    }

    // Render the stats list
    render() {
        const rankedHeroes = this.scorer.getRankedHeroes();
        
        // Performance optimization: skip render if nothing changed
        const renderKey = rankedHeroes
            .map((h) => `${this.state.normalizeSymbol(h.hero)}:${(h.score / 10).toFixed(1)}`)
            .join(",");
        
        if (renderKey === this.state.renderKey) return;
        this.state.renderKey = renderKey;

        // Generate HTML
        const now = Date.now();
        this.container.innerHTML = rankedHeroes
            .map((hero, idx) => this.renderHeroRow(hero, idx, now))
            .join("");

        // Update top 3 data
        this.updateTop3(rankedHeroes);

        // Attach click handlers
        this.attachClickHandlers();
    }

    // Render individual hero row
    renderHeroRow(hero, idx, now) {
        const bg = this.getSymbolColor(hero.hero);
        const displayScore = (hero.score / 10).toFixed(1);
        const rankIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1 + ".";
        
        // Generate tooltip content
        const tooltipContent = this.generateScoreTooltip(hero);

        return `
            <div class="xp-line ellipsis">
                <span class="text-tertiary" style="display:inline-block; min-width: 24px; text-align:right; margin-right: 4px; opacity: 1;">
                    ${rankIcon}
                </span>
                <strong class="symbol" style="background: ${bg};">
                    ${hero.hero}
                </strong>
                <span class="buffs" style="font-weight: 600;" title="${tooltipContent}">${displayScore}</span>
            </div>`;
    }

    // Update top 3 data for other components
    updateTop3(rankedHeroes) {
        const top3 = rankedHeroes.slice(0, 3).map((h, i) => ({
            symbol: this.state.normalizeSymbol(h.hero),
            rank: i + 1,
            score: Number(h.score ?? 0),
        }));

        // Debounced update
        clearTimeout(this.state.top3Debounce);
        this.state.top3Debounce = setTimeout(() => {
            try {
                window.top3API?.set?.(top3);
            } catch (error) {
                console.error("Failed to update top3:", error);
            }
        }, TOP3_DEBOUNCE_MS);
    }

    // Generate score tooltip for a hero
    generateScoreTooltip(hero) {
        const base = hero.score - this.scorer.calculateScore(hero.buffs, 0);
        const lines = [`Base Score: ${base}`];

        let hasBullish = false;
        let hasBearish = false;
        let hasNeutral = false;

        Object.entries(hero.buffs || {}).forEach(([key, buff]) => {
            if (key === "volume" || key.startsWith("vol") || key.includes("Vol") || key === "newHigh") return;

            const ref = typeof buff === "object" ? buff : this.state.globalBuffs[key];
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
            lines.push(`+${this.state.globalBuffs.hasBullishNews?.score || 0} — ${this.state.globalBuffs.hasBullishNews?.desc || "Bullish News"}`);
        } else if (hasBearish && !hasBullish) {
            lines.push(`${this.state.globalBuffs.hasBearishNews?.score || 0} — ${this.state.globalBuffs.hasBearishNews?.desc || "Bearish News"}`);
        } else if (hasNeutral && !hasBullish && !hasBearish) {
            lines.push(`+${this.state.globalBuffs.hasNews?.score || 0} — ${this.state.globalBuffs.hasNews?.desc || "News Catalyst"}`);
        }

        lines.push(`= Total: ${hero.score}`);
        return lines.join("\n");
    }

    // Attach click handlers to symbols
    attachClickHandlers() {
        this.container.querySelectorAll(".symbol").forEach((el) => {
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
}

// ============================================================================
// DATA MANAGEMENT
// ============================================================================

class StatsDataManager {
    constructor(state, renderer) {
        this.state = state;
        this.renderer = renderer;
    }

    // Load initial settings
    async loadSettings() {
        try {
            const [settings, statsSettings] = await Promise.all([
                window.settingsAPI.get(),
                window.statsSettingsAPI.get()
            ]);
            
            window.settings = settings;
            this.state.updateSettings(statsSettings);
            console.log("✅ Loaded settings:", { settings, statsSettings });
            console.log("📊 Stats list length set to:", this.state.getListLength());
        } catch (error) {
            console.error("❌ Failed to load settings:", error);
            this.state.updateSettings({ listLength: 25 });
        }
    }

    // Load tracked tickers from store
    async loadTrackedTickers() {
        try {
            const tracked = await window.storeAPI.getTracked();
            this.state.updateTrackedTickers(tracked);
        } catch (error) {
            console.warn("❌ Failed to load tracked tickers:", error);
            this.state.updateTrackedTickers([]);
        }
    }

    // Load symbols and buffs data
    async loadInitialData() {
        try {
            const [symbols, fetchedBuffs] = await Promise.all([
                window.storeAPI.getSymbols(),
                window.electronAPI.getBuffs()
            ]);

            // Convert buffs list into lookup object
            this.state.globalBuffs = Array.isArray(fetchedBuffs)
                ? fetchedBuffs.reduce((acc, buff) => {
                      if (buff.key) acc[buff.key] = buff;
                      return acc;
                  }, {})
                : {};

            // Initialize heroes from symbols
            symbols.forEach((s) => {
                this.state.heroes[s.symbol] = {
                    hero: s.symbol,
                    xp: s.xp || 0,
                    lv: s.lv || 0,
                    buffs: s.buffs || {},
                    price: s.Price || s.price || 0,
                    lastUpdate: Date.now(),
                };
            });

            console.log(`✅ Loaded ${symbols.length} symbols and ${Object.keys(this.state.globalBuffs).length} buffs`);
        } catch (error) {
            console.error("❌ Failed to load initial data:", error);
        }
    }

    // Load initial Oracle active stocks data
    async loadActiveStocks() {
        try {
            const activeStocks = await window.xpAPI.getActiveStocks();
            this.state.updateActiveStocks(activeStocks);
            console.log("📊 Initial Oracle active stocks data:", activeStocks);
        } catch (error) {
            console.warn("❌ Failed to get initial Oracle data:", error);
        }
    }

    // Handle hero updates from store
    handleHeroUpdate(payload) {
        const items = Array.isArray(payload) ? payload : [payload];

        items.forEach(({ hero, symbol, buffs, xp, lv, price, firstXpTimestamp, lastEvent }) => {
            const heroSymbol = hero || symbol;
            if (!heroSymbol) return;

            // Initialize hero if doesn't exist
            if (!this.state.heroes[heroSymbol]) {
                this.state.heroes[heroSymbol] = {
                    hero: heroSymbol,
                    xp: 0,
                    lv: 1,
                    buffs: {},
                    price: 0,
                    firstXpTimestamp: Date.now(),
                    lastUpdate: Date.now(),
                };
            }

            // Update hero data
            const h = this.state.heroes[heroSymbol];
            if (buffs) {
                const oldBuffs = h.buffs;
                h.buffs = buffs;
                // Log buff changes for debugging
                if (JSON.stringify(oldBuffs) !== JSON.stringify(buffs)) {
                    console.log(`🔄 [Rating] ${heroSymbol} buffs updated:`, {
                        old: Object.keys(oldBuffs || {}),
                        new: Object.keys(buffs || {}),
                        changed: Object.keys(buffs || {}).filter(key => 
                            JSON.stringify(oldBuffs?.[key]) !== JSON.stringify(buffs?.[key])
                        )
                    });
                }
            }
            if (typeof xp === "number") h.xp = xp;
            if (typeof lv === "number") h.lv = lv;
            if (typeof price === "number") h.price = price;
            if (typeof firstXpTimestamp === "number") h.firstXpTimestamp = firstXpTimestamp;
            if (lastEvent) h.lastEvent = lastEvent;
            h.lastUpdate = Date.now();
        });

        this.renderer.render();
    }

    // Handle state nuke
    async handleStateNuke() {
        // Clear all heroes
        Object.keys(this.state.heroes).forEach((k) => delete this.state.heroes[k]);
        
        // Reload from store
        try {
            const symbols = await window.storeAPI.getSymbols();
            symbols.forEach((s) => {
                this.state.heroes[s.symbol] = {
                    hero: s.symbol,
                    xp: s.xp || 0,
                    lv: s.lv || 0,
                    buffs: s.buffs || {},
                    lastUpdate: Date.now(),
                };
            });
            this.renderer.render();
        } catch (error) {
            console.error("⚠️ Failed to reload heroes after nuke:", error);
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Tracked tickers updates
        window.storeAPI.onTrackedUpdate((list) => {
            this.state.updateTrackedTickers(list);
            this.renderer.render();
        });

        // Hero updates
        window.storeAPI.onHeroUpdate((payload) => {
            this.handleHeroUpdate(payload);
        });

        // Settings updates
        window.settingsAPI.onUpdate((updated) => {
            window.settings = updated;
            this.renderer.render();
        });

        // Stats settings updates
        window.statsSettingsAPI.onUpdate((updatedSettings) => {
            if (updatedSettings) {
                this.state.updateSettings(updatedSettings);
                console.log("✅ Stats settings updated:", updatedSettings);
                console.log("📊 Stats list length now set to:", this.state.getListLength());
                this.renderer.render();
            }
        });

        // Oracle active stocks updates
        window.xpAPI.onActiveStocksUpdate((data) => {
            this.state.updateActiveStocks(data);
            this.renderer.render();
        });

        // State nuke
        window.electronAPI.onNukeState(() => {
            this.handleStateNuke();
        });
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");
    if (!container) {
        console.error("❌ Stats container not found");
        return;
    }

    try {
        // Initialize components
        const renderer = new StatsRenderer(state, container);
        const dataManager = new StatsDataManager(state, renderer);

        // Load all initial data
        await Promise.all([
            dataManager.loadSettings(),
            dataManager.loadTrackedTickers(),
            dataManager.loadInitialData(),
            dataManager.loadActiveStocks()
        ]);

        // Setup event listeners
        dataManager.setupEventListeners();

        // Initial render
        renderer.render();

        console.log("✅ Stats scroll initialized successfully");
    } catch (error) {
        console.error("❌ Failed to initialize stats scroll:", error);
    }
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Format price for display
function formatPrice(price) {
    return typeof price === "number" ? `$${price.toFixed(2)}` : "—";
}
