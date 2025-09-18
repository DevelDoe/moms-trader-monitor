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

// Helper function to format change values
function formatChangeValue(value) {
    if (value === null || value === undefined) return '0%';
    
    const num = Number(value);
    if (isNaN(num)) return '0%';
    
    // Format as percentage with appropriate decimal places
    if (Math.abs(num) >= 100) {
        return num.toFixed(0) + '%';
    } else if (Math.abs(num) >= 10) {
        return num.toFixed(1) + '%';
    } else {
        return num.toFixed(2) + '%';
    }
}

// Helper function to get CSS class for change value
function getChangeClass(value) {
    if (value === null || value === undefined) return 'neutral';
    
    const num = Number(value);
    if (isNaN(num)) return 'neutral';
    
    if (num > 0) return 'positive';
    if (num < 0) return 'negative';
    return 'neutral';
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
                
                // Determine change data based on whether it's current or historical
                let changeData;
                if (isCurrentSession) {
                    // For current session, use current change fields (might be different field names)
                    changeData = stock.change || stock.changePercent || stock.session_change_percent;
                    
                    // Log current session stock structure for debugging
                    if (i === 0) {
                        console.log(`📊 [SessionHistory] Current session stock data for ${stock.symbol}:`, {
                            symbol: stock.symbol,
                            allFields: Object.keys(stock),
                            change: stock.change,
                            changePercent: stock.changePercent,
                            session_change_percent: stock.session_change_percent,
                            selectedChangeData: changeData
                        });
                    }
                } else {
                    // For historical sessions, use session_change_percent
                    changeData = stock.session_change_percent;
                    
                    // Log historical session stock structure for debugging
                    if (i === 0) {
                        console.log(`📊 [SessionHistory] Historical session stock data for ${stock.symbol} (${phase}):`, {
                            symbol: stock.symbol,
                            allFields: Object.keys(stock),
                            session_change_percent: stock.session_change_percent,
                            selectedChangeData: changeData
                        });
                    }
                }
                
                // Log what we're passing to Symbol component
                console.log(`📊 [SessionHistory] Symbol component call for ${stock.symbol}:`, {
                    symbol: stock.symbol,
                    size: "small",
                    onClick: true,
                    change: changeData,
                    changePercent: changeData
                });
                
                // Format the change value for display
                const formattedChange = formatChangeValue(changeData);
                
                rows += `
                    <td class="stock-cell ${isCurrentSession ? 'current-session-cell' : ''}">
                        <div class="symbol-container">
                            ${window.components.Symbol({ 
                                symbol: stock.symbol || 'N/A', 
                                size: "small",
                                onClick: true
                            })}
                            <div class="session-change ${getChangeClass(changeData)}">
                                ${formattedChange}
                            </div>
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

// Debug function to print complete data structures
function printDataStructures() {
    console.log('🔍 [SessionHistory] ===== DATA STRUCTURE ANALYSIS =====');
    
    // Print session history data structure
    if (sessionHistoryData) {
        console.log('📊 [SessionHistory] Session History Data Structure:');
        console.log('  - Root keys:', Object.keys(sessionHistoryData));
        console.log('  - Sessions array length:', sessionHistoryData.sessions?.length || 0);
        
        if (sessionHistoryData.sessions && sessionHistoryData.sessions.length > 0) {
            console.log('  - First session structure:');
            const firstSession = sessionHistoryData.sessions[0];
            console.log('    * Keys:', Object.keys(firstSession));
            console.log('    * Full object:', firstSession);
            
            if (firstSession.symbols && firstSession.symbols.length > 0) {
                console.log('  - First symbol in first session:');
                const firstSymbol = firstSession.symbols[0];
                console.log('    * Keys:', Object.keys(firstSymbol));
                console.log('    * Full object:', firstSymbol);
            }
        }
    } else {
        console.log('📊 [SessionHistory] No session history data available');
    }
    
    // Print active stocks data structure
    if (activeStocksData) {
        console.log('📈 [SessionHistory] Active Stocks Data Structure:');
        console.log('  - Root keys:', Object.keys(activeStocksData));
        console.log('  - Symbols array length:', activeStocksData.symbols?.length || 0);
        
        if (activeStocksData.symbols && activeStocksData.symbols.length > 0) {
            console.log('  - First active symbol structure:');
            const firstActiveSymbol = activeStocksData.symbols[0];
            console.log('    * Keys:', Object.keys(firstActiveSymbol));
            console.log('    * Full object:', firstActiveSymbol);
        }
    } else {
        console.log('📈 [SessionHistory] No active stocks data available');
    }
    
    console.log('🔍 [SessionHistory] ===== END DATA STRUCTURE ANALYSIS =====');
}

// Initialize the view
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize header component
    const headerContainer = document.getElementById('header-container');
    if (headerContainer && window.HeaderComponent) {
        window.sessionHistoryHeader = new window.HeaderComponent(headerContainer, {
            icon: '📜',
            text: 'Register of Conquerors (Sessions)',
            className: 'sessionHistory-header'
        });
    }

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
        
        // Handle debug button click
        if (event.target.id === 'debug-btn') {
            console.log('🔍 [SessionHistory] Debug button clicked - printing data structures');
            printDataStructures();
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
        
        // Get initial active stocks data (change-sorted)
        activeStocksData = await window.changeAPI.getActiveStocks();
        
        if (sessionHistoryData) {
            // Print data structures for debugging
            printDataStructures();
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
        console.log('📊 [SessionHistory] Session history data updated');
        sessionHistoryData = data;
        printDataStructures();
        renderSessionHistory();
    });

    // Listen for session updates
    window.xpAPI.onSessionUpdate((data) => {
        console.log('📊 [SessionHistory] Session data updated');
        // Refresh the data if we have session history
        if (data && data.session_history) {
            sessionHistoryData = data.session_history;
            printDataStructures();
            renderSessionHistory();
        }
    });

    // Listen for active stocks updates (current session - change-sorted)
    window.changeAPI.onActiveStocksUpdate((data) => {
        console.log('📈 [SessionHistory] Active stocks data updated');
        activeStocksData = data;
        printDataStructures();
        renderSessionHistory();
    });
});

// -------------------- helpers --------------------

// Symbol color generation is now handled by the symbol component
