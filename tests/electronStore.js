// tests/cursorStore.test.js (CommonJS)
const { expect } = require("chai");
const { getLastAckCursor, setLastAckCursor, resetCursor } = require("../src/main/electronStores");
const path = require("path");
const fs = require("fs");

// Clean test store between runs
const TEST_STORE_DIR = path.join(process.cwd(), ".mtm-test-store");
beforeEach(() => {
    try {
        fs.rmSync(TEST_STORE_DIR, { recursive: true, force: true });
    } catch {}
});

describe("top3 store", () => {
    function loadStoresWithStubs({ withApp = false } = {}) {
        const proxyquire = require("proxyquire");

        // spy-able WCs
        const wc1 = {
            id: 1,
            sent: [],
            send: function (ch, payload) {
                this.sent.push({ ch, payload });
            },
        };
        const wc2 = {
            id: 2,
            sent: [],
            send: function (ch, payload) {
                this.sent.push({ ch, payload });
            },
        };
        const webContents = { getAllWebContents: () => [wc1, wc2] };

        // minimal ipc/app stubs (ipc not used directly by tests)
        const ipcMain = {
            _handlers: {},
            handle: function (name, fn) {
                this._handlers[name] = fn;
            },
            removeHandler: function (name) {
                delete this._handlers[name];
            },
            _listeners: {},
            on: function (name, fn) {
                this._listeners[name] = fn;
            },
            removeAllListeners: function (name) {
                delete this._listeners[name];
            },
        };

        const app = withApp
            ? { on: () => {}, __top3_ipc_registered__: false } // no getPath => forces cwd store path
            : undefined;

        const electronStub = { app, ipcMain, webContents };

        const loggerStub = () => ({
            log: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
        });

        const stores = proxyquire("../src/main/electronStores", {
            electron: electronStub,
            "../hlps/logger": loggerStub,
        });

        return { stores, wc1, wc2 };
    }

    it("setTop3/getTop3 basic flow returns true on change and false on no-op", () => {
        const { stores } = loadStoresWithStubs();

        // starts empty
        const initial = stores.getTop3();
        expect(initial.entries).to.be.an("array").that.has.lengthOf(0);
        expect(initial.updatedAt).to.be.a("number");

        // set new list
        const changed = stores.setTop3(["areb", "nvda", "spy"]);
        expect(changed).to.equal(true);

        const after = stores.getTop3();
        expect(after.entries.map((e) => e.symbol)).to.deep.equal(["AREB", "NVDA", "SPY"]);
        expect(after.entries.map((e) => e.rank)).to.deep.equal([1, 2, 3]);
        expect(after.updatedAt)
            .to.be.a("number")
            .and.satisfy((v) => v > 0);

        // setting same list is a no-op
        const noop = stores.setTop3([
            { symbol: "AREB", rank: 1 },
            { symbol: "NVDA", rank: 2 },
            { symbol: "SPY", rank: 3 },
        ]);
        expect(noop).to.equal(false);
    });

    it("normalizes input: uppercases, dedupes, trims to 3, fixes ranks", () => {
        const { stores } = loadStoresWithStubs();

        // Provide 3 valid ranks within 1..3 in the first 4 positions; include a duplicate for AAPL.
        stores.setTop3([
            { symbol: "aapl", rank: 2, score: 10 }, // kept (AAPL)
            { symbol: "AAPL", rank: 1, score: 11 }, // duplicate -> skipped
            { symbol: "tsla", rank: 3 }, // kept (TSLA)
            { symbol: "spy", rank: 3 }, // kept (SPY) -> gives us 3 entries
            "tsla", // duplicate -> ignored
            "nvda", // later items irrelevant once 3 are collected
        ]);

        const { entries } = stores.getTop3();
        expect(entries).to.have.lengthOf(3);
        expect(entries.map((e) => e.symbol)).to.deep.equal(["AAPL", "TSLA", "SPY"]);
        // normalize() reassigns ranks sequentially after sorting by rank
        expect(entries.map((e) => e.rank)).to.deep.equal([1, 2, 3]);
    });

    it("broadcasts 'top3:change' to all WebContents on change", () => {
        const { stores, wc1, wc2 } = loadStoresWithStubs();

        stores.setTop3(["amd", "intc", "nvda"]);
        // Each WC should have received exactly one push
        expect(wc1.sent).to.have.lengthOf(1);
        expect(wc2.sent).to.have.lengthOf(1);
        expect(wc1.sent[0].ch).to.equal("top3:change");
        expect(wc2.sent[0].ch).to.equal("top3:change");

        const payload = wc1.sent[0].payload;
        expect(payload.entries.map((e) => e.symbol)).to.deep.equal(["AMD", "INTC", "NVDA"]);

        // Setting same list again should not broadcast
        stores.setTop3(["amd", "intc", "nvda"]);
        expect(wc1.sent).to.have.lengthOf(1);
        expect(wc2.sent).to.have.lengthOf(1);
    });

    it("persists entries to disk (re-require module reads previous state)", async () => {
        const proxyquire = require("proxyquire");

        // 1) First load with stubs and set the list
        const { stores } = loadStoresWithStubs(); // <-- you already defined this helper above
        stores.setTop3(["areb", "tsla", "spy"]);
        expect(stores.getTop3().entries.map((e) => e.symbol)).to.deep.equal(["AREB", "TSLA", "SPY"]);

        // 2) Wait for coalesced write (FLUSH_INTERVAL_MS = 100)
        await new Promise((r) => setTimeout(r, 150));

        // 3) Clear require cache so next import re-reads disk
        const modPath = require.resolve("../src/main/electronStores");
        delete require.cache[modPath];

        // 4) Re-require with minimal stubs (no app.getPath => uses .mtm-test-store)
        const electronStub = { webContents: { getAllWebContents: () => [] } };
        const loggerStub = () => ({ log: () => {} });

        const storesReloaded = proxyquire("../src/main/electronStores", {
            electron: electronStub,
            "../hlps/logger": loggerStub,
        });

        const afterReload = storesReloaded.getTop3();
        expect(afterReload.entries.map((e) => e.symbol)).to.deep.equal(["AREB", "TSLA", "SPY"]);
    });

    it("updatedAt changes when setTop3 applies a change", (done) => {
        const { stores } = loadStoresWithStubs();
        const a = stores.getTop3().updatedAt;

        stores.setTop3(["a", "b", "c"]);
        const b = stores.getTop3().updatedAt;

        // ensure monotonic increase; allow same-millisecond edge by delaying and changing again
        if (b > a) {
            return done();
        }
        setTimeout(() => {
            stores.setTop3(["a", "b", "d"]);
            const c = stores.getTop3().updatedAt;
            expect(c).to.be.greaterThan(b);
            done();
        }, 5);
    });
});

describe("XP settings store", () => {
    function loadStoresWithStubs({ withApp = false } = {}) {
        const proxyquire = require("proxyquire");

        // spy-able WCs
        const wc1 = {
            id: 1,
            sent: [],
            send: function (ch, payload) {
                this.sent.push({ ch, payload });
            },
        };
        const wc2 = {
            id: 2,
            sent: [],
            send: function (ch, payload) {
                this.sent.push({ ch, payload });
            },
        };
        const webContents = { getAllWebContents: () => [wc1, wc2] };

        // minimal ipc/app stubs
        const ipcMain = {
            _handlers: {},
            handle: function (name, fn) {
                this._handlers[name] = fn;
            },
            removeHandler: function (name) {
                delete this._handlers[name];
            },
            _listeners: {},
            on: function (name, fn) {
                this._listeners[name] = fn;
            },
            removeAllListeners: function (name) {
                delete this._listeners[name];
            },
        };

        const app = withApp
            ? { on: () => {}, __xp_settings_ipc_registered__: false }
            : undefined;

        const electronStub = { app, ipcMain, webContents };

        const loggerStub = () => ({
            log: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
        });

        const stores = proxyquire("../src/main/electronStores", {
            electron: electronStub,
            "../hlps/logger": loggerStub,
        });

        return { stores, wc1, wc2 };
    }

    it("should have default XP settings", () => {
        const { stores } = loadStoresWithStubs();
        
        expect(stores.getXpListLength()).to.equal(25);
        expect(stores.getXpShowHeaders()).to.equal(true);
    });

    it("should update XP list length and broadcast change", () => {
        const { stores, wc1, wc2 } = loadStoresWithStubs();

        const changed = stores.setXpListLength(15);
        expect(changed).to.equal(true);
        expect(stores.getXpListLength()).to.equal(15);

        // Should broadcast to all WebContents
        expect(wc1.sent).to.have.lengthOf(1);
        expect(wc2.sent).to.have.lengthOf(1);
        expect(wc1.sent[0].ch).to.equal("xp-settings:change");
        
        const payload = wc1.sent[0].payload;
        expect(payload.listLength).to.equal(15);
        expect(payload.showHeaders).to.equal(true); // Should preserve showHeaders
    });

    it("should update XP show headers and broadcast change", () => {
        const { stores, wc1, wc2 } = loadStoresWithStubs();

        const changed = stores.setXpShowHeaders(false);
        expect(changed).to.equal(true);
        expect(stores.getXpShowHeaders()).to.equal(false);

        // Should broadcast to all WebContents
        expect(wc1.sent).to.have.lengthOf(1);
        expect(wc2.sent).to.have.lengthOf(1);
        expect(wc1.sent[0].ch).to.equal("xp-settings:change");
        
        const payload = wc1.sent[0].payload;
        expect(payload.listLength).to.equal(25); // Should preserve listLength
        expect(payload.showHeaders).to.equal(false);
    });

    it("should clamp XP list length to valid range", () => {
        const { stores } = loadStoresWithStubs({ withApp: true });

        // Test below minimum - 0 defaults to 25 due to || 25 fallback
        stores.setXpListLength(0);
        expect(stores.getXpListLength()).to.equal(25);

        // Test above maximum
        stores.setXpListLength(100);
        expect(stores.getXpListLength()).to.equal(50);

        // Test valid range
        stores.setXpListLength(30);
        expect(stores.getXpListLength()).to.equal(30);
    });

    it("should not broadcast on no-op changes", () => {
        const { stores, wc1, wc2 } = loadStoresWithStubs({ withApp: true });

        // Set initial values
        stores.setXpListLength(20);
        stores.setXpShowHeaders(false);
        
        // Clear sent messages
        wc1.sent.length = 0;
        wc2.sent.length = 0;

        // No-op changes
        const noop1 = stores.setXpListLength(20);
        const noop2 = stores.setXpShowHeaders(false);
        
        expect(noop1).to.equal(false);
        expect(noop2).to.equal(false);
        expect(wc1.sent).to.have.lengthOf(0);
        expect(wc2.sent).to.have.lengthOf(0);
    });

    it("should persist XP settings to disk", async () => {
        const proxyquire = require("proxyquire");

        // 1) First load with stubs and set settings
        const { stores } = loadStoresWithStubs();
        stores.setXpListLength(18);
        stores.setXpShowHeaders(false);
        
        expect(stores.getXpListLength()).to.equal(18);
        expect(stores.getXpShowHeaders()).to.equal(false);

        // 2) Wait for coalesced write
        await new Promise((r) => setTimeout(r, 150));

        // 3) Clear require cache
        const modPath = require.resolve("../src/main/electronStores");
        delete require.cache[modPath];

        // 4) Re-require with minimal stubs
        const electronStub = { webContents: { getAllWebContents: () => [] } };
        const loggerStub = () => ({ log: () => {} });

        const storesReloaded = proxyquire("../src/main/electronStores", {
            electron: electronStub,
            "../hlps/logger": loggerStub,
        });

        // 5) Verify persistence
        expect(storesReloaded.getXpListLength()).to.equal(18);
        expect(storesReloaded.getXpShowHeaders()).to.equal(false);
    });
});

describe("HOD settings store", () => {
    function loadStoresWithStubs({ withApp = false } = {}) {
        const proxyquire = require("proxyquire");

        // spy-able WCs
        const wc1 = {
            id: 1,
            sent: [],
            send: function (ch, payload) {
                this.sent.push({ ch, payload });
            },
        };
        const wc2 = {
            id: 2,
            sent: [],
            send: function (ch, payload) {
                this.sent.push({ ch, payload });
            },
        };
        const webContents = { getAllWebContents: () => [wc1, wc2] };

        // minimal ipc/app stubs
        const ipcMain = {
            _handlers: {},
            handle: function (name, fn) {
                this._handlers[name] = fn;
            },
            removeHandler: function (name) {
                delete this._handlers[name];
            },
            _listeners: {},
            on: function (name, fn) {
                this._listeners[name] = fn;
            },
            removeAllListeners: function (name) {
                delete this._listeners[name];
            },
        };

        const app = withApp
            ? { on: () => {}, __hod_settings_ipc_registered__: false }
            : undefined;

        const electronStub = { app, ipcMain, webContents };

        const loggerStub = () => ({
            log: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
        });

        const stores = proxyquire("../src/main/electronStores", {
            electron: electronStub,
            "../hlps/logger": loggerStub,
        });

        return { stores, wc1, wc2 };
    }

    it("should have default HOD settings", () => {
        const { stores } = loadStoresWithStubs();
        
        expect(stores.getHodListLength()).to.equal(10);
    });

    it("should update HOD list length and broadcast change", () => {
        const { stores, wc1, wc2 } = loadStoresWithStubs();

        const changed = stores.setHodListLength(15);
        expect(changed).to.equal(true);
        expect(stores.getHodListLength()).to.equal(15);

        // Should broadcast to all WebContents
        expect(wc1.sent).to.have.lengthOf(1);
        expect(wc2.sent).to.have.lengthOf(1);
        expect(wc1.sent[0].ch).to.equal("hod-settings:change");
        
        const payload = wc1.sent[0].payload;
        expect(payload.listLength).to.equal(15);
    });

    it("should clamp HOD list length to valid range", () => {
        const { stores } = loadStoresWithStubs({ withApp: true });

        // Test below minimum - 0 defaults to 10 due to || 10 fallback
        stores.setHodListLength(0);
        expect(stores.getHodListLength()).to.equal(10);

        // Test above maximum
        stores.setHodListLength(100);
        expect(stores.getHodListLength()).to.equal(50);

        // Test valid range
        stores.setHodListLength(25);
        expect(stores.getHodListLength()).to.equal(25);
    });

    it("should not broadcast on no-op changes", () => {
        const { stores, wc1, wc2 } = loadStoresWithStubs({ withApp: true });

        // Set initial value
        stores.setHodListLength(20);
        
        // Clear sent messages
        wc1.sent.length = 0;
        wc2.sent.length = 0;

        // No-op change
        const noop = stores.setHodListLength(20);
        
        expect(noop).to.equal(false);
        expect(wc1.sent).to.have.lengthOf(0);
        expect(wc2.sent).to.have.lengthOf(0);
    });

    it("should persist HOD settings to disk", async () => {
        const proxyquire = require("proxyquire");

        // 1) First load with stubs and set settings
        const { stores } = loadStoresWithStubs();
        stores.setHodListLength(18);
        
        expect(stores.getHodListLength()).to.equal(18);

        // 2) Wait for coalesced write
        await new Promise((r) => setTimeout(r, 150));

        // 3) Clear require cache
        const modPath = require.resolve("../src/main/electronStores");
        delete require.cache[modPath];

        // 4) Re-require with minimal stubs
        const electronStub = { webContents: { getAllWebContents: () => [] } };
        const loggerStub = () => ({ log: () => {} });

        const storesReloaded = proxyquire("../src/main/electronStores", {
            electron: electronStub,
            "../hlps/logger": loggerStub,
        });

        // 5) Verify persistence
        expect(storesReloaded.getHodListLength()).to.equal(18);
    });
});

describe("cursor store", () => {
    beforeEach(() => resetCursor());

    it("should start at 0", () => {
        expect(getLastAckCursor()).to.equal(0);
    });

    it("should update to higher cursor", () => {
        setLastAckCursor(5);
        expect(getLastAckCursor()).to.equal(5);
    });

    it("should ignore lower cursor values", () => {
        setLastAckCursor(10);
        setLastAckCursor(5);
        expect(getLastAckCursor()).to.equal(10);
    });
});
