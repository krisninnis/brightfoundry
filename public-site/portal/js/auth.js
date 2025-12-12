// auth.js – handles login and registration using the real API

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.querySelector("#login-form");
  const registerForm = document.querySelector("#register-form");
  const logoutButtons = document.querySelectorAll("[data-logout]");

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
  }

  logoutButtons.forEach((btn) => {
    btn.addEventListener("click", handleLogout);
  });
});

async function handleLogin(event) {
  event.preventDefault();

  const email = document.querySelector("#login-email").value.trim();
  const password = document.querySelector("#login-password").value.trim();
  const errorEl = document.querySelector("#login-error");

  if (errorEl) errorEl.textContent = "";

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || "Invalid email or password.";
      if (errorEl) {
        errorEl.textContent = msg;
      } else {
        alert(msg);
      }
      return;
    }

    const data = await res.json();
    // Store token + user via config.js helpers
    saveAuth(data.token, data.user);

    // Redirect to dashboard after login
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error("Login failed:", err);
    const msg = "Something went wrong. Please try again.";
    if (errorEl) {
      errorEl.textContent = msg;
    } else {
      alert(msg);
    }
  }
}

async function handleRegister(event) {
  event.preventDefault();

  // register.html uses reg-* IDs; support both just in case
  const nameInput =
    document.querySelector("#register-name") ||
    document.querySelector("#reg-name");
  const emailInput =
    document.querySelector("#register-email") ||
    document.querySelector("#reg-email");
  const passwordInput =
    document.querySelector("#register-password") ||
    document.querySelector("#reg-password");

  const name = nameInput ? nameInput.value.trim() : "";
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  const errorEl = document.querySelector("#register-error");

  if (errorEl) errorEl.textContent = "";

  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || "Registration failed.";
      if (errorEl) {
        errorEl.textContent = msg;
      } else {
        alert(msg);
      }
      return;
    }

    const data = await res.json();
    // Store token + user via config.js helpers
    saveAuth(data.token, data.user);

    // Redirect to dashboard after signup
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error("Register failed:", err);
    const msg = "Something went wrong. Please try again.";
    if (errorEl) {
      errorEl.textContent = msg;
    } else {
      alert(msg);
    }
  }
}

function handleLogout(event) {
  event.preventDefault();
  // Clear real auth
  if (typeof clearAuth === "function") {
    clearAuth();
  }
  window.location.href = "login.html";
}
