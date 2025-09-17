// ============================================================================
// STATS SCROLL - REFACTORED VERSION
// ============================================================================
// This module manages the stats scroll view that displays ranked active stocks
// based on their calculated scores from buffs and XP data.

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const TOP3_DEBOUNCE_MS = 150;
const RENDER_DEBOUNCE_MS = 50; // Debounce rapid re-renders

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

class StatsState {
    constructor() {
        this.globalBuffs = {};
        this.trackedTickers = [];
        this.activeStocksData = null;
        this.heroes = {};
        this.renderKey = "";
        this.top3Debounce = null;
        this.renderDebounce = null;
        this.settings = { listLength: 50 };
        this.activeSymbolsSet = new Set(); // Cache for O(1) lookups
    }

    // Utility function to normalize symbol names
    normalizeSymbol(symbol) {
        return String(symbol || "").toUpperCase();
    }

    // Get the configured list length (no longer used since backend controls list size)
    getListLength() {
        return Math.max(1, Number(this.settings?.listLength) || 50);
    }

    // Update tracked tickers from store
    updateTrackedTickers(tickers) {
        this.trackedTickers = (tickers || []).map(t => this.normalizeSymbol(t));
    }

    // Update active stocks data from Oracle
    updateActiveStocks(data) {
        this.activeStocksData = data;
        // Update symbol set for O(1) lookups
        this.activeSymbolsSet.clear();
        if (data?.symbols) {
            data.symbols.forEach(s => this.activeSymbolsSet.add(s.symbol));
        }
        // Debug logging removed for performance
    }

