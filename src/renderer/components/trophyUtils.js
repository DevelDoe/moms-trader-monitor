/**
 * TROPHY UTILITIES - COPY-PASTE REFERENCE GUIDE
 * 
 * This file contains ready-to-copy trophy SVG code and implementation examples.
 * 
 * HOW TO USE:
 * 1. Copy the trophy function you need
 * 2. Paste it into your renderer script
 * 3. Use getTrophyIcon(rank) to display trophies
 * 
 * NO IMPORTS NEEDED - Just copy-paste the functions!
 */

// ============================================================================
// 🏆 READY-TO-COPY TROPHY FUNCTION (24x24 size)
// ============================================================================
// Copy this entire function into your renderer script:

function getTrophyIcon(rank) {
    if (rank === 1) {
        return '<img src="../scrolls/gold-cup.png" alt="Gold Trophy" class="trophy trophy-gold" width="24" height="24">';
    } else if (rank === 2) {
        return '<img src="../scrolls/silver-cup.png" alt="Silver Trophy" class="trophy trophy-silver" width="24" height="24">';
    } else if (rank === 3) {
        return '<img src="../scrolls/bronze-cup.png" alt="Bronze Trophy" class="trophy trophy-bronze" width="24" height="24">';
    }
    return '';
}

// ============================================================================
// 🎨 READY-TO-COPY CSS STYLES
// ============================================================================
// Copy these CSS rules into your stylesheet:

const TROPHY_CSS = `
    .trophy {
        display: inline-block;
        margin-right: 4px;
        vertical-align: middle;
    }
    .trophy-gold { filter: drop-shadow(0 0 2px gold); }
    .trophy-silver { filter: drop-shadow(0 0 2px silver); }
    .trophy-bronze { filter: drop-shadow(0 0 2px #cd7f32); }
    
    .rank-cell {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
    }
`;

// ============================================================================
// 📋 IMPLEMENTATION EXAMPLES
// ============================================================================

// EXAMPLE 1: Basic trophy display in table
function exampleBasicUsage() {
    return `
        <td>
            <div class="rank-cell">
                ${getTrophyIcon(1)} <!-- Shows gold trophy -->
                <span>Stock Symbol</span>
            </div>
        </td>
    `;
}

// EXAMPLE 2: Trophy with rank number fallback
function exampleWithFallback(rank) {
    return `
        <div class="rank-indicator">
            ${getTrophyIcon(rank) || `<span class="rank-number">${rank}</span>`}
        </div>
    `;
}

// EXAMPLE 3: Loop through top 3 positions
function exampleTopThreeLoop() {
    let html = '';
    for (let i = 0; i < 3; i++) {
        const rank = i + 1;
        const trophyIcon = getTrophyIcon(rank);
        
        html += `
            <tr>
                <td>
                    <div class="rank-indicator">
                        ${trophyIcon}
                    </div>
                    <div class="stock-symbol">Stock ${rank}</div>
                </td>
            </tr>
        `;
    }
    return html;
}

// ============================================================================
// 🔧 CUSTOMIZATION OPTIONS
// ============================================================================

// SMALL TROPHIES (16x16) - for compact displays
function getTrophyIconSmall(rank) {
    if (rank === 1) {
        return `<svg class="trophy trophy-gold" width="16" height="16" viewBox="0 0 100 100">
            <ellipse cx="50" cy="70" rx="25" ry="8" fill="gold"/>
            <path d="M25 70 Q25 50 30 40 Q35 30 50 25 Q65 30 70 40 Q75 50 75 70" fill="gold"/>
            <path d="M25 60 Q20 55 20 50 Q20 45 25 40" stroke="gold" stroke-width="3" fill="none"/>
            <path d="M75 60 Q80 55 80 50 Q80 45 75 40" stroke="gold" stroke-width="3" fill="none"/>
            <ellipse cx="50" cy="25" rx="20" ry="5" fill="gold"/>
            <rect x="40" y="75" width="20" height="8" fill="gold"/>
            <rect x="35" y="83" width="30" height="4" fill="gold"/>
        </svg>`;
    } else if (rank === 2) {
        return `<svg class="trophy trophy-silver" width="16" height="16" viewBox="0 0 100 100">
            <ellipse cx="50" cy="70" rx="25" ry="8" fill="silver"/>
            <path d="M25 70 Q25 50 30 40 Q35 30 50 25 Q65 30 70 40 Q75 50 75 70" fill="silver"/>
            <path d="M25 60 Q20 55 20 50 Q20 45 25 40" stroke="silver" stroke-width="3" fill="none"/>
            <path d="M75 60 Q80 55 80 50 Q80 45 75 40" stroke="silver" stroke-width="3" fill="none"/>
            <ellipse cx="50" cy="25" rx="20" ry="5" fill="silver"/>
            <rect x="40" y="75" width="20" height="8" fill="silver"/>
            <rect x="35" y="83" width="30" height="4" fill="silver"/>
        </svg>`;
    } else if (rank === 3) {
        return `<svg class="trophy trophy-bronze" width="16" height="16" viewBox="0 0 100 100">
            <ellipse cx="50" cy="70" rx="25" ry="8" fill="#cd7f32"/>
            <path d="M25 70 Q25 50 30 40 Q35 30 50 25 Q65 30 70 40 Q75 50 75 70" fill="#cd7f32"/>
            <path d="M25 60 Q20 55 20 50 Q20 45 25 40" stroke="#cd7f32" stroke-width="3" fill="none"/>
            <path d="M75 60 Q80 55 80 50 Q80 45 75 40" stroke="#cd7f32" stroke-width="3" fill="none"/>
            <ellipse cx="50" cy="25" rx="20" ry="5" fill="#cd7f32"/>
            <rect x="40" y="75" width="20" height="8" fill="#cd7f32"/>
            <rect x="35" y="83" width="30" height="4" fill="#cd7f32"/>
        </svg>`;
    }
    return '';
}

