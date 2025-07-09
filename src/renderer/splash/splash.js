document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded and parsed");
    window.splashAPI?.notifyReady();

    const spinner = document.getElementById("loading-spinner");
    const loginForm = document.getElementById("login-container");
    const statusText = document.getElementById("symbols-status");

    // 🔒 Start with spinner visible, login form hidden
    spinner.style.display = "block";
    loginForm.classList.add("hidden");
    statusText.textContent = "Fetching symbols...";

    // ✅ React to symbol fetch result from main process
    window.electronAPI.onSymbolsFetched((_event, symbolCount) => {
        spinner.style.display = "none";
        loginForm.classList.remove("hidden");

        if (symbolCount > 0) {
            statusText.textContent = `✅ Fetched ${symbolCount} symbols.`;
        } else {
            statusText.textContent = "⚠️ Failed to fetch symbols.";
        }
    });

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
