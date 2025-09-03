// Session History View
// Displays XP session history data from Oracle

let sessionHistoryData = null;
let activeStocksData = null;
let currentSort = { column: 'session_name', direction: 'asc' };

// Symbol colors (same as XP view)
const symbolColors = {};

// Session timing configuration (NY time)
const SESSION_TIMES = {
    pre: { start: 4, end: 7 },      // 4 AM to 7 AM
    news: { start: 7, end: 9.5 },   // 7 AM to 9:30 AM
    open: { start: 9.5, end: 15 },  // 9:30 AM to 3 PM
    power: { start: 15, end: 16 },  // 3 PM to 4 PM
    post: { start: 16, end: 20 }    // 4 PM to 8 PM
};

// Helper function to format XP values
function formatXp(value) {
    if (value === null || value === undefined) return '0';
    
    const num = Number(value);
    if (isNaN(num)) return '0';
    
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    } else {
        return num.toString();
    }
}

// Helper function to get sort icon (no longer used but kept for future)
function getSortIcon(column) {
    return '↕️';
}

// Get current session based on NY time
function getCurrentSession() {
    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = nyTime.getHours() + (nyTime.getMinutes() / 60);
    
    for (const [session, time] of Object.entries(SESSION_TIMES)) {
        if (currentHour >= time.start && currentHour < time.end) {
            return session;
        }
    }
    
    // Handle overnight gap (8 PM to 4 AM) - default to pre
    if (currentHour >= 20 || currentHour < 4) {
        return 'pre';
    }
    
    return 'pre'; // fallback
}

// Render the top stocks by session phase
function renderSessionHistory() {
    const container = document.getElementById('session-history-table');
    if (!container) return;

    console.log('🎨 Rendering session history...');
    console.log('📊 Session history data:', sessionHistoryData);
    console.log('📊 Active stocks data:', activeStocksData);

    if (!sessionHistoryData || !sessionHistoryData.sessions || sessionHistoryData.sessions.length === 0) {
        console.warn('⚠️ No session data available, showing no-data message');
        container.innerHTML = '<div class="no-data">No session data available</div>';
        return;
    }

    // Get current session for highlighting
    const currentSession = getCurrentSession();
    console.log('🔍 Current session:', currentSession);
    
    // Log the actual structure of the first session
    if (sessionHistoryData.sessions[0]) {
        console.log('🔍 First session structure:', sessionHistoryData.sessions[0]);
        console.log('🔍 First session keys:', Object.keys(sessionHistoryData.sessions[0]));
    }
    
    // Create table HTML for top stocks by phase
    const tableHtml = `
        <table>
            <thead>
                <tr>
                    <th class="${currentSession === 'pre' ? 'current-session' : ''}">pre</th>
                    <th class="${currentSession === 'news' ? 'current-session' : ''}">news</th>
                    <th class="${currentSession === 'open' ? 'current-session' : ''}">open</th>
                    <th class="${currentSession === 'power' ? 'current-session' : ''}">power</th>
                    <th class="${currentSession === 'post' ? 'current-session' : ''}">post</th>
                </tr>
            </thead>
            <tbody>
                ${generateTopStocksRows(sessionHistoryData.sessions, activeStocksData, currentSession)}
            </tbody>
        </table>
    `;

    container.innerHTML = tableHtml;
    
    // Add click functionality to symbols (same as XP view)
    container.querySelectorAll(".stock-symbol").forEach((el) => {
        el.addEventListener("click", (e) => {
            const symbol = el.textContent.trim();
            try {
                navigator.clipboard.writeText(symbol);
                if (window.activeAPI?.setActiveTicker) window.activeAPI.setActiveTicker(symbol);
                el.classList.add("stock-symbol-clicked");
                setTimeout(() => el.classList.remove("stock-symbol-clicked"), 200);
            } catch (err) {
                console.error(`⚠️ Failed to handle click for ${symbol}:`, err);
            }
            e.stopPropagation();
        });
    });
}

// Generate rows for top 3 stocks in each phase
function generateTopStocksRows(sessions, activeStocks, currentSession) {
    // console.log('🔍 Sessions data:', sessions);
    // console.log('🔍 Active stocks data:', activeStocks);
    // console.log('🔍 Current session:', currentSession);
    
    // Group sessions by phase and get top stocks for each
    const phaseData = {
        pre: getTopStocksForPhase(sessions, 'pre'),
        news: getTopStocksForPhase(sessions, 'news'),
        open: getTopStocksForPhase(sessions, 'open'),
        power: getTopStocksForPhase(sessions, 'power'),
        post: getTopStocksForPhase(sessions, 'post')
    };
    
    // Use active stocks for the current session
    const currentSessionStocks = activeStocks?.symbols || [];
    const topCurrentStocks = currentSessionStocks.slice(0, 3);
    
    // console.log('🔍 Phase data:', phaseData);
    // console.log('🔍 Top current stocks:', topCurrentStocks);
    
    // Create rows for top 3 stocks
    let rows = '';
    for (let i = 0; i < 3; i++) {
        rows += '<tr>';
        
        // Add stock data for each phase
        ['pre', 'news', 'open', 'power', 'post'].forEach(phase => {
            let stock;
            
            if (phase === currentSession) {
                // Use active stocks for current session
                stock = topCurrentStocks[i];
            } else {
                // Use historical data for other sessions
                stock = phaseData[phase][i];
            }
            
            if (stock) {
                const netXp = stock.xp || 0;
                const xpClass = netXp > 0 ? 'positive' : netXp < 0 ? 'negative' : 'neutral';
                const isCurrentSession = phase === currentSession;
                
                rows += `
                    <td class="stock-cell ${isCurrentSession ? 'current-session-cell' : ''}">
                        <div class="stock-symbol" style="background: ${getSymbolColor(stock.symbol)};" data-symbol="${stock.symbol}">
                            ${stock.symbol || 'N/A'}
                        </div>
                        
                    </td>
                `;
            } else {
                rows += '<td class="stock-cell empty">-</td>';
            }
        });
        
        rows += '</tr>';
    }
    
    return rows;
}

