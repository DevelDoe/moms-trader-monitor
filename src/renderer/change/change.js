// symbolColors moved to Symbol component

// Trophy utility function - can be reused throughout the application
function getTrophyIcon(rank) {
    if (rank === 1) {
        return '<img src="./img/gold-cup.png" alt="Gold Trophy" class="trophy trophy-gold" width="24" height="24">';
    } else if (rank === 2) {
        return '<img src="./img/silver-cup.png" alt="Silver Trophy" class="trophy trophy-silver" width="24" height="24">';
    } else if (rank === 3) {
        return '<img src="./img/bronze-cup.png" alt="Bronze Trophy" class="trophy trophy-bronze" width="24" height="24">';
    }
    return '';
}

// Oracle Change Active Stocks data
let oracleActiveStocks = null;

// Trophy hash tracking
let lastTrophyHash = null;

function getSymbolLength() {
    return Math.max(1, Number(window.changeSettings?.listLength) || 25);
}

async function refreshList() {
    if (!oracleActiveStocks?.symbols || oracleActiveStocks.symbols.length === 0) {
        const container = document.getElementById("change-scroll");
        if (container) {
            container.innerHTML = '<div class="loading-message">Waiting for Oracle data...</div>';
        }
        return;
    }

    // Ensure we have the latest settings
    if (!window.changeSettings) {
        console.warn("Change settings not loaded yet, using fallback");
        window.changeSettings = { listLength: 25, showHeaders: true };
    }

    const viewList = oracleActiveStocks.symbols
        .slice(0, getSymbolLength())
        .map((s, index) => {
            // Debug logging to see the actual data structure
            if (index === 0) {
                console.log("🔍 First symbol data structure (Change View):", s);
                console.log("🔍 Available fields:", Object.keys(s));
                console.log("🔍 Volume-related fields:", Object.keys(s).filter(key => key.toLowerCase().includes('volume')));
                console.log("🔍 Level-related fields:", Object.keys(s).filter(key => key.toLowerCase().includes('level') || key.toLowerCase().includes('lv')));
                console.log("🔍 All field values:", Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? v : String(v).substring(0, 50)])));
            }
            
            return {
                hero: s.symbol,
                up: s.up_xp || 0,
                down: s.down_xp || 0,
                total: s.total_xp_gained || 0,
                net: s.net_xp || 0,
                price: s.last_price || 0,
                totalVolume: s.one_min_volume || s.total_volume || s.volume || s.fiveMinVolume || s.strength || 0,
                level: s.lv || s.level || 0,
                sessionChangePercent: s.session_change_percent || 0,
                rank: index + 1
            };
        });

    // Use data as-is from backend (already sorted by session_change_percent)
    const sortedList = viewList;

    // Extract top 3 symbols for trophy data
    const top3Trophies = sortedList.slice(0, 3).map((item, index) => ({
        symbol: item.hero,
        rank: index + 1,
        trophy: getTrophyIcon(index + 1)
    }));

    // Create hash of top 3 symbols to detect changes
    const currentTrophyHash = top3Trophies.map(t => t.symbol).join('|');
    
    // Only update if the symbols have changed
    if (currentTrophyHash !== lastTrophyHash) {
        try {
            await window.changeTop3API.set(top3Trophies);
            console.log("🏆 Change Top3 data updated in store:", top3Trophies);
            console.log("🔑 Trophy hash changed:", lastTrophyHash, "→", currentTrophyHash);
            lastTrophyHash = currentTrophyHash;
        } catch (error) {
            console.error("❌ Failed to send Change top3 data to store:", error);
        }
    } else {
        console.log("🏆 Change Top3 symbols unchanged, skipping update:", currentTrophyHash);
    }

    const container = document.getElementById("change-scroll");
    if (!container) return;

    // Check if headers should be shown based on settings
    const showHeaders = window.changeSettings?.showHeaders === true; // Only show if explicitly true
    
    console.log("🔍 Change Settings for headers:", { 
        showHeaders, 
        changeSettings: window.changeSettings,
        showHeadersValue: window.changeSettings?.showHeaders 
    });
    
    const headersHtml = showHeaders ? `
        <thead>
            <tr class="change-header-row">
                <th class="change-header-cell" title="Rank Position">
                    #
                </th>
                <th class="change-header-cell change-header-cell-symbol">
                    Symbol
                </th>
                ${window.changeSettings?.showSessionChange !== false ? `<th class="change-header-cell change-header-cell-right change-header-cell-wide change-header-change">
                    Change % <span class="change-header-arrow">↓</span>
                </th>` : ''}
                ${window.changeSettings?.showUpXp !== false ? `<th class="change-header-cell change-header-cell-right change-header-cell-narrow">
                    Up XP
                </th>` : ''}
                ${window.changeSettings?.showDownXp !== false ? `<th class="change-header-cell change-header-cell-right change-header-cell-narrow">
                    Down XP
                </th>` : ''}
                ${window.changeSettings?.showRatio !== false ? `<th class="change-header-cell change-header-cell-right change-header-cell-wide">
                    Ratio
                </th>` : ''}
                ${window.changeSettings?.showTotal !== false ? `<th class="change-header-cell change-header-cell-right change-header-cell-narrow">
                    Total
                </th>` : ''}
                ${window.changeSettings?.showNet !== false ? `<th class="change-header-cell change-header-cell-right change-header-cell-narrow">
                    Net
                </th>` : ''}
                ${window.changeSettings?.showTotalVolume !== false ? `<th class="change-header-cell change-header-cell-right change-header-cell-narrow">
                    Volume
                </th>` : ''}
                ${window.changeSettings?.showLevel !== false ? `<th class="change-header-cell change-header-cell-right change-header-cell-narrow">
                    Level
                </th>` : ''}
                ${window.changeSettings?.showPrice !== false ? `<th class="change-header-cell change-header-cell-right change-header-cell-narrow">
                    Price
                </th>` : ''}
            </tr>
        </thead>
    ` : '';

    container.innerHTML = `
        <table class="change-table">
            ${headersHtml}
            <tbody>
                ${sortedList.map((h, i) => {
                    const isFirstRow = i === 0;
                    const cellClass = isFirstRow ? 'change-body-cell-first' : 'change-body-cell-normal';
                    const ratioColorClass = h.up > h.down ? 'change-value-positive' : 'change-value-negative';
                    const changeColorClass = h.sessionChangePercent > 0 ? 'change-value-positive' : h.sessionChangePercent < 0 ? 'change-value-negative' : 'change-value-neutral';
                    
                    return `
                        <tr class="change-body-row">
                            <td class="change-body-cell ${cellClass} change-body-cell-rank" title="Rank Position">
                                <div class="rank-cell">
                                    ${i < 3 ? getTrophyIcon(i + 1) : `<span>${i + 1}</span>`}
                                </div>
                            </td>
                            <td class="change-body-cell ${cellClass}" title="Symbol">
                                ${window.components.Symbol({ 
                                    symbol: h.hero, 
                                    size: "medium",
                                    onClick: true
                                })}
                            </td>
                            ${window.changeSettings?.showSessionChange !== false ? `<td class="change-body-cell ${cellClass} change-body-cell-center ${changeColorClass}" title="Session Change Percentage">${h.sessionChangePercent >= 0 ? '+' : ''}${h.sessionChangePercent.toFixed(2)}%</td>` : ''}
                            ${window.changeSettings?.showUpXp !== false ? `<td class="change-body-cell ${cellClass} change-body-cell-center change-value-up" title="Up XP">${abbreviateXp(h.up)}</td>` : ''}
                            ${window.changeSettings?.showDownXp !== false ? `<td class="change-body-cell ${cellClass} change-body-cell-center change-value-down" title="Down XP">${abbreviateXp(h.down)}</td>` : ''}
                            ${window.changeSettings?.showRatio !== false ? `<td class="change-body-cell ${cellClass} change-body-cell-center" title="Up/Down XP Ratio">
                                <span class="${ratioColorClass}">${h.up + h.down > 0 ? Math.round(((h.up - h.down) / (h.up + h.down)) * 100) : 0}%</span>
                            </td>` : ''}
                            ${window.changeSettings?.showTotal !== false ? `<td class="change-body-cell ${cellClass} change-body-cell-center change-value-total" title="Total XP Gained">${abbreviateXp(h.total)}</td>` : ''}
                            ${window.changeSettings?.showNet !== false ? `<td class="change-body-cell ${cellClass} change-body-cell-center change-value-net" title="Net XP">${abbreviateXp(h.net)}</td>` : ''}
                            ${window.changeSettings?.showTotalVolume !== false ? `<td class="change-body-cell ${cellClass} change-body-cell-center change-value-volume" title="Total Volume">${abbreviateVolume(h.totalVolume)}</td>` : ''}
                            ${window.changeSettings?.showLevel !== false ? `<td class="change-body-cell ${cellClass} change-body-cell-center change-value-level" title="Level">${h.level}</td>` : ''}
                            ${window.changeSettings?.showPrice !== false ? `<td class="change-body-cell ${cellClass} change-body-cell-center change-value-price" title="Last Price">$${h.price.toFixed(2)}</td>` : ''}
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    // Symbol click handling is now done by the component
}

