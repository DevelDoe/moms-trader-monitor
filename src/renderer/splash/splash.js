document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded and parsed");

    // Initially, symbols are not loaded, so clicking is disabled
    let symbolsLoaded = false;

    // Show the loading spinner
    const spinner = document.getElementById("loading-spinner");
    spinner.style.display = "block";
    console.log("Spinner displayed");

    // Hide the login form
    const loginForm = document.getElementById("login-container");
    loginForm.classList.add("hidden");
    console.log("Login form hidden");

    // Listen for symbols fetched event
    window.electronAPI.onSymbolsFetched((event, symbolCount) => {
        symbolsLoaded = true;
        spinner.style.display = "none"; // Hide the spinner
        loginForm.classList.remove("hidden"); // Show the login form
        document.getElementById("symbols-status").textContent = `Fetched ${symbolCount} symbols! Click anywhere to continue.`;
        console.log("Symbols fetched, spinner hidden, login form shown");
    });

    // Login form
    document.getElementById("loginForm").addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const loginButton = document.getElementById("login-button");
        const spinner = document.getElementById("login-spinner");
        const errorDisplay = document.getElementById("error");

        // Disable button & show spinner
        loginButton.disabled = true;
        spinner.classList.remove("hidden");
        errorDisplay.textContent = "";

        try {
            const response = await fetch("https://scribe.arcanemonitor.com/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Invalid credentials");
            }

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
            // Re-enable button and hide spinner
            loginButton.disabled = false;
            spinner.classList.add("hidden");
        }
    });
});
