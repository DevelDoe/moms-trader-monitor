export const buffs = [
    {
        category: "pennyCap",
        priceThreshold: 2,
        volumeStages: [
            { key: "minVol", icon: "💭", desc: "Low Volume", volumeThreshold: 300000, multiplier: 0.01, score: -1500 },
            { key: "lowVol", icon: "💤", desc: "Low Volume", volumeThreshold: 100000, multiplier: 0.5, score: -150 },
            { key: "mediumVol", icon: "🚛", desc: "Medium Volume", volumeThreshold: 350000, multiplier: 1.5, score: 100 },
            { key: "highVol", icon: "🔥", desc: "High Volume", volumeThreshold: 500000, multiplier: 2, score: 200 },
            { key: "parabolicVol", icon: "🚀", desc: "Parabolic Volume", volumeThreshold: Infinity, multiplier: 4, score: 400 },
        ],
    },
    {
        category: "tinyCap",
        priceThreshold: 7,
        volumeStages: [
            { key: "minVol", icon: "💭", desc: "Low Volume", volumeThreshold: 250000, multiplier: 0.01, score: -1500 },
            { key: "lowVol", icon: "💤", desc: "Low Volume", volumeThreshold: 80000, multiplier: 0.5, score: -150 },
            { key: "mediumVol", icon: "🚛", desc: "Medium Volume", volumeThreshold: 300000, multiplier: 1.5, score: 100 },
            { key: "highVol", icon: "🔥", desc: "High Volume", volumeThreshold: 400000, multiplier: 2, score: 200 },
            { key: "parabolicVol", icon: "🚀", desc: "Parabolic Volume", volumeThreshold: Infinity, multiplier: 4, score: 400 },
        ],
    },
    {
        category: "default",
        priceThreshold: Infinity,
        volumeStages: [
            { key: "minVol", icon: "💭", desc: "Low Volume", volumeThreshold: 200000, multiplier: 0.01, score: -1500 },
            { key: "lowVol", icon: "💤", desc: "Low Volume", volumeThreshold: 80000, multiplier: 0.5, score: -150 },
            { key: "mediumVol", icon: "🚛", desc: "Medium Volume", volumeThreshold: 300000, multiplier: 1.5, score: 100 },
            { key: "highVol", icon: "🔥", desc: "High Volume", volumeThreshold: 400000, multiplier: 2, score: 200 },
            { key: "parabolicVol", icon: "🚀", desc: "Parabolic Volume", volumeThreshold: Infinity, multiplier: 4, score: 400 },
        ],
    },

    { key: "float1m", threshold: 2_000_000, icon: "1️⃣", desc: "Float around 1M", multiplier: 1.15, score: 300 },
    { key: "float5m", threshold: 7_500_000, icon: "5️⃣", desc: "Float around 5M", multiplier: 1.1, score: 100 },
    { key: "float10m", threshold: 13_000_000, icon: "🔟", desc: "Float around 10M", multiplier: 1.05, score: 50 },
    { key: "float50m", threshold: 50_000_000, icon: "", desc: "Float around 50M", multiplier: 1, score: 0 },
    { key: "float100m", threshold: 100_000_000, icon: "", desc: "Float around 100M", multiplier: 0.8, score: -50 },
    { key: "float200m", threshold: 200_000_000, icon: "", desc: "Float around 200M", multiplier: 0.6, score: -100 },
    { key: "float500m", threshold: 500_000_000, icon: "", desc: "Float around 500M", multiplier: 0.4, score: -300 },
    { key: "float600m+", threshold: Infinity, icon: "", desc: "Float higher than 600M", multiplier: 0.1, score: -1000 },

    { key: "lockedShares", icon: "💼", desc: "High insider/institutional/locked shares holders", score: 10 },

    { key: "hasNews", icon: "😼", desc: "Has news", score: 15 },
    { key: "newHigh", icon: "📈", desc: "New high", score: 10 },
    { key: "bounceBack", icon: "🔁", desc: "Recovering — stock is bouncing back after a downtrend", score: 5 },

    { key: "bio", icon: "🧬", desc: "Biotechnology stock", score: 5 },
    { key: "weed", icon: "🌿", desc: "Cannabis stock", score: 5 },
    { key: "space", icon: "🌌", desc: "Space industry stock", score: 5 },
    { key: "china", icon: "🇨🇳/🇭🇰", desc: "China/Hong Kong-based company", score: 0 },

    { key: "highShort", icon: "🩳", desc: "High short interest (more than 20% of float)", score: 10 },
    { key: "netLoss", icon: "🥅", desc: "Company is currently running at a net loss", score: -5 },
    { key: "hasS3", icon: "📂", desc: "Registered S-3 filing", score: -10 },
    { key: "dilutionRisk", icon: "🚨", desc: "High dilution risk: Net loss + Registered S-3", score: -20 },
];