document.addEventListener("DOMContentLoaded", async () => {
    // Initialize header component
    const headerContainer = document.getElementById('header-container');
    if (headerContainer && window.HeaderComponent) {
        window.changeHeader = new window.HeaderComponent(headerContainer, {
            icon: '🏆',
            text: 'Hall of legends (change)',
            className: 'change-header'
        });
    }

    const container = document.getElementById("change-scroll");
    if (!container) return;

    // Set up event delegation for symbol clicks
    document.addEventListener('click', function(event) {
        const symbolElement = event.target.closest('.symbol[data-clickable="true"]');
        if (symbolElement) {
            const symbol = symbolElement.getAttribute('data-symbol');
            if (symbol) {
                console.log(`🖱️ [Change] Symbol clicked: ${symbol}`);
                window.handleSymbolClick(symbol, event);
            }
        }
    });

    // Wait for activeAPI to be available
    while (!window.activeAPI) {
        await new Promise((r) => setTimeout(r, 100));
    }
    console.log("✅ Change view - activeAPI is now available");

    // Load Change settings from electron store first
    try {
        window.changeSettings = await window.changeSettingsAPI.get();
        console.log("📊 Loaded Change settings:", window.changeSettings);
    } catch (e) {
        console.warn("Failed to get Change settings:", e);
        window.changeSettings = { 
            listLength: 25, 
            showHeaders: true,
            showUpXp: true,
            showDownXp: true,
            showRatio: true,
            showTotal: true,
            showNet: true,
            showPrice: true,
            showTotalVolume: true,
            showLevel: true,
            showSessionChange: true
        }; // fallback
    }

    // Request current Oracle data
    try {
        oracleActiveStocks = await window.changeAPI.getActiveStocks();
        console.log("📊 Initial Oracle Change data requested");
    } catch (e) {
        console.warn("Failed to get initial Oracle Change data:", e);
    }

    // Listen for Oracle Change updates
    window.changeAPI.onActiveStocksUpdate((data) => {
        oracleActiveStocks = data;
        console.log("🎯 Oracle Change Active Stocks Update Received");
        refreshList();
    });

    // Initial render
    refreshList();

    // Change Settings updates
    window.changeSettingsAPI.onUpdate(async (updatedSettings) => {
        console.log("⚙️ Change Settings update received:", updatedSettings);
        window.changeSettings = updatedSettings;
        console.log("⚙️ Change Settings updated:", updatedSettings);
        refreshList();
    });

    // Change reset
    window.electronAPI.onChangeReset(() => {
        oracleActiveStocks = null;
        refreshList();
    });
});

// -------------------- helpers --------------------

// getSymbolColor function moved to Symbol component

function abbreviateXp(num) {
    const isNegative = num < 0;
    const absNum = Math.abs(num);
    
    let result;
    if (absNum < 100) result = String(absNum);
    else if (absNum < 1_000) result = (absNum / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    else if (absNum < 1_000_000) result = (absNum / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    else if (absNum < 1_000_000_000) result = (absNum / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    else result = (absNum / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
    
    return isNegative ? "-" + result : result;
}

function abbreviateVolume(num) {
    if (num < 1_000) return num.toString();
    else if (num < 1_000_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    else if (num < 1_000_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    else return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
}
