// src/main/data/buffManager.js
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

class BuffManager extends EventEmitter {
    constructor() {
        super();
        this.buffs = [];
        this.filePath = path.join(__dirname, "../../data/buffs.json");
        this.loadBuffs();
        this.watchFile();
    }

    loadBuffs() {
        try {
            const raw = fs.readFileSync(this.filePath, "utf-8");
            this.buffs = JSON.parse(raw);
            this.emit("update", this.buffs); // Notify renderers
            console.log("✅ Buffs loaded:", this.buffs.length);
        } catch (err) {
            console.error("❌ Failed to load buffs:", err);
            this.buffs = [];
        }
    }

    watchFile() {
        fs.watchFile(this.filePath, { interval: 1000 }, () => {
            console.log("📂 buffs.json changed. Reloading...");
            this.loadBuffs();
        });
    }

    getBuffs() {
        return this.buffs;
    }
}

module.exports = new BuffManager();
