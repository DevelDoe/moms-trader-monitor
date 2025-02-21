const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const createLogger = require("../../hlps/logger");
const tickerStore = require("../store"); // ✅ Import store

puppeteer.use(StealthPlugin());

const log = createLogger(__filename);

/**
 * Launch Puppeteer Browser
 */
async function launchBrowser() {
    log.log("Launching Puppeteer...");
    try {
        return await puppeteer.launch({
            headless: true,
            args: ["--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox"],
        });
    } catch (error) {
        log.error("❌ Browser launch failed:", error);
        return null;
    }
}

/**
 * Scrapes data from Momo Screener
 */
async function scrapeData() {
    const browser = await launchBrowser();
    if (!browser) return log.error("❌ Failed to launch browser.");

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0");

    try {
        log.log("🌐 Navigating to Momo Screener...");
        await page.goto("https://momoscreener.com/scanner", { waitUntil: "networkidle2" });

        await page.waitForSelector(".tableFixHead tbody tr", { visible: true, timeout: 60000 });

        // Scrape ticker data
        const newScrape = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".tableFixHead tbody tr"))
                .map((row) => {
                    const cells = row.cells;
                    if (!cells || cells.length !== 8) return null;

                    let symbol = cells[0]?.innerText.trim() || "";
                    const price = cells[1]?.innerText.trim() || "";
                    const changePercent = cells[2]?.innerText.trim() || "";
                    const fiveM = cells[3]?.innerText.trim() || "";
                    const float = cells[4]?.innerText.trim() || "";
                    const volume = cells[5]?.innerText.trim() || "";
                    const sprPercent = cells[6]?.innerText.trim() || "";
                    const time = cells[7]?.innerText.trim() || "";

                    const symbolPattern = /^[A-Za-z★]{1,6}(\s*\(HOD\))?$/;
                    if (!symbolPattern.test(symbol)) return null;

                    const isHOD = symbol.endsWith("(HOD)");
                    if (isHOD) symbol = symbol.replace(/\s*\(HOD\)$/, "").trim();

                    return { Symbol: symbol, Price: price, ChangePercent: changePercent, FiveM: fiveM, Float: float, Volume: volume, SprPercent: sprPercent, Time: time, HighOfDay: isHOD };
                })
                .filter(Boolean);
        });

        if (newScrape.length > 0) {
            log.log(`📊 Scraped ${newScrape.length} entries`);

            // Filter out duplicates based on Symbol and Time combination
            const uniqueEntries = newScrape.filter((ticker) => {
                const symbolNormalized = ticker.Symbol.trim().toUpperCase();
                const key = `${symbolNormalized}-${ticker.Time}`;
                
                // ✅ Check if ticker was already processed
                if (tickerStore.processedList.some(entry => entry.key === key)) {
                    return false; // Skip duplicate
                }

                return true;
            });

            // ✅ Update `processedList` with new entries, limiting to 100 entries
            uniqueEntries.forEach((ticker) => {
                const symbolNormalized = ticker.Symbol.trim().toUpperCase();
                const key = `${symbolNormalized}-${ticker.Time}`;

                tickerStore.processedList.unshift({ key, Symbol: symbolNormalized, Time: ticker.Time });

                // Keep only last 100 entries
                if (tickerStore.processedList.length > 100) {
                    tickerStore.processedList.pop();
                }
            });

            if (uniqueEntries.length > 0) {
                log.log(`✅ Storing ${uniqueEntries.length} new unique entries`);
                tickerStore.addTickers(uniqueEntries);
            } else {
                log.log("⚠️ No new unique entries found. Skipping update.");
            }
        }
    } catch (error) {
        log.error(`❌ Scrape error: ${error.message}`);
    } finally {
        await page.close();
        await browser.close();
        log.log("🛑 Browser closed");
    }
}

/**
 * Collects tickers at random intervals
 */
function collectTickers(minIntervalMs = 7000, maxIntervalMs = 60000) {
    log.log("🔄 Starting scraper loop...");

    function getRandomInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async function run() {
        await scrapeData();
        const interval = getRandomInterval(minIntervalMs, maxIntervalMs);
        log.log(`⏳ Next scrape in ${interval / 1000} seconds`);
        setTimeout(run, interval);
    }

    run();
}

module.exports = { collectTickers };
