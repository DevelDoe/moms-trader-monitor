// Symbol Component - Reusable symbol display with configurable size and styling
// Usage: window.components.Symbol({ symbol: "AAPL", size: "small", onClick: (symbol) => console.log(symbol) })

function Symbol({ symbol, size = "medium", onClick = null, showTrophy = false, rank = null, customStyle = {} }) {
    // Size configurations
    const sizeConfigs = {
        small: {
            fontSize: "12px",
            padding: "1px 3px",
            width: "50px",
            height: "20px"
        },
        medium: {
            fontSize: "16px", 
            padding: "2px 4px",
            width: "75px",
            height: "24px"
        },
        large: {
            fontSize: "20px",
            padding: "3px 6px", 
            width: "100px",
            height: "28px"
        },
        xlarge: {
            fontSize: "24px",
            padding: "4px 8px",
            width: "120px", 
            height: "32px"
        }
    };

    const config = sizeConfigs[size] || sizeConfigs.medium;
    
    // Generate symbol color (same logic as xp.js)
    const symbolColor = getSymbolColor(symbol);
    
    // Trophy HTML if needed
    const trophyHtml = showTrophy && rank ? getTrophyIcon(rank) : '';
    
    // Click handler
    const clickHandler = onClick ? `onclick="handleSymbolClick('${symbol}')"` : '';
    
    return `
        <span class="symbol symbol-${size}" 
              style="
                background: ${symbolColor}; 
                padding: ${config.padding}; 
                border-radius: 1px; 
                cursor: ${onClick ? 'pointer' : 'default'};
                white-space: nowrap;
                color: antiquewhite !important;
                font-weight: 400;
                font-size: ${config.fontSize};
                width: ${config.width};
                display: inline-block;
                text-align: left;
                vertical-align: bottom;
                transition: all 0.2s ease;
                ${Object.entries(customStyle).map(([key, value]) => `${key}: ${value};`).join(' ')}
              "
              ${clickHandler}
              title="${symbol}">
            ${trophyHtml}${symbol}
        </span>
    `;
}

// Trophy utility function (extracted from xp.js)
function getTrophyIcon(rank) {
    if (rank === 1) {
        return '<img src="./img/gold-cup.png" alt="Gold Trophy" class="trophy trophy-gold" width="16" height="16" style="margin-right: 4px; vertical-align: middle;">';
    } else if (rank === 2) {
        return '<img src="./img/silver-cup.png" alt="Silver Trophy" class="trophy trophy-silver" width="16" height="16" style="margin-right: 4px; vertical-align: middle;">';
    } else if (rank === 3) {
        return '<img src="./img/bronze-cup.png" alt="Bronze Trophy" class="trophy trophy-bronze" width="16" height="16" style="margin-right: 4px; vertical-align: middle;">';
    }
    return '';
}

// Symbol color generation (extracted from xp.js)
const symbolColors = {};
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

// Global click handler for symbols
window.handleSymbolClick = function(symbol) {
    try {
        // Copy to clipboard
        navigator.clipboard.writeText(symbol);
        
        // Set as active ticker if API is available
        if (window.activeAPI?.setActiveTicker) {
            window.activeAPI.setActiveTicker(symbol);
        }
        
        // Add visual feedback
        const clickedElement = event.target.closest('.symbol');
        if (clickedElement) {
            clickedElement.classList.add("symbol-clicked");
            setTimeout(() => clickedElement.classList.remove("symbol-clicked"), 200);
        }
        
        console.log(`📋 Symbol copied and set as active: ${symbol}`);
    } catch (err) {
        console.error(`⚠️ Failed to handle click for ${symbol}:`, err);
    }
};

// Make Symbol component available globally
window.SymbolComponent = Symbol;
