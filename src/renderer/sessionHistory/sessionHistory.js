// Session History View
// Displays XP session history data from Oracle
//
// LOGGING SYSTEM:
// - Uses simple window.log API for all logging (already handles production vs development)
// - Debug logging only shown in development
// - Errors are always logged (production and development)

let sessionHistoryData = null;
let activeStocksData = null;
let currentSort = { column: 'session_name', direction: 'asc' };

// Symbol colors now handled by the symbol component

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
    
    // Handle overnight gap (8 PM to 4 AM) - return null to indicate outside market hours
    if (currentHour >= 20 || currentHour < 4) {
        return null; // null indicates outside market hours
    }
    
    return 'pre'; // fallback
}

// Helper function to check if we're currently outside market hours
function isOutsideMarketHours() {
    return getCurrentSession() === null;
}

// Render the top stocks by session phase
function renderSessionHistory() {
    const container = document.getElementById('session-history-table');
    if (!container) return;

    if (!sessionHistoryData || !sessionHistoryData.sessions || sessionHistoryData.sessions.length === 0) {
        window.log.warn('No session data available, showing no-data message');
        container.innerHTML = '<div class="no-data">No session data available</div>';
        return;
    }

    // Get current session for highlighting
    const currentSession = getCurrentSession();
    
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
    
    // Click handling is now done by the symbol component
}

// Generate rows for top 3 stocks in each phase
function generateTopStocksRows(sessions, activeStocks, currentSession) {
    // Group sessions by phase and get top stocks for each
    const phaseData = {
        pre: getTopStocksForPhase(sessions, 'pre', currentSession),
        news: getTopStocksForPhase(sessions, 'news', currentSession),
        open: getTopStocksForPhase(sessions, 'open', currentSession),
        power: getTopStocksForPhase(sessions, 'power', currentSession),
        post: getTopStocksForPhase(sessions, 'post', currentSession)
    };
    
    // Check if we're outside market hours
    const outsideMarketHours = isOutsideMarketHours();
    
    // Use active stocks for the current session ONLY if we're inside market hours
    const currentSessionStocks = (!outsideMarketHours && activeStocks?.symbols) ? activeStocks.symbols : [];
    const topCurrentStocks = currentSessionStocks.slice(0, 3);
    
    // Create rows for top 3 stocks
    let rows = '';
    for (let i = 0; i < 3; i++) {
        rows += '<tr>';
        
        // Add stock data for each phase
        ['pre', 'news', 'open', 'power', 'post'].forEach(phase => {
            let stock;
            
            if (!outsideMarketHours && phase === currentSession) {
                // Use active stocks for current session (only when inside market hours)
                stock = topCurrentStocks[i];
            } else {
                // Use historical data for other sessions OR all sessions when outside market hours
                stock = phaseData[phase][i];
            }
            
            if (stock) {
                const netXp = stock.xp || 0;
                const xpClass = netXp > 0 ? 'positive' : netXp < 0 ? 'negative' : 'neutral';
                const isCurrentSession = (!outsideMarketHours && phase === currentSession);
                
                rows += `
                    <td class="stock-cell ${isCurrentSession ? 'current-session-cell' : ''}">
                        ${window.components.Symbol({ 
                            symbol: stock.symbol || 'N/A', 
                            size: "small",
                            onClick: true
                        })}
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

// Get top 3 stocks for a specific phase
function getTopStocksForPhase(sessions, phaseName, currentSession) {
    if (!Array.isArray(sessions)) {
        window.log.warn(`Sessions is not an array:`, sessions);
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
        // Don't warn if this is the current session - it's expected to not have historical data
        if (phaseName !== currentSession) {
            window.log.warn(`No session found for phase: ${phaseName}`);
        } 
        return [];
    }
    
    // Check different possible symbol properties
    const symbols = phaseSession.symbols || phaseSession.stocks || phaseSession.data || phaseSession.top_symbols || phaseSession.top_stocks || [];
    
    if (!Array.isArray(symbols)) {
        window.log.warn(`Symbols is not an array for ${phaseName}:`, { symbols, type: typeof symbols, phaseName });
        return [];
    }
    
    // Return first 3 symbols as they come from the API
    return symbols.slice(0, 3);
}

// Initialize the view
document.addEventListener('DOMContentLoaded', async () => {
    // Set up event delegation for symbol clicks
    document.addEventListener('click', function(event) {
        const symbolElement = event.target.closest('.symbol[data-clickable="true"]');
        if (symbolElement) {
            const symbol = symbolElement.getAttribute('data-symbol');
            if (symbol) {
                console.log(`🖱️ [SessionHistory] Symbol clicked: ${symbol}`);
                window.handleSymbolClick(symbol, event);
            }
        }
    });

    // Wait for activeAPI to be available
    while (!window.activeAPI) {
        await new Promise((r) => setTimeout(r, 100));
    }
    console.log("✅ SessionHistory view - activeAPI is now available");

    try {
        // Get initial session history data
        sessionHistoryData = await window.xpAPI.getSessionHistory();
        
        // Get initial active stocks data
        activeStocksData = await window.xpAPI.getActiveStocks();
        
        if (sessionHistoryData) {
            renderSessionHistory();
        }
    } catch (error) {
        window.log.error('Failed to get initial session history', error);
        const container = document.getElementById('session-history-table');
        if (container) {
            container.innerHTML = '<div class="no-data">Failed to load session history data</div>';
        }
    }

    // Listen for session history updates
    window.xpAPI.onSessionHistoryUpdate((data) => {
        sessionHistoryData = data;
        renderSessionHistory();
    });

    // Listen for session updates
    window.xpAPI.onSessionUpdate((data) => {
        // Refresh the data if we have session history
        if (data && data.session_history) {
            sessionHistoryData = data.session_history;
            renderSessionHistory();
        }
    });

    // Listen for active stocks updates (current session)
    window.xpAPI.onActiveStocksUpdate((data) => {
        activeStocksData = data;
        renderSessionHistory();
    });
});

// -------------------- helpers --------------------

// Symbol color generation is now handled by the symbol component
