const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const createLogger = require("../../hlps/logger");
const tickerStore = require("../store");
const fs = require("fs");
const path = require("path");
const log = createLogger(__filename);
const processedListFile = path.join(__dirname, "processedList.json");

// ✅ Load processedList from file if available
let processedList = [];
if (fs.existsSync(processedListFile)) {
    try {
        processedList = JSON.parse(fs.readFileSync(processedListFile, "utf8"));
        log.log(`📂 Loaded ${processedList.length} processed tickers from file.`);
    } catch (error) {
        log.error("❌ Failed to load processedList from file:", error);
    }
}

// ✅ Function to save processedList to file
function saveProcessedList() {
    fs.writeFileSync(processedListFile, JSON.stringify(processedList.slice(0, 100), null, 2), "utf8");
}

puppeteer.use(StealthPlugin());

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

           
