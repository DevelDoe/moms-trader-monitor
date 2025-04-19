# 🧙‍♂️ TODO: Buffs Fix + Candlebeard's Mess Toast System

## 🎯 Goal

Fix the existing buffs system, ensuring accurate logic and visuals, then refactor the toast/notification system for clarity and reliability.

---

## ✅ Phase 1: Buffs System Fix

-   [x] Load buffs from shared external JSON (`buffs.json`)
-   [x] Create the ui
-   [ ] Validate structure: each buff must include:
    -   [ ] `icon` (string)
    -   [ ] `desc` (string)
    -   [ ] `key` (string or field to evaluate)
-   [ ] Ensure buffs apply correctly per symbol in Focus view
-   [ ] Add logging to confirm active buffs per symbol
-   [ ] Handle missing buffs gracefully (no crash)
-   [ ] Add dev helper UI to inspect current buffs per symbol (optional)
-   [ ] Confirm buffs render correctly in Live/Focus/Frontline views

---

## 🌩️ Phase 2: Toast System Cleanup

-   [ ] Audit all toast messages triggered in the system
-   [ ] Define toast levels: info / warning / success / error / magic
-   [ ] Create `toastManager` or `useToasts()` helper module
-   [ ] Replace direct DOM manipulation with reusable function or component
-   [ ] Add support for auto-dismiss with optional duration
-   [ ] Style consistent theme (border radius, shadow, font size)
-   [ ] Animate entrance/exit for toasts (slide or fade)
-   [ ] Optionally support stack or replace mode
-   [ ] Add “debug toast” toggle in dev mode for testing output

---

## 🧪 Testing

-   [ ] Add fake buff data for debug session
-   [ ] Simulate triggers for toasts (e.g., new high, alert blocked, error)
-   [ ] Confirm toast does not duplicate or overlap improperly
-   [ ] Verify memory cleanup after dismissal

---

## 🏁 Merge Plan

-   [ ] Test both systems independently in feature branch
-   [ ] Merge into `main` or `next-release` branch
-   [ ] Validate that settings persist and display remains stable
-   [ ] Tag release and mark Candlebeard system _exorcised_

---

> “Buffs restored. Toasts redeemed. Candlebeard sleeps once more.”
