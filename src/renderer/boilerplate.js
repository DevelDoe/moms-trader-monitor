// ──────────────────────────────────────────────────────────────────────────────
// Boilerplate View — subscribe-first, tracked-only, tiny state, RAF render
// ──────────────────────────────────────────────────────────────────────────────

/* helpers (outside doc ready) */
const up = (s) =>
    String(s || "")
        .replace(/^\$+/, "")
        .trim()
        .toUpperCase();
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/* small state */
const state = {
    items: new Map(), // id -> { id, value, updatedAt }
    tracked: [], // array of ids (strings, UPPERCASED)
    renderKey: "",
    rafPending: false,
};

/* render scheduling */
function markDirty() {
    if (state.rafPending) return; // already scheduled, do nothing
    state.rafPending = true; // lock
    requestAnimationFrame(() => {
        // schedule for next frame
        state.rafPending = false; // unlock
        render(); // one render
    });
}

/* core render */
function render() {
    const el = document.getElementById("list");
    if (!el) return;

    // tracked-only view
    const order = new Map(state.tracked.map((id, i) => [id, i]));
    const rows = [];
    for (const [id, item] of state.items) {
        if (!order.has(id)) continue;
        rows.push(item);
    }

    // keep the tracked order; tie-break with updatedAt (desc)
    rows.sort((a, b) => {
        const ao = order.get(a.id) ?? Infinity;
        const bo = order.get(b.id) ?? Infinity;
        if (ao !== bo) return ao - bo;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    const key = rows.map((r) => `${r.id}:${r.value}`).join("|") || "∅";
    if (state.renderKey && state.renderKey === key) return;
    state.renderKey = key;

    el.innerHTML = rows
        .map(
            (r, idx) => `
      <div class="row">
        <span class="idx">${idx + 1}.</span>
        <strong class="id">${r.id}</strong>
        <span class="val">${r.value}</span>
      </div>`
        )
        .join("");

    // one delegated click handler
    if (!el.__boundClick) {
        el.__boundClick = true;
        el.addEventListener("click", (e) => {
            const row = e.target.closest(".row");
            if (!row) return;
            const id = row.querySelector(".id")?.textContent?.trim();
            if (id) {
                // example action
                window.activeAPI?.setActiveTicker?.(id);
            }
        });
    }
}

/* boot */
document.addEventListener("DOMContentLoaded", async () => {
    // wait for bridges
    while (!(window.storeAPI && window.eventsAPI)) {
        await new Promise((r) => setTimeout(r, 150));
    }

    // subscribe FIRST so we don’t miss the initial push
    window.storeAPI.onTrackedUpdate((list = []) => {
        state.tracked = (list || []).map(up);
        // prune anything not tracked anymore
        if (state.tracked.length) {
            const allow = new Set(state.tracked);
            let removed = false;
            for (const id of Array.from(state.items.keys())) {
                if (!allow.has(id)) {
                    state.items.delete(id);
                    removed = true;
                }
            }
            if (removed) markDirty();
        }
        markDirty();
    });

    // (optional) snapshot of tracked; delete if you want pure event-driven
    try {
        const snap = await window.storeAPI.getTracked();
        if (Array.isArray(snap) && snap.length) {
            state.tracked = snap.map(up);
            markDirty();
        }
    } catch {}

    // strict tracked-only item updates
    if (window.eventsAPI?.onItem) {
        window.eventsAPI.onItem((p = {}) => {
            const id = up(p.id);
            if (!id) return;
            if (!state.tracked.includes(id)) return; // hard gate

            const cur = state.items.get(id) || { id, value: 0, updatedAt: 0 };
            if (typeof p.value === "number") cur.value = p.value;
            cur.updatedAt = Date.now();
            state.items.set(id, cur);
            markDirty();
        });
    }

    // first paint (in case tracked arrived already)
    markDirty();
});
