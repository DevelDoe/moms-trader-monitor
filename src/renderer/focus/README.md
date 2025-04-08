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

