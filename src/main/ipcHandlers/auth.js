const { ipcMain } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const log = require("../../hlps/logger")(__filename);

// 🔒 Encrypted password storage
const PASSWORD_FILE = path.join(app.getPath("userData"), "password.json");

// Simple static key + IV for fast local crypto (not secure for high-sensitivity apps)
const algorithm = "aes-256-cbc";
const secretKey = crypto.createHash("sha256").update("arcane-magic-key").digest();
const iv = Buffer.alloc(16, 0);

function encrypt(text) {
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
}

function decrypt(encryptedText) {
    const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

function setupAuthHandlers() {
    // Auth info management
    ipcMain.on("set-auth-info", (event, info) => {
        log.log("[auth] Raw info from splash:", info);
        global.authInfo = info;
        log.log(`[auth] ✅ Received auth info: ${info?.userId}`);
    });

    // Login handling
    ipcMain.handle("login", async (_event, { email, password }) => {
        const log = require("../../hlps/logger")(__filename);

        try {
            const response = await fetch("https://scribe.arcanemonitor.com/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || "Invalid credentials");

            return { success: true, user: data };
        } catch (err) {
            log.error("❌ Login failed:", err.message);
            return { success: false, error: err.message };
        }
    });

    // Credentials management
    ipcMain.handle("credentials:get", () => {
        try {
            if (fs.existsSync(PASSWORD_FILE)) {
                const data = JSON.parse(fs.readFileSync(PASSWORD_FILE, "utf8"));
                return {
                    email: data.email,
                    password: decrypt(data.password),
                };
            }
        } catch (err) {
            log.error("❌ Failed to read or decrypt password.json:", err);
        }
        return null;
    });

    ipcMain.handle("credentials:save", (_event, { email, password }) => {
        try {
            const encrypted = encrypt(password);
            const data = { email, password: encrypted };
            fs.writeFileSync(PASSWORD_FILE, JSON.stringify(data), "utf8");
        } catch (err) {
            log.error("❌ Failed to write encrypted password.json:", err);
        }
    });
}

module.exports = { setupAuthHandlers };
