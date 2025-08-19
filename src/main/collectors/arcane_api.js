// File: src/main/collectors/arcane_api.js  (CommonJS for Electron main)
const store = require("../store");
const { setLastAckCursor } = require("../electronStores");

// Node 18+/Electron 28+ have global fetch. If not, uncomment the undici polyfill:
// global.fetch ??= require("undici").fetch;

const BASE_URL = process.env.ARCANE_API_URL || "https://scribe.arcanemonitor.com";

// ---- simple helpers ----
async function fetchJSON(url, errLabel) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${errLabel}: ${res.status}`);
    return res.json();
}

// ---- basic endpoints ----
async function hydrateSymbols(limit = 2000, offset = 0) {
    // returns the raw snapshot page (caller can inspect items/count, etc.)
    return fetchJSON(`${BASE_URL}/symbols/snapshot?limit=${limit}&offset=${offset}`, "Failed to hydrate symbols");
}

async function fetchSymbolBatch(syms) {
    const list = Array.isArray(syms) ? syms : String(syms ?? "").split(",");
    return fetchJSON(`${BASE_URL}/symbols/batch?syms=${list.map((s) => String(s).trim().toUpperCase()).join(",")}`, "Failed to fetch batch");
}

async function fetchCursor() {
    return fetchJSON(`${BASE_URL}/symbols/cursor`, "Failed to fetch cursor");
}

async function fetchOpsSince(since, limit = 1000) {
    return fetchJSON(`${BASE_URL}/symbols/ops?since=${Number(since) || 0}&limit=${limit}`, "Failed to fetch ops");
}

// ---- dynamic pagination hydrator ----
const TARGET_REQUESTS = 4;
const MAX_PAGE = 10000;
const MIN_PAGE = 500;

function pickPageSize(count) {
    if (!Number.isFinite(count) || count <= 0) return 2000;
    const size = Math.ceil(count / TARGET_REQUESTS);
    return Math.max(MIN_PAGE, Math.min(size, MAX_PAGE));
}

/**
 * Hydrates *all* symbols, then calls store.applyFull(all, currentCursor)
 * Returns the total count.
 */
async function hydrateAndApplySymbols(initialProbe = 1000) {
    // 1) probe
    const first = await hydrateSymbols(initialProbe, 0);
    const count = Number(first?.count ?? first.items?.length ?? 0) || 0;
    const currentCursor = Number(first?.currentCursor ?? 0) || 0;

    // 2) decide page size
    const pageSize = pickPageSize(count);

    // 3) accumulate all items
    const all = Array.isArray(first.items) ? [...first.items] : [];
    while (all.length < count) {
        const page = await hydrateSymbols(pageSize, all.length);
        if (!Array.isArray(page.items) || page.items.length === 0) break;
        all.push(...page.items);
    }

    // 4) apply to store (cursor used as version)
    try {
        store.applyFull(all, currentCursor);
    } catch (e) {
        console.error("[hydrateAndApplySymbols] applyFull failed:", e);
        throw e;
    }

    // 5) persist cursor for deltas (main-safe)
    try {
        setLastAckCursor(currentCursor);
    } catch {}

    return count;
}

module.exports = {
    hydrateSymbols,
    fetchSymbolBatch,
    fetchCursor,
    fetchOpsSince,
    hydrateAndApplySymbols,
};
