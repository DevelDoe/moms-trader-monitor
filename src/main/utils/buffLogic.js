// ./src/main/utils/buffLogic.js

function sanitize(str) {
    if (typeof str !== "string") return "";
    return str.toLowerCase().replace(/[^a-z0-9]/gi, "");
}

/**
 * Main entry point
 */
function computeBuffsForSymbol(symbolData, buffList = [], blockList = []) {
    const buffs = {};

    const floatBuff = getFloatBuff(symbolData, buffList);
    if (floatBuff) buffs.float = floatBuff;

    const newsBuff = getNewsBuff(symbolData, buffList, blockList);
    if (newsBuff) buffs.news = newsBuff;

    const ownershipBuff = getOwnershipBuff(symbolData, buffList);
    if (ownershipBuff) buffs.ownership = ownershipBuff;

    const industryBuff = getIndustryBuff(symbolData, buffList);
    if (industryBuff) buffs.industry = industryBuff;

    const countryBuff = getCountryBuff(symbolData);
    if (countryBuff) buffs.country = countryBuff;

    const shortBuff = getShortInterestBuff(symbolData);
    if (shortBuff) buffs.highShort = shortBuff;

    const netLossBuff = getNetLossBuff(symbolData);
    if (netLossBuff) buffs.netLoss = netLossBuff;

    const s3Buff = getS3FilingBuff(symbolData);
    if (s3Buff) buffs.hasS3 = s3Buff;

    const dilutionBuff = getDilutionRiskBuff(symbolData);
    if (dilutionBuff) buffs.dilutionRisk = dilutionBuff;

    return buffs;
}

// --- Individual Buffs ---

function getFloatBuff(symbolData, buffList = []) {
    const float = symbolData.statistics?.floatShares;
    const shares = symbolData.statistics?.sharesOutstanding;

    const isCorrupt = !float || !shares || float <= 0 || shares <= 0 || float > 1e9 || shares > 5e9 || float / shares > 1.2 || float / shares < 0.01;

    if (isCorrupt) {
        return {
            key: "floatCorrupt",
            icon: "⚠️",
            desc: "Float is unclear",
            multiplier: 1,
            score: 0,
            isBuff: false,
        };
    }

    const floatBuffs = buffList
        .filter((b) => b.key?.startsWith("float") && b.threshold != null)
        .map((b) => ({ ...b, threshold: Number(b.threshold) }))
        .filter((b) => !isNaN(b.threshold))
        .sort((a, b) => a.threshold - b.threshold);

    const selected = floatBuffs.find((b) => float < b.threshold);

    return selected
        ? {
              key: selected.key,
              icon: selected.icon,
              desc: selected.desc,
              multiplier: selected.multiplier,
              score: selected.score,
              isBuff: selected.isBuff ?? selected.score >= 0,
          }
        : {
              key: "floatUnranked",
              icon: "❔",
              desc: "Float does not match",
              multiplier: 1,
              score: 0,
              isBuff: false,
          };
}

function getNewsBuff(symbolData, buffList = [], blockList = []) {
    const news = symbolData.News || [];

    if (!Array.isArray(news) || news.length === 0) return null;

    const hasGoodNews = news.some((item) => {
        const headline = sanitize(item.headline || "");
        return !blockList.some((b) => headline.includes(sanitize(b)));
    });

    if (!hasGoodNews) return null;

    const def = buffList.find((b) => b.key === "hasNews") || {};
    return {
        key: "hasNews",
        icon: def.icon || "😼",
        desc: def.desc || "News catalyst",
        score: def.score ?? 100,
        multiplier: def.multiplier ?? 1.1,
        isBuff: def.isBuff ?? true,
    };
}

function getOwnershipBuff(symbolData, buffList = []) {
    const stats = symbolData.statistics || {};
    const ownership = symbolData.ownership || {};

    const floatShares = stats.floatShares || 0;
    const sharesOutstanding = stats.sharesOutstanding || 0;
    const insidersPercentHeld = ownership.insidersPercentHeld || 0;
    const institutionsPercentHeld = ownership.institutionsPercentHeld || 0;

    if (!sharesOutstanding) return null;

    const insiderShares = sharesOutstanding * insidersPercentHeld;
    const institutionalShares = sharesOutstanding * institutionsPercentHeld;
    const remainingShares = Math.max(sharesOutstanding - (floatShares + insiderShares + institutionalShares), 0);

    const totalHeld = insiderShares + institutionalShares + remainingShares;

    if (totalHeld > 0.5 * sharesOutstanding) {
        const def = buffList.find((b) => b.key === "lockedShares") || {};
        return {
            key: "lockedShares",
            icon: def.icon || "🏛️",
            desc: def.desc || "High insider/institutional ownership",
            score: def.score ?? -25,
            multiplier: def.multiplier ?? 1,
            isBuff: def.isBuff ?? false,
        };
    }

    return null;
}

