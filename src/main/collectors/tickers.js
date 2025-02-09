const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { ipcMain } = require("electron"); // ✅ Use ipcMain instead
const { verboseLog, log, logError, logSuccess } = require("../../hlps/logger");

puppeteer.use(StealthPlugin());

let lastScrapedData = new Map(); // ✅ Stores last seen entries to avoid duplicates

async function launchBrowser() {
    verboseLog("🚀 Launching Puppeteer...");
    try {
        return await puppeteer.launch({
            headless: true,
            args: ["--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox"],
        });
    } catch (error) {
        logError("Browser launch failed:", error);
    }
}

async function scrapeData() {
    const browser = await launchBrowser();
    if (!browser) return logError("ailed to launch browser.");

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0");

    try {
        verboseLog("🌐 Navigating to Momo Screener...");
        await page.goto("https://momoscreener.com/scanner", { waitUntil: "networkidle2" });

        await page.waitForSelector(".tableFixHead tbody tr", { visible: true, timeout: 60000 });

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

                    // Ensure valid symbol pattern
                    const symbolPattern = /^[A-Za-z★]{1,6}(\s*\(HOD\))?$/;
                    if (!symbolPattern.test(symbol)) return null;

                    // Handle "(HOD)" suffix
                    const isHOD = symbol.endsWith("(HOD)");
                    if (isHOD) symbol = symbol.replace(/\s*\(HOD\)$/, "").trim();

                    return { Symbol: symbol, Price: price, ChangePercent: changePercent, FiveM: fiveM, Float: float, Volume: volume, SprPercent: sprPercent, Time: time, HighOfDay: isHOD };
                })
                .filter(Boolean); // Remove null values
        });

        if (newScrape.length > 0) {
            // ✅ Filter duplicates based on Symbol + Time
            const uniqueEntries = newScrape.filter((entry) => {
                const uniqueKey = `${entry.Symbol}-${entry.Time}`;
                if (lastScrapedData.has(uniqueKey)) return false; // Skip duplicate
                lastScrapedData.set(uniqueKey, true); // Store as seen
                return true;
            });

            // ✅ Limit the stored entries to avoid memory bloat
            if (lastScrapedData.size > 500) {
                lastScrapedData = new Map([...lastScrapedData].slice(-300)); // Keep the latest 300 entries
            }

            if (uniqueEntries.length > 0) {
                logSuccess(`✅ Scraped ${uniqueEntries.length} new unique entries!`);
                ipcMain.emit("new-tickers-collected", null, uniqueEntries);  // ✅ Send new data to `main.js`
            } else {
                log("⚠️ No new unique tickers found. Skipping update.");
            }
        }
    } catch (error) {
        logError(` Scrape error: ${error.message}`);
        console.error(error); // Print full error stack for debugging
    } finally {
        await page.close(); // ✅ Prevent memory leaks
        await browser.close();
        verboseLog(" Browser closed.");
    }
}

function collectTickers(minIntervalMs = 7000, maxIntervalMs = 60000) {
    log("Starting scraper loop...");

    function getRandomInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async function run() {
        await scrapeData();
        const interval = getRandomInterval(minIntervalMs, maxIntervalMs);
        log(`Next scrape in ${interval / 1000} seconds`);
        setTimeout(run, interval);
    }

    run();
}

module.exports = { collectTickers };
