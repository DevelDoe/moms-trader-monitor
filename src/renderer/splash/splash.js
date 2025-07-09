document.addEventListener("DOMContentLoaded", async () => {
    console.log("DOM fully loaded and parsed");

    const spinner = document.getElementById("loading-spinner");
    const loginForm = document.getElementById("login-container");
    const statusText = document.getElementById("symbols-status");

    // 🔒 Start with spinner visible, login form visible, show loading message
    spinner.style.display = "block";
    loginForm.classList.remove("hidden");
    statusText.textContent = "Fetching symbols...";

    // 🌀 Symbol fetch with retry logic
    async function fetchSymbolsWithRetry(attempts = 3, delay = 1500) {
        for (let i = 0; i < attempts; i++) {
            try {
                const count = await window.electronAPI.fetchSymbols(); // assuming you expose it
                return count;
            } catch (err) {
                console.warn(`Fetch attempt ${i + 1} failed`);
                if (i < attempts - 1) await new Promise(r => setTimeout(r, delay));
                else throw err;
            }
        }
    }

    try {
        const symbolCount = await fetchSymbolsWithRetry();
        spinner.style.display = "none";
        statusText.textContent = `Fetched ${symbolCount} symbols.`;
        console.log(`✅ Symbols fetched: ${symbolCount}`);
    } catch (err) {
        spinner.style.display = "none";
        statusText.textContent = "⚠️ Failed to fetch symbols.";
        console.error("❌ Failed to fetch symbols:", err);
    }

    // 🧾 Handle login
    document.getElementById("loginForm").addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const loginButton = document.getElementById("login-button");
        const spinner = document.getElementById("login-spinner");
        const errorDisplay = document.getElementById("error");

        loginButton.disabled = true;
        spinner.classList.remove("hidden");
        errorDisplay.textContent = "";

        try {
            const response = await fetch("https://scribe.arcanemonitor.com/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Invalid credentials");

            window.electronAPI.sendAuthInfo({
                token: data.token,
                role: data.role,
                permissions: data.permissions || [],
                userId: data.userId,
            });

            window.electronAPI.closeSplash();
            window.location.href = "main.html";
        } catch (error) {
            errorDisplay.textContent = error.message;
        } finally {
            loginButton.disabled = false;
            spinner.classList.add("hidden");
        }
    });
});
