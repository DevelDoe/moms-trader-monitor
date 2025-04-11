# TODO

1. Add level-up sparkle FX when XP passes a threshold

2. Highlight "New Challenger" tickers entering top 3

3. Show damage/heal particles floating above cards

4. give each ticker a personality class (e.g., "Tank", "Rogue", "Mage") based on float/volume/news


“The Arcane Awakening”




🏆 Daily Hall of Fame — Top Gappers by XP/LV
You can create a separate view or a sidebar that:

Sorts all tickers by lv, then xp (descending).

Shows top 10 most experienced heroes of the day.

Ignores score and decay, so it’s permanent until market reset.

Example:

js
Copy
Edit
function getDailyTopHeroes(limit = 10) {
    return Object.values(focusState)
        .filter(h => h.lv > 0 || h.xp > 0)
        .sort((a, b) => {
            if (b.lv === a.lv) return b.xp - a.xp;
            return b.lv - a.lv;
        })
        .slice(0, limit);
}
👑 UI Ideas
Symbol	LV	XP	Peak Score
$AREB	6	78	3200
$PXMD	5	44	2900

Add subtle sparkles ✨ or even RPG-style medals 🥇 to top 3. Could also persist this to disk so you can show "Top Gappers of the Week" later.

These could at close be saved as former runner perc






⚡⚡⚡ [KTTA] SCORING BREAKDOWN ⚡⚡⚡
focus.js:445 📜 INITIAL STATE → Price: 2 |  Score: 22.89 | HP: 21.05 | DP: 0
focus.js:448 🤎 Base DP Deducted               1.48
focus.js:448 🏷️ Float Mult (2.59M)             1.10
focus.js:448 📢 Volume Mult (171.93K)          1.35
focus.js:479 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
focus.js:448 🎯 TOTAL SCORE CHANGE             -2.21
focus.js:481 🔥 FINAL SCORE → 20.68


⚡⚡⚡ [PRFX] SCORING BREAKDOWN ⚡⚡⚡
focus.js:445 📜 INITIAL STATE → Price: 3.03 |  Score: 56.47 | HP: 72.59000000000006 | DP: 0
focus.js:448 💖 Base HP Added                  1.34
focus.js:448 🏷️ Float Mult (144.51K)           1.15
focus.js:448 📢 Volume Mult (129.85K)          1.34
focus.js:479 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
focus.js:448 🎯 TOTAL SCORE CHANGE             2.06
focus.js:481 🔥 FINAL SCORE → 58.53


⚡⚡⚡ [WHLR] SCORING BREAKDOWN ⚡⚡⚡
focus.js:445 📜 INITIAL STATE → Price: 3.41 |  Score: 0.00 | HP: 0 | DP: 0
focus.js:448 🤎 Base DP Deducted               5.01
focus.js:448 🏷️ Float Mult (204.76K)           1.15
focus.js:448 📢 Volume Mult (89.11K)           1.11
focus.js:479 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
focus.js:448 🎯 TOTAL SCORE CHANGE             -6.40
focus.js:481 🔥 FINAL SCORE → 0.00