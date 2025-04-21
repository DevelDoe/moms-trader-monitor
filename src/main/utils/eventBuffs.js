// ./src/main/utils/eventBuffs.js

function getNewHighBuff(hero) {
    const price = hero.price ?? 0;
    const highest = hero.highestPrice ?? 0;

    if (price > highest) {
        return {
            key: "newHigh",
            icon: "📈",
            desc: "New high",
            score: 10,
            isBuff: true,
        };
    }

    return null;
}

function getBounceBackBuff(hero, event) {
    if (hero.lastEvent?.dp > 0 && event.hp > 0) {
        return {
            key: "bounceBack",
            icon: "🔁",
            desc: "Recovering — stock is bouncing back after a downtrend",
            score: 5,
            isBuff: true,
        };
    }
    return null;
}

module.exports = {
    getNewHighBuff,
    getBounceBackBuff,
};
