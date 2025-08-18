document.addEventListener("DOMContentLoaded", async () => {
    console.log("DOM fully loaded and parsed");
    window.splashAPI?.notifyReady();

    const spinner = document.getElementById("loading-spinner");
    const loginForm = document.getElementById("login-container");
    const statusText = document.getElementById("symbols-status");
    

    window.electronAPI.onSymbolsFetched(async (_event, symbolCount) => {
        setBackgroundWhenReady("../../../assets/images/splash.jpg");
    });

    // 🔒 Start with spinner visible, login form hidden
    spinner.style.display = "block";
    loginForm.classList.add("hidden");
    statusText.textContent = "Fetching symbols...";

    window.electronAPI.onSymbolsFetched(async (_event, symbolCount) => {
        spinner.style.display = "none";
        loginForm.classList.remove("hidden");

        if (symbolCount > 0) {
            statusText.textContent = `✅ Fetched ${symbolCount} symbols.`;

            // 🔑 Auto-login if password.json is present
            const credentials = await window.autoLogin.getCredentials();
            if (credentials) {
                const { email, password } = credentials;
                console.log("🔑 Auto-login with", email);

                const result = await window.electronAPI.login(email, password);

                if (result.success) {
                    const data = result.user;

                    window.electronAPI.sendAuthInfo({
                        token: data.token,
                        role: data.role,
                        permissions: data.permissions || [],
                        userId: data.userId,
                    });

                    window.electronAPI.closeSplash();
                    window.location.href = "main.html";
                } else {
                    document.getElementById("error").textContent = result.error;
                }
            }
        } else {
            statusText.textContent = "⚠️ Failed to fetch symbols.";
        }
    });

    // 🧾 Handle login
    document.getElementById("loginForm").addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const rememberMe = document.getElementById("rememberMe").checked;
        const loginButton = document.getElementById("login-button");
        const spinner = document.getElementById("login-spinner");
        const errorDisplay = document.getElementById("error");

        loginButton.disabled = true;
        spinner.classList.remove("hidden");
        errorDisplay.textContent = "";

        try {
            const result = await window.electronAPI.login(email, password);

            if (result.success) {
                if (rememberMe) {
                    window.autoLogin.saveCredentials({ email, password }); // ✅ Save encrypted
                }

                const data = result.user;

                window.electronAPI.sendAuthInfo({
                    token: data.token,
                    role: data.role,
                    permissions: data.permissions || [],
                    userId: data.userId,
                });

                window.electronAPI.closeSplash();
                window.location.href = "main.html";
            } else {
                errorDisplay.textContent = result.error;
            }
        } catch (error) {
            errorDisplay.textContent = "Unexpected error occurred.";
            console.error("Login error:", error);
        } finally {
            loginButton.disabled = false;
            spinner.classList.add("hidden");
        }
    });
});

const splash = document.getElementById("splash-container");

// optional: preload then swap to avoid a flash
function setBackgroundWhenReady(url) {
    const img = new Image();
    img.onload = () => {
        // fade-in (optional)
        splash.style.transition = "opacity 10000ms ease";
        splash.style.backgroundImage = `url("${url}")`;

    };
    img.src = url;
}