function getIndustryBuff(symbolData, buffList = []) {
    const profile = symbolData.profile || {};
    const summary = typeof profile.longBusinessSummary === "string" ? profile.longBusinessSummary.toLowerCase() : "";
    const companyName = typeof profile.companyName === "string" ? profile.companyName.toLowerCase() : "";
    const industryL = typeof profile.industry === "string" ? profile.industry.toLowerCase() : "";

    const findFromBuffList = (key) => buffList.find((b) => b.key === key) || {};

    if (industryL === "biotechnology" || summary.includes("biotech") || summary.includes("biotechnology") || companyName.includes("biopharma")) {
        const def = findFromBuffList("bio");
        return {
            key: "bio",
            icon: def.icon || "🧬",
            desc: def.desc || "Biotech",
            score: def.score ?? 25,
            multiplier: def.multiplier ?? 1,
            isBuff: def.isBuff ?? true,
        };
    }

    if (summary.includes("cannabis")) {
        const def = findFromBuffList("weed");
        return {
            key: "weed",
            icon: def.icon || "🌿",
            desc: def.desc || "Cannabis",
            score: def.score ?? -10,
            multiplier: def.multiplier ?? 1,
            isBuff: def.isBuff ?? false,
        };
    }

    if (summary.includes("space")) {
        const def = findFromBuffList("space");
        return {
            key: "space",
            icon: def.icon || "🌌",
            desc: def.desc || "Space",
            score: def.score ?? 10,
            multiplier: def.multiplier ?? 1,
            isBuff: def.isBuff ?? true,
        };
    }

    return null;
}

function getCountryBuff(symbolData, buffList = []) {
    const country = symbolData.profile?.country?.toLowerCase();
    const def = buffList.find((b) => b.key === "china") || {};

    if (["china", "cn", "hk", "hong kong"].includes(country)) {
        return {
            key: "china",
            icon: def.icon || "🇨🇳",
            desc: def.desc || "China",
            score: def.score ?? 0,
            multiplier: def.multiplier ?? 1,
            isBuff: def.isBuff ?? false,
        };
    }

    return null;
}

function getShortInterestBuff(symbolData, buffList = []) {
    const floatShares = symbolData.statistics?.floatShares || 0;
    const sharesShort = symbolData.statistics?.sharesShort || 0;

    if (!floatShares || floatShares <= 0) return null;

    const shortRatio = sharesShort / floatShares;
    const def = buffList.find((b) => b.key === "highShort") || {};

    if (shortRatio > 0.2) {
        return {
            key: "highShort",
            icon: def.icon || "🩳",
            desc: def.desc || "High short interest",
            score: def.score ?? 25,
            multiplier: def.multiplier ?? 1,
            isBuff: def.isBuff ?? true,
        };
    }

    return null;
}

function getNetLossBuff(symbolData, buffList = []) {
    const netIncome = symbolData.financials?.cashflowStatement?.netIncome;
    const def = buffList.find((b) => b.key === "netLoss") || {};

    if (typeof netIncome === "number" && netIncome < 0) {
        return {
            key: "netLoss",
            icon: def.icon || "🥅",
            desc: def.desc || "Net loss",
            score: def.score ?? -25,
            multiplier: def.multiplier ?? 1,
            isBuff: def.isBuff ?? false,
        };
    }

    return null;
}

function getS3FilingBuff(symbolData, buffList = []) {
    const def = buffList.find((b) => b.key === "hasS3") || {};

    if (symbolData.offReg) {
        return {
            key: "hasS3",
            icon: def.icon || "📂",
            desc: def.desc || `S-3 (${symbolData.offReg})`,
            score: def.score ?? -25,
            multiplier: def.multiplier ?? 1,
            isBuff: def.isBuff ?? false,
        };
    }

    return null;
}

function getDilutionRiskBuff(symbolData, buffList = []) {
    const hasS3 = !!symbolData.offReg;
    const netIncome = symbolData.financials?.cashflowStatement?.netIncome;
    const isNetNegative = typeof netIncome === "number" && netIncome < 0;

    if (hasS3 && isNetNegative) {
        const def = buffList.find((b) => b.key === "dilutionRisk");

        return {
            key: def?.key || "dilutionRisk",
            icon: def?.icon || "🚨",
            desc: def?.desc || "High dilution risk",
            score: def?.score ?? -25,
            multiplier: def?.multiplier ?? 0.8,
            isBuff: def?.isBuff ?? false,
        };
    }

    return null;
}

function calculateVolumeImpact(volume = 0, price = 1, buffList = []) {
    const volumeCategories = buffList.filter((b) => b.priceThreshold != null && Array.isArray(b.volumeStages)).sort((a, b) => a.priceThreshold - b.priceThreshold);

    for (const category of volumeCategories) {
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

    // Fallback
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

function humanReadableNumbers(value) {
    if (!value || isNaN(value)) return "-";
    const num = Number(value);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
    return num.toLocaleString(); // For values smaller than 1,000
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

function getHeroBuff(hero, key) {
    if (!hero?.buffs) return null;
    const buff = hero.buffs[key];
    return buff && typeof buff === "object" ? buff : null;
}

// Export
module.exports = {
    computeBuffsForSymbol,
    calculateVolumeImpact,
    getHeroBuff,
};