    // Update settings
    updateSettings(newSettings) {
        this.settings = newSettings || { listLength: 50 };
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

    // Get ranked heroes from active stocks (optimized filtering)
    getRankedHeroes() {
        // Use Set for O(1) lookups instead of O(n) array.some()
        const activeHeroes = Object.values(this.state.heroes).filter(h => 
            this.state.activeSymbolsSet.has(h.hero)
        );

        // Calculate scores for all active heroes
        const scored = activeHeroes.map((h) => {
            const newScore = this.calculateScore(h.buffs, h.score || 0);
            
            // Debug VSTD specifically
            if (h.hero === 'VSTD') {
                console.log('[VSTD DEBUG] VSTD score calculation:', {
                    hero: h.hero,
                    baseScore: h.score,
                    buffs: h.buffs,
                    calculatedScore: newScore
                });
            }
            
            return {
                ...h,
                score: newScore,
            };
        });

        // Sort by score (descending) and limit to configured list length
        const ranked = scored
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, this.state.getListLength());

        // Debug: Show VSTD's position in rankings
        const vstdRank = ranked.findIndex(h => h.hero === 'VSTD');
        if (vstdRank !== -1) {
            console.log(`[VSTD DEBUG] VSTD is ranked #${vstdRank + 1} with score ${ranked[vstdRank].score}`);
        } else {
            console.log('[VSTD DEBUG] VSTD is not in top rankings (score too low)');
        }

        // Debug: Check what's being sent to the rating store
        console.log('[RATING DEBUG] Top 10 ranked heroes being sent to store:', ranked.slice(0, 10).map(h => ({ symbol: h.hero, score: h.score })));
        
        // Debug: Check what's in the change top3 store (where VSTD might be getting its medal from)
        window.changeTop3API?.get?.().then(data => {
            console.log('[CHANGE TOP3 DEBUG] Current change top3 store data:', data);
            const vstdInChangeStore = data?.entries?.find(e => e.symbol === 'VSTD');
            if (vstdInChangeStore) {
                console.log('[VSTD DEBUG] VSTD found in CHANGE store:', vstdInChangeStore);
            } else {
                console.log('[VSTD DEBUG] VSTD NOT found in CHANGE store');
            }
        });

        return ranked;
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

    // Symbol color generation is now handled by the symbol component

    // Render the stats list (with debouncing)
    render() {
        // Debounce rapid re-renders
        clearTimeout(this.state.renderDebounce);
        this.state.renderDebounce = setTimeout(() => {
            this._doRender();
        }, RENDER_DEBOUNCE_MS);
    }

    // Internal render method (debounced)
    _doRender() {
        const rankedHeroes = this.scorer.getRankedHeroes();
        
        // Optimized render key generation - use fewer decimal places
        const renderKey = rankedHeroes
            .map((h) => `${h.hero}:${Math.round(h.score)}`)
            .join(",");
        
        if (renderKey === this.state.renderKey) return;
        this.state.renderKey = renderKey;

        // Create tiered ranking and update top3 data
        const tieredRanking = this.updateTop3(rankedHeroes);

        // Generate HTML with tiered ranking
        const now = Date.now();
        this.container.innerHTML = rankedHeroes
            .map((hero, idx) => this.renderHeroRow(hero, idx, now, tieredRanking))
            .join("");

        // Attach click handlers
        this.attachClickHandlers();
    }

    // Render individual hero row with tiered ranking
    renderHeroRow(hero, idx, now, tieredRanking) {
        const displayScore = (hero.score / 10).toFixed(1);
        
        // Get tier information for this hero
        const tierInfo = tieredRanking.find(t => t.symbol === hero.hero);
        let rankIcon;
        
        if (tierInfo) {
            // Use tier-based medals
            if (tierInfo.tier === 1) {
                rankIcon = "🥇"; // Gold for 1st tier
            } else if (tierInfo.tier === 2) {
                rankIcon = "🥈"; // Silver for 2nd tier  
            } else if (tierInfo.tier === 3) {
                rankIcon = "🥉"; // Bronze for 3rd tier
            } else {
                rankIcon = tierInfo.rank + "."; // Number for other tiers
            }
        } else {
            // Fallback to old system if tier info not available
            rankIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1 + ".";
        }
        
        // Generate tooltip content
        const tooltipContent = this.generateScoreTooltip(hero);

        return `
            <div class="xp-line ellipsis">
                <span class="text-tertiary" style="display:inline-block; min-width: 24px; text-align:right; margin-right: 4px; opacity: 1;">
                    ${rankIcon}
                </span>
                ${window.components.Symbol({ 
                    symbol: hero.hero, 
                    size: "medium",
                    onClick: true
                })}
                <span class="buffs" style="font-weight: 600;" title="${tooltipContent}">${displayScore}</span>
            </div>`;
    }

    // Update top 3 data for other components with tiered ranking
    updateTop3(rankedHeroes) {
        // Create tiered ranking data for all heroes
        const tieredRanking = this.createTieredRanking(rankedHeroes);
        
        // Send all tiered ranking data to the store
        clearTimeout(this.state.top3Debounce);
        this.state.top3Debounce = setTimeout(() => {
            try {
                window.top3API?.set?.(tieredRanking);
            } catch (error) {
                console.error("Failed to update rating top3:", error);
            }
        }, TOP3_DEBOUNCE_MS);
        
        return tieredRanking;
    }

    // Create tiered ranking from ranked heroes
    createTieredRanking(rankedHeroes) {
        if (!rankedHeroes || rankedHeroes.length === 0) {
            return [];
        }

        // Group by score to create tiers
        const scoreGroups = {};
        rankedHeroes.forEach((hero) => {
            const score = Number(hero.score) || 0;
            if (!scoreGroups[score]) {
                scoreGroups[score] = [];
            }
            scoreGroups[score].push({
                symbol: this.state.normalizeSymbol(hero.hero),
                score: score
            });
        });

        // Sort scores in descending order
        const sortedScores = Object.keys(scoreGroups)
            .map(Number)
            .sort((a, b) => b - a);

        // Assign ranks and tiers
        const result = [];
        let currentRank = 1;
        
        sortedScores.forEach((score, tierIndex) => {
            const symbols = scoreGroups[score];
            symbols.forEach((symbolData) => {
                result.push({
                    symbol: symbolData.symbol,
                    rank: currentRank,
                    score: symbolData.score,
                    tier: tierIndex + 1 // 1st tier, 2nd tier, 3rd tier, etc.
                });
            });
            currentRank += symbols.length; // Next rank starts after all symbols in this tier
        });

        return result;
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

    // Attach click handlers to symbols (now handled by symbol component)
    attachClickHandlers() {
        // Click handling is now done by the symbol component internally
        // No additional click handlers needed
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
            const statsSettings = await window.statsSettingsAPI.get();
            this.state.updateSettings(statsSettings);
            // Settings loaded successfully
        } catch (error) {
            console.error("❌ Failed to load settings:", error);
            this.state.updateSettings({ listLength: 50 });
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

            // Initial data loaded successfully
        } catch (error) {
            console.error("❌ Failed to load initial data:", error);
        }
    }

    // Load initial Oracle active stocks data
    async loadActiveStocks() {
        try {
            const activeStocks = await window.xpAPI.getActiveStocks();
            this.state.updateActiveStocks(activeStocks);
            // Oracle data loaded successfully
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
                // Buff change detection optimized - no expensive JSON.stringify
                // Just update the buffs without logging for performance
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

        // Settings are now managed by Electron stores

        // Stats settings updates
        window.statsSettingsAPI.onUpdate((updatedSettings) => {
            if (updatedSettings) {
                this.state.updateSettings(updatedSettings);
                // Stats settings updated successfully
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

    // Set up event delegation for symbol clicks
    document.addEventListener('click', function(event) {
        const symbolElement = event.target.closest('.symbol[data-clickable="true"]');
        if (symbolElement) {
            const symbol = symbolElement.getAttribute('data-symbol');
            if (symbol) {
                console.log(`🖱️ [Rating] Symbol clicked: ${symbol}`);
                window.handleSymbolClick(symbol, event);
            }
        }
    });

    // Wait for activeAPI to be available
    while (!window.activeAPI) {
        await new Promise((r) => setTimeout(r, 100));
    }
    console.log("✅ Rating view - activeAPI is now available");

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

        // Stats scroll initialized successfully
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