// LARGE TROPHIES (32x32) - for prominent displays
function getTrophyIconLarge(rank) {
    if (rank === 1) {
        return `<svg class="trophy trophy-gold" width="32" height="32" viewBox="0 0 100 100">
            <ellipse cx="50" cy="70" rx="25" ry="8" fill="gold"/>
            <path d="M25 70 Q25 50 30 40 Q35 30 50 25 Q65 30 70 40 Q75 50 75 70" fill="gold"/>
            <path d="M25 60 Q20 55 20 50 Q20 45 25 40" stroke="gold" stroke-width="3" fill="none"/>
            <path d="M75 60 Q80 55 80 50 Q80 45 75 40" stroke="gold" stroke-width="3" fill="none"/>
            <ellipse cx="50" cy="25" rx="20" ry="5" fill="gold"/>
            <rect x="40" y="75" width="20" height="8" fill="gold"/>
            <rect x="35" y="83" width="30" height="4" fill="gold"/>
            <ellipse cx="45" cy="35" rx="8" ry="3" fill="rgba(255,255,255,0.3)"/>
        </svg>`;
    } else if (rank === 2) {
        return `<svg class="trophy trophy-silver" width="32" height="32" viewBox="0 0 100 100">
            <ellipse cx="50" cy="70" rx="25" ry="8" fill="silver"/>
            <path d="M25 70 Q25 50 30 40 Q35 30 50 25 Q65 30 70 40 Q75 50 75 70" fill="silver"/>
            <path d="M25 60 Q20 55 20 50 Q20 45 25 40" stroke="silver" stroke-width="3" fill="none"/>
            <path d="M75 60 Q80 55 80 50 Q80 45 75 40" stroke="silver" stroke-width="3" fill="none"/>
            <ellipse cx="50" cy="25" rx="20" ry="5" fill="silver"/>
            <rect x="40" y="75" width="20" height="8" fill="silver"/>
            <rect x="35" y="83" width="30" height="4" fill="silver"/>
            <ellipse cx="45" cy="35" rx="8" ry="3" fill="rgba(255,255,255,0.3)"/>
        </svg>`;
    } else if (rank === 3) {
        return `<svg class="trophy trophy-bronze" width="32" height="32" viewBox="0 0 100 100">
            <ellipse cx="50" cy="70" rx="25" ry="8" fill="#cd7f32"/>
            <path d="M25 70 Q25 50 30 40 Q35 30 50 25 Q65 30 70 40 Q75 50 75 70" fill="#cd7f32"/>
            <path d="M25 60 Q20 55 20 50 Q20 45 25 40" stroke="#cd7f32" stroke-width="3" fill="none"/>
            <path d="M75 60 Q80 55 80 50 Q80 45 75 40" stroke="#cd7f32" stroke-width="3" fill="none"/>
            <ellipse cx="50" cy="25" rx="20" ry="5" fill="#cd7f32"/>
            <rect x="40" y="75" width="20" height="8" fill="#cd7f32"/>
            <rect x="35" y="83" width="30" height="4" fill="#cd7f32"/>
            <ellipse cx="45" cy="35" rx="8" ry="3" fill="rgba(255,255,255,0.3)"/>
        </svg>`;
    }
    return '';
}

// ============================================================================
// 📚 QUICK REFERENCE
// ============================================================================

/*
QUICK COPY-PASTE GUIDE:

1. COPY THE MAIN FUNCTION:
   - Copy the entire getTrophyIcon() function above
   - Paste it into your renderer script

2. USE IT IN YOUR CODE:
   - getTrophyIcon(1) → Gold trophy
   - getTrophyIcon(2) → Silver trophy  
   - getTrophyIcon(3) → Bronze trophy
   - getTrophyIcon(4) → Empty string (use rank number instead)

3. COPY THE CSS:
   - Copy the TROPHY_CSS constant above
   - Paste it into your stylesheet or inject it

4. EXAMPLE USAGE:
   ${getTrophyIcon(rank) || `<span>${rank}</span>`}

That's it! No imports, no dependencies, just copy-paste and go!
*/

// ============================================================================
// 🎯 CURRENT IMPLEMENTATIONS
// ============================================================================
// These files already have trophies implemented:
// ✅ src/renderer/scrolls/xp.js - Uses embedded trophy function
// ✅ src/renderer/sessionHistory/sessionHistory.js - Clean (no trophies)
// ✅ src/renderer/components/trophyUtils.js - This reference file

// ============================================================================
// 🚀 NEXT STEPS
// ============================================================================
// To add trophies to other files:
// 1. Copy getTrophyIcon() function
// 2. Copy trophy CSS styles
// 3. Use in your ranking display logic
// 4. Test with top 3 positions

console.log('🏆 Trophy Utilities loaded! Copy-paste the functions you need.');
