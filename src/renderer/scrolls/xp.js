const symbolColors = {};

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

// Oracle XP Active Stocks data
let oracleActiveStocks = null;

// Sorting state
let currentSort = { column: 'net', direction: 'desc' };

// Trophy hash tracking
let lastTrophyHash = null;

function getSymbolLength() {
    return Math.max(1, Number(window.xpSettings?.listLength) || 25);
}

function sortData(data, column, direction) {
    return [...data].sort((a, b) => {
        let aVal, bVal;
        
        switch (column) {
            case 'symbol':
                aVal = a.hero.toLowerCase();
                bVal = b.hero.toLowerCase();
                break;
            case 'upDownRatio':
                aVal = a.up + a.down > 0 ? (a.up / (a.up + a.down)) : 0;
                bVal = b.up + b.down > 0 ? (b.up / (b.up + b.down)) : 0;
                break;
            case 'total':
                aVal = a.total;
                bVal = b.total;
                break;
            case 'net':
                aVal = a.net;
                bVal = b.net;
                break;
            case 'price':
                aVal = a.price;
                bVal = b.price;
                break;
            case 'totalVolume':
                aVal = a.totalVolume;
                bVal = b.totalVolume;
                break;
            case 'level':
                aVal = a.level;
                bVal = b.level;
                break;
            default:
                return 0;
        }
        
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function getSortIcon(column) {
    if (currentSort.column !== column) {
        return '↕️'; // Neutral sort icon
    }
    return currentSort.direction === 'asc' ? '↑' : '↓';
}

function handleSort(column) {
    if (currentSort.column === column) {
        // Toggle direction if same column
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // New column, default to ascending
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    refreshList();
}

async function refreshList() {
    if (!oracleActiveStocks?.symbols || oracleActiveStocks.symbols.length === 0) {
        const container = document.getElementById("xp-scroll");
        if (container) {
            container.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">Waiting for Oracle data...</div>';
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
                totalVolume: s.one_min_volume ||    s.total_volume || s.volume || s.fiveMinVolume || s.strength || 0,
                level: s.lv || s.level || 0,
                rank: index + 1
            };
        });

    // Always apply current sorting to the data before rendering
    const sortedList = sortData(viewList, currentSort.column, currentSort.direction);

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
            await window.storeAPI.updateTrophyData(top3Trophies);
            console.log("🏆 Trophy data updated in store:", top3Trophies);
            console.log("🔑 Trophy hash changed:", lastTrophyHash, "→", currentTrophyHash);
            lastTrophyHash = currentTrophyHash;
        } catch (error) {
            console.error("❌ Failed to send trophy data to store:", error);
        }
    } else {
        console.log("🏆 Trophy symbols unchanged, skipping update:", currentTrophyHash);
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
            <tr style="border-bottom: 1px solid #333;">
                <th style="text-align: left; padding: 6px 8px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; transition: all 0.2s ease; user-select: none; backdrop-filter: blur(5px);" title="Rank Position">
                    #
                </th>
                <th class="${currentSort.column === 'symbol' ? 'sort-active' : ''}" data-sort="symbol" style="text-align: left; padding: 6px 8px; color: #666;  text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; transition: all 0.2s ease; user-select: none; backdrop-filter: blur(5px);" title="Click to sort by Symbol">
                    Symbol <span class="sort-icon">${getSortIcon('symbol')}</span>
                </th>
                ${window.xpSettings?.showUpXp !== false ? `<th class="${currentSort.column === 'up' ? 'sort-active' : ''}" data-sort="up" style="text-align: right; padding: 6px 8px; color: #666;  text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; transition: all 0.2s ease; user-select: none; backdrop-filter: blur(5px);" title="Click to sort by Up XP">
                    Up XP<span class="sort-icon">${getSortIcon('up')}</span>
                </th>` : ''}
                ${window.xpSettings?.showDownXp !== false ? `<th class="${currentSort.column === 'down' ? 'sort-active' : ''}" data-sort="down" style="text-align: right; padding: 6px 8px; color: #666;  text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; transition: all 0.2s ease; user-select: none; backdrop-filter: blur(5px);" title="Click to sort by Down XP">
                    Down XP<span class="sort-icon">${getSortIcon('down')}</span>
                </th>` : ''}
                ${window.xpSettings?.showRatio !== false ? `<th class="${currentSort.column === 'upDownRatio' ? 'sort-active' : ''}" data-sort="upDownRatio" style="text-align: right; padding: 6px 8px; color: #666;    text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; transition: all 0.2s ease; user-select: none; backdrop-filter: blur(5px);" title="Click to sort by Net XP Ratio">
                    Ratio <span class="sort-icon">${getSortIcon('upDownRatio')}</span>
                </th>` : ''}
                ${window.xpSettings?.showTotal !== false ? `<th class="${currentSort.column === 'total' ? 'sort-active' : ''}" data-sort="total" style="text-align: right; padding: 6px 8px; color: #666;  text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; transition: all 0.2s ease; user-select: none; backdrop-filter: blur(5px);" title="Click to sort by Total XP">
                    Total <span class="sort-icon">${getSortIcon('total')}</span>
                </th>` : ''}
                ${window.xpSettings?.showNet !== false ? `<th class="${currentSort.column === 'net' ? 'sort-active' : ''}" data-sort="net" style="text-align: right; padding: 6px 8px; color: #666;  text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; transition: all 0.2s ease; user-select: none; backdrop-filter: blur(5px);" title="Click to sort by Net XP">
                    Net <span class="sort-icon">${getSortIcon('net')}</span>
                </th>` : ''}
                ${window.xpSettings?.showTotalVolume !== false ? `<th class="${currentSort.column === 'totalVolume' ? 'sort-active' : ''}" data-sort="totalVolume" style="text-align: right; padding: 6px 8px; color: #666;  text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; transition: all 0.2s ease; user-select: none; backdrop-filter: blur(5px);" title="Click to sort by Total Volume">
                    Volume <span class="sort-icon">${getSortIcon('totalVolume')}</span>
                </th>` : ''}
                ${window.xpSettings?.showLevel !== false ? `<th class="${currentSort.column === 'level' ? 'sort-active' : ''}" data-sort="level" style="text-align: right; padding: 6px 8px; color: #666;  text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; transition: all 0.2s ease; user-select: none; backdrop-filter: blur(5px);" title="Click to sort by Level">
                    Level <span class="sort-icon">${getSortIcon('level')}</span>
                </th>` : ''}
                ${window.xpSettings?.showPrice !== false ? `<th class="${currentSort.column === 'price' ? 'sort-active' : ''}" data-sort="price" style="text-align: right; padding: 6px 8px; color: #666;  text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; transition: all 0.2s ease; user-select: none; backdrop-filter: blur(5px);" title="Click to sort by Price">
                    Price <span class="sort-icon">${getSortIcon('price')}</span>
                </th>` : ''}
            </tr>
        </thead>
    ` : '';

    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 16px; border-radius: 1px; overflow: hidden; background: transparent; backdrop-filter: blur(10px); ">
            ${headersHtml}
            <tbody>
                ${sortedList.map((h, i) => {
                    const bg = getSymbolColor(h.hero);
                    return `
                        <tr style="border-bottom: 1px solid #222; transition: all 0.2s ease;">
                            <td style="padding: 6px 8px; color: #666; text-align: right;" title="Rank Position">
                                <div class="rank-cell">
                                    ${i < 3 ? getTrophyIcon(i + 1) : `<span>${i + 1}</span>`}
                                </div>
                            </td>
                            <td style="padding: 6px 8px;" title="Symbol">
                                <span class="symbol" style="background: ${bg}; padding: 2px 4px; border-radius: 1px; cursor: pointer;">
                                    ${h.hero}
                                </span>
                            </td>
                            ${window.xpSettings?.showUpXp !== false ? `<td style="padding: 6px 8px; text-align: right; color: #00ff00;" title="Up XP">${abbreviateXp(h.up)}</td>` : ''}
                            ${window.xpSettings?.showDownXp !== false ? `<td style="padding: 6px 8px; text-align: right; color: #ff0000;" title="Down XP">${abbreviateXp(h.down)}</td>` : ''}
                            ${window.xpSettings?.showRatio !== false ? `<td style="padding: 6px 8px; text-align: right;" title="Up/Down XP Ratio">
                                <span style="color: ${h.up > h.down ? '#00ff00' : '#ff0000'};">${h.up + h.down > 0 ? Math.round(((h.up - h.down) / (h.up + h.down)) * 100) : 0}%</span>
                            </td>` : ''}
                            ${window.xpSettings?.showTotal !== false ? `<td style="padding: 6px 8px; text-align: right; color: #00aeff;" title="Total XP Gained">${abbreviateXp(h.total)}</td>` : ''}
                            ${window.xpSettings?.showNet !== false ? `<td style="padding: 6px 8px; text-align: right; color: #ffff00;" title="Net XP">${abbreviateXp(h.net)}</td>` : ''}
                            ${window.xpSettings?.showTotalVolume !== false ? `<td style="padding: 6px 8px; text-align: right; color: #00ff00;" title="Total Volume">${abbreviateVolume(h.totalVolume)}</td>` : ''}
                            ${window.xpSettings?.showLevel !== false ? `<td style="padding: 6px 8px; text-align: right; color: #00aeff;" title="Level">${h.level}</td>` : ''}
                            ${window.xpSettings?.showPrice !== false ? `<td style="padding: 6px 8px; text-align: right; color: #ffffff;" title="Last Price">$${h.price.toFixed(2)}</td>` : ''}
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    // Click → copy + set active
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

    // Setup sorting click handlers using event delegation
    container.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-sort]");
        if (th) {
            const sortColumn = th.getAttribute("data-sort");
            handleSort(sortColumn);
            e.stopPropagation();
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("xp-scroll");
    if (!container) return;

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
            showLevel: true
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