// <div class="stock-xp ${xpClass}">${formatXp(netXp)}</div>
                        // <div class="stock-level">Lv.${stock.level || 0}</div>

// Get top 3 stocks for a specific phase
function getTopStocksForPhase(sessions, phaseName) {
    // console.log(`🔍 Looking for phase: ${phaseName}`);
    // console.log(`🔍 Available sessions:`, sessions);
    
    if (!Array.isArray(sessions)) {
        console.warn(`⚠️ Sessions is not an array:`, sessions);
        return [];
    }
    
    // Try different possible property names
    const phaseSession = sessions.find(s => 
        s.session_name === phaseName || 
        s.phase === phaseName || 
        s.name === phaseName ||
        s.type === phaseName
    );
    
    if (!phaseSession) {
        console.warn(`⚠️ No session found for phase: ${phaseName}`);
        return [];
    }
    
    // console.log(`✅ Found session for ${phaseName}:`, phaseSession);
    // console.log(`🔍 Session keys:`, Object.keys(phaseSession));
    // console.log(`🔍 Session values:`, Object.values(phaseSession));
    
    // Check different possible symbol properties
    const symbols = phaseSession.symbols || phaseSession.stocks || phaseSession.data || phaseSession.top_symbols || phaseSession.top_stocks || [];
    
    if (!Array.isArray(symbols)) {
        console.warn(`⚠️ Symbols is not an array for ${phaseName}:`, symbols);
        console.warn(`⚠️ Symbols type:`, typeof symbols);
        console.warn(`⚠️ Symbols value:`, symbols);
        
        // If symbols is not an array, maybe it's a different structure
        if (phaseSession.symbol_count > 0) {
            console.log(`🔍 Session has ${phaseSession.symbol_count} symbols but symbols array is missing`);
            console.log(`🔍 Full session object:`, JSON.stringify(phaseSession, null, 2));
        }
        
        return [];
    }
    
    // console.log(`📊 Found ${symbols.length} symbols for ${phaseName}:`, symbols);
    
    // Return first 3 symbols as they come from the API
    return symbols.slice(0, 3);
}

// Initialize the view
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔄 Session History view initializing...');

    try {
        // Get initial session history data
        sessionHistoryData = await window.xpAPI.getSessionHistory();
        console.log('📊 Initial session history data:', sessionHistoryData);
        
        // Get initial active stocks data
        activeStocksData = await window.xpAPI.getActiveStocks();
        console.log('📊 Initial active stocks data:', activeStocksData);
        
        if (sessionHistoryData) {
            renderSessionHistory();
        }
    } catch (error) {
        console.error('❌ Failed to get initial session history:', error);
        const container = document.getElementById('session-history-table');
        if (container) {
            container.innerHTML = '<div class="no-data">Failed to load session history data</div>';
        }
    }

    // Listen for session history updates
    window.xpAPI.onSessionHistoryUpdate((data) => {
        console.log('🔄 Session history update received:', data);
        console.log('🔍 Data type:', typeof data);
        console.log('🔍 Data keys:', Object.keys(data || {}));
        console.log('🔍 Sessions array:', data?.sessions);
        if (data?.sessions) {
            console.log('🔍 First session:', data.sessions[0]);
            console.log('🔍 First session keys:', Object.keys(data.sessions[0] || {}));
        }
        sessionHistoryData = data;
        renderSessionHistory();
    });

    // Listen for session updates
    window.xpAPI.onSessionUpdate((data) => {
        console.log('🔄 Session update received:', data);
        // Refresh the data if we have session history
        if (data && data.session_history) {
            sessionHistoryData = data.session_history;
            renderSessionHistory();
        }
    });

    // Listen for active stocks updates (current session)
    window.xpAPI.onActiveStocksUpdate((data) => {
        console.log('🔄 Active stocks update received:', data);
        activeStocksData = data;
        renderSessionHistory();
    });
});

// Debug function to log current data
function debugData() {
    console.log('🔍 Current session history data:', sessionHistoryData);
    console.log('🔍 Current active stocks data:', activeStocksData);
    console.log('🔍 Current sort settings:', currentSort);
}

// Expose debug function globally for development
window.debugSessionHistory = debugData;

// -------------------- helpers --------------------

// Get symbol color (same as XP view)
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
