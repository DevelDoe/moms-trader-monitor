// symbolColors moved to Symbol component

// XP Sword trophy utility function - uses sword sprite
function getTrophyIcon(rank) {
    if (rank === 1) {
        return '<div class="trophy trophy-xp trophy-xp-gold" title="XP Rank 1"></div>';
    } else if (rank === 2) {
        return '<div class="trophy trophy-xp trophy-xp-silver" title="XP Rank 2"></div>';
    } else if (rank === 3) {
        return '<div class="trophy trophy-xp trophy-xp-bronze" title="XP Rank 3"></div>';
    }
    return '';
}

// Oracle XP Active Stocks data
let oracleActiveStocks = null;

// Sorting removed - backend sends data pre-sorted

// Trophy hash tracking
let lastTrophyHash = null;

function getSymbolLength() {
    return Math.max(1, Number(window.xpSettings?.listLength) || 25);
}

// Sorting functions removed - backend handles sorting

async function refreshList() {
    if (!oracleActiveStocks?.symbols || oracleActiveStocks.symbols.length === 0) {
        const container = document.getElementById("xp-scroll");
        if (container) {
            container.innerHTML = '<div class="loading-message">Waiting for Oracle data...</div>';
        }
        return;
    }

    // Ensure we have the latest settings
    if (!window.xpSettings) {
        console.warn("XP settings not loaded yet, using fallback");
        window.xpSettings = { listLength: 25, showHeaders: true };
    }

    const viewList = oracleActiveStocks.symbols
        .slice(0, getSymbolLength())
        .map((s, index) => {
            // Debug logging to see the actual data structure
            if (index === 0) {
                console.log("🔍 First symbol data structure:", s);
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

    // Use data as-is from backend (already sorted)
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
            await window.xpTop3API.set(top3Trophies);
            console.log("🏆 XP Top3 data updated in store:", top3Trophies);
            console.log("🔑 Trophy hash changed:", lastTrophyHash, "→", currentTrophyHash);
            lastTrophyHash = currentTrophyHash;
        } catch (error) {
            console.error("❌ Failed to send XP top3 data to store:", error);
        }
    } else {
        console.log("🏆 XP Top3 symbols unchanged, skipping update:", currentTrophyHash);
    }

    const container = document.getElementById("xp-scroll");
    if (!container) return;

    // Check if headers should be shown based on settings
    const showHeaders = window.xpSettings?.showHeaders === true; // Only show if explicitly true
    
    console.log("🔍 XP Settings for headers:", { 
        showHeaders, 
        xpSettings: window.xpSettings,
        showHeadersValue: window.xpSettings?.showHeaders 
    });
    
    const headersHtml = showHeaders ? `
        <thead>
            <tr class="xp-header-row">
                <th class="xp-header-cell" title="Rank Position">
                    #
                </th>
                <th class="xp-header-cell xp-header-cell-symbol">
                    Symbol
                </th>
                ${window.xpSettings?.showUpXp !== false ? `<th class="xp-header-cell xp-header-cell-right xp-header-cell-narrow">
                    Up XP
                </th>` : ''}
                ${window.xpSettings?.showDownXp !== false ? `<th class="xp-header-cell xp-header-cell-right xp-header-cell-narrow">
                    Down XP
                </th>` : ''}
                ${window.xpSettings?.showRatio !== false ? `<th class="xp-header-cell xp-header-cell-right xp-header-cell-wide">
                    Ratio
                </th>` : ''}
                ${window.xpSettings?.showTotal !== false ? `<th class="xp-header-cell xp-header-cell-right xp-header-cell-narrow">
                    Total
                </th>` : ''}
                ${window.xpSettings?.showNet !== false ? `<th class="xp-header-cell xp-header-cell-right xp-header-cell-narrow xp-header-net">
                    Net XP <span class="xp-header-arrow">↓</span>
                </th>` : ''}
                ${window.xpSettings?.showTotalVolume !== false ? `<th class="xp-header-cell xp-header-cell-right xp-header-cell-narrow">
                    Volume
                </th>` : ''}
                ${window.xpSettings?.showLevel !== false ? `<th class="xp-header-cell xp-header-cell-right xp-header-cell-narrow">
                    Level
                </th>` : ''}
                ${window.xpSettings?.showPrice !== false ? `<th class="xp-header-cell xp-header-cell-right xp-header-cell-narrow">
                    Price
                </th>` : ''}
                ${window.xpSettings?.showSessionChange !== false ? `<th class="xp-header-cell xp-header-cell-right xp-header-cell-wide xp-header-change">
                    Change % <span class="xp-header-arrow">↓</span>
                </th>` : ''}
            </tr>
        </thead>
    ` : '';

    container.innerHTML = `
        <table class="xp-table">
            ${headersHtml}
            <tbody>
                ${sortedList.map((h, i) => {
                    const isFirstRow = i === 0;
                    const cellClass = isFirstRow ? 'xp-body-cell-first' : 'xp-body-cell-normal';
                    const ratioColorClass = h.up > h.down ? 'xp-value-positive' : 'xp-value-negative';
                    const changeColorClass = h.sessionChangePercent > 0 ? 'xp-value-positive' : h.sessionChangePercent < 0 ? 'xp-value-negative' : 'xp-value-neutral';
                    
                    return `
                        <tr class="xp-body-row">
                            <td class="xp-body-cell ${cellClass} xp-body-cell-rank" title="Rank Position">
                                <div class="rank-cell">
                                    ${i < 3 ? getTrophyIcon(i + 1) : `<span>${i + 1}</span>`}
                                </div>
                            </td>
                            <td class="xp-body-cell ${cellClass}" title="Symbol">
                                ${window.components.Symbol({ 
                                    symbol: h.hero, 
                                    size: "medium",
                                    onClick: true
                                })}
                            </td>
                            ${window.xpSettings?.showUpXp !== false ? `<td class="xp-body-cell ${cellClass} xp-body-cell-center xp-value-up" title="Up XP">${abbreviateXp(h.up)}</td>` : ''}
                            ${window.xpSettings?.showDownXp !== false ? `<td class="xp-body-cell ${cellClass} xp-body-cell-center xp-value-down" title="Down XP">${abbreviateXp(h.down)}</td>` : ''}
                            ${window.xpSettings?.showRatio !== false ? `<td class="xp-body-cell ${cellClass} xp-body-cell-center" title="Up/Down XP Ratio">
                                <span class="${ratioColorClass}">${h.up + h.down > 0 ? Math.round(((h.up - h.down) / (h.up + h.down)) * 100) : 0}%</span>
                            </td>` : ''}
                            ${window.xpSettings?.showTotal !== false ? `<td class="xp-body-cell ${cellClass} xp-body-cell-center xp-value-total" title="Total XP Gained">${abbreviateXp(h.total)}</td>` : ''}
                            ${window.xpSettings?.showNet !== false ? `<td class="xp-body-cell ${cellClass} xp-body-cell-center xp-value-net" title="Net XP">${abbreviateXp(h.net)}</td>` : ''}
                            ${window.xpSettings?.showTotalVolume !== false ? `<td class="xp-body-cell ${cellClass} xp-body-cell-center xp-value-volume" title="Total Volume">${abbreviateVolume(h.totalVolume)}</td>` : ''}
                            ${window.xpSettings?.showLevel !== false ? `<td class="xp-body-cell ${cellClass} xp-body-cell-center xp-value-level" title="Level">${h.level}</td>` : ''}
                            ${window.xpSettings?.showPrice !== false ? `<td class="xp-body-cell ${cellClass} xp-body-cell-center xp-value-price" title="Last Price">$${h.price.toFixed(2)}</td>` : ''}
                            ${window.xpSettings?.showSessionChange !== false ? `<td class="xp-body-cell ${cellClass} xp-body-cell-center ${changeColorClass}" title="Session Change Percentage">${h.sessionChangePercent >= 0 ? '+' : ''}${h.sessionChangePercent.toFixed(2)}%</td>` : ''}
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    // Symbol click handling is now done by the component
    // Sorting removed - backend handles sorting
}

document.addEventListener("DOMContentLoaded", async () => {
    // Initialize header component
    const headerContainer = document.getElementById('header-container');
    if (headerContainer && window.HeaderComponent) {
        window.xpHeader = new window.HeaderComponent(headerContainer, {
            icon: '🏆',
            text: 'Hall of Legends (XP)',
            className: 'xp-header'
        });
    }

    const container = document.getElementById("xp-scroll");
    if (!container) return;

    // Set up event delegation for symbol clicks
    document.addEventListener('click', function(event) {
        const symbolElement = event.target.closest('.symbol[data-clickable="true"]');
        if (symbolElement) {
            const symbol = symbolElement.getAttribute('data-symbol');
            if (symbol) {
                console.log(`🖱️ [XP] Symbol clicked: ${symbol}`);
                window.handleSymbolClick(symbol, event);
            }
        }
    });

    // Wait for activeAPI to be available
    while (!window.activeAPI) {
        await new Promise((r) => setTimeout(r, 100));
    }
    console.log("✅ XP view - activeAPI is now available");

    // Load XP settings from electron store first
    try {
        window.xpSettings = await window.xpSettingsAPI.get();
        console.log("📊 Loaded XP settings:", window.xpSettings);
    } catch (e) {
        console.warn("Failed to get XP settings:", e);
        window.xpSettings = { 
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
        oracleActiveStocks = await window.xpAPI.getActiveStocks();
        console.log("📊 Initial Oracle XP data requested");
    } catch (e) {
        console.warn("Failed to get initial Oracle XP data:", e);
    }

    // Listen for Oracle XP updates
    window.xpAPI.onActiveStocksUpdate((data) => {
        oracleActiveStocks = data;
        console.log("🎯 Oracle XP Active Stocks Update Received");
        refreshList();
    });

    // Initial render
    refreshList();

    // XP Settings updates
    window.xpSettingsAPI.onUpdate(async (updatedSettings) => {
        console.log("⚙️ XP Settings update received:", updatedSettings);
        window.xpSettings = updatedSettings;
        console.log("⚙️ XP Settings updated:", updatedSettings);
        refreshList();
    });

    // XP reset
    window.electronAPI.onXpReset(() => {
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
