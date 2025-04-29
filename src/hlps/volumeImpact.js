function calculateVolumeImpact(volume = 0, price = 1, buffs = {}) {
    const categories = Object.entries(buffs)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => a.priceThreshold - b.priceThreshold);

    for (const category of categories) {
        if (price <= category.priceThreshold) {
            const sortedStages = [...category.volumeStages].sort((a, b) => a.volumeThreshold - b.volumeThreshold);

            const stageToUse =
                sortedStages.find((stage, index) => {
                    const current = stage.volumeThreshold;
                    const prev = index === 0 ? 0 : sortedStages[index - 1].volumeThreshold;
                    if (index === sortedStages.length - 1) {
                        return volume >= prev;
                    }
                    return volume > prev && volume <= current;
                }) || sortedStages[sortedStages.length - 1];

            return {
                ...stageToUse,
                capAssigned: category.category,
                volumeStage: stageToUse.key,
                message: `${category.category} ${stageToUse.key} (${humanReadableNumbers(volume)})`,
                style: {
                    cssClass: `volume-${stageToUse.key.toLowerCase()}`,
                    color: getColorForStage(stageToUse.key),
                    animation: stageToUse.key === "parabolicVol" ? "pulse 1.5s infinite" : "none",
                },
            };
        }
    }

    return {
        multiplier: 1,
        capAssigned: "None",
        volumeStage: "None",
        message: "No matching category found",
        style: {
            cssClass: "volume-none",
            icon: "",
            description: "No volume",
            color: "#cccccc",
            animation: "none",
        },
        score: 0,
    };
}

function getColorForStage(stageKey) {
    const colors = {
        lowVol: "#cccccc",
        mediumVol: "#4caf50",
        highVol: "#ff9800",
        parabolicVol: "#f44336",
    };
    return colors[stageKey] || "#cccccc";
}

function humanReadableNumbers(value) {
    if (value === null || value === undefined || isNaN(value) || value === "") {
        return "-";
    }
    const num = Number(value);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
    return num.toLocaleString();
}

module.exports = { calculateVolumeImpact };
