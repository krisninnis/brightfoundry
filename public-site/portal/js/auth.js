// auth.js – handles login and registration using the real API + session guards

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.querySelector("#login-form");
  const registerForm = document.querySelector("#register-form");
  const logoutButtons = document.querySelectorAll("[data-logout]");

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
    initAuthOfflineUX("login");
  }

  if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
    initAuthOfflineUX("register");
  }

  logoutButtons.forEach((btn) => {
    btn.addEventListener("click", handleLogout);
  });
});

// --------------------
// UI HELPERS (LOGIN/REGISTER)
// --------------------
function setAuthError(mode, message) {
  const selector = mode === "register" ? "#register-error" : "#login-error";
  const errorEl = document.querySelector(selector);

  if (errorEl) {
    errorEl.textContent = message || "";
    return;
  }

  if (message) alert(message);
}

function setAuthBusy(mode, isBusy, label) {
  const formId = mode === "register" ? "#register-form" : "#login-form";
  const form = document.querySelector(formId);
  if (!form) return;

  const submit = form.querySelector("button[type='submit']");
  if (!submit) return;

  submit.disabled = !!isBusy;
  if (label) submit.textContent = label;
}

function isNetworkOfflineError(err) {
  // Browsers vary, but these cover the common offline cases:
  // - TypeError: Failed to fetch (Chrome)
  // - NetworkError when attempting to fetch resource (Firefox)
  // - ERR_CONNECTION_REFUSED (shows in Network, not always in message)
  const msg = String(err && (err.message || err)).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("connection refused") ||
    msg.includes("err_connection_refused") ||
    msg.includes("load failed")
  );
}

function initAuthOfflineUX(mode) {
  // Optional: If your HTML has a retry button, wire it up.
  // This is safe even if the element doesn't exist.
  const retryBtnId = mode === "register" ? "#register-retry" : "#login-retry";
  const retryBtn = document.querySelector(retryBtnId);

  if (retryBtn) {
    retryBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      setAuthError(mode, "");
      const ok = await pingApi();
      if (!ok) {
        setAuthError(
          mode,
          "Portal is temporarily unavailable (server offline). Please try again in a moment."
        );
      } else {
        setAuthError(mode, "Back online — you can try again now.");
        setTimeout(() => setAuthError(mode, ""), 2000);
      }
    });
  }
}

async function pingApi() {
  if (typeof API_BASE_URL === "undefined") return false;

  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    return !!res.ok;
  } catch {
    return false;
  }
}

// --- Auth guard (use on any protected portal page) ---
function requireAuth() {
  const token = typeof getAuthToken === "function" ? getAuthToken() : null;
  if (!token) {
    // Send user to login with returnTo so they come back after login
    if (typeof redirectToLoginWithReturn === "function") {
      const current =
        window.location.pathname.split("/").pop() || "dashboard.html";
      redirectToLoginWithReturn(current);
    } else {
      window.location.href = "login.html";
    }
    return false;
  }
  return true;
}

// Optional: verify token by calling /auth/me
async function verifySession() {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      // token invalid/expired
      if (typeof logout === "function") logout();
      else {
        if (typeof clearAuth === "function") clearAuth();
        window.location.href = "login.html";
      }
      return null;
    }

    const data = await res.json();
    // Keep user data fresh in localStorage (optional but useful)
    if (data && data.user && typeof saveAuth === "function") {
      const token = getAuthToken();
      if (token) saveAuth(token, data.user);
    }
    return data.user || null;
  } catch (err) {
    // If offline, don't spam console — just treat as "can't verify right now"
    if (isNetworkOfflineError(err)) return null;
    console.warn("Session verify failed:", err);
    return null;
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.querySelector("#login-email")?.value.trim() || "";
  const password =
    document.querySelector("#login-password")?.value.trim() || "";

  setAuthError("login", "");

  if (!email || !password) {
    setAuthError("login", "Please enter your email and password.");
    return;
  }

  setAuthBusy("login", true, "Signing in...");

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || "Invalid email or password.";
      setAuthError("login", msg);
      return;
    }

    const data = await res.json();

    // Store token + user via config.js helpers
    saveAuth(data.token, data.user);

    // Redirect back to where they were going (or dashboard)
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo") || "dashboard.html";
    window.location.href = returnTo;
  } catch (err) {
    if (isNetworkOfflineError(err)) {
      setAuthError(
        "login",
        "Portal is temporarily unavailable (server offline). Please try again in a moment."
      );
      return;
    }

    console.error("Login failed:", err);
    setAuthError("login", "Something went wrong. Please try again.");
  } finally {
    setAuthBusy("login", false, "Sign in");
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

  setAuthError("register", "");

  if (!name || !email || !password) {
    setAuthError("register", "Please fill in name, email, and password.");
    return;
  }

  setAuthBusy("register", true, "Creating account...");

  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || "Registration failed.";
      setAuthError("register", msg);
      return;
    }

    const data = await res.json();
    saveAuth(data.token, data.user);

    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo") || "dashboard.html";
    window.location.href = returnTo;
  } catch (err) {
    if (isNetworkOfflineError(err)) {
      setAuthError(
        "register",
        "Portal is temporarily unavailable (server offline). Please try again in a moment."
      );
      return;
    }

    console.error("Register failed:", err);
    setAuthError("register", "Something went wrong. Please try again.");
  } finally {
    setAuthBusy("register", false, "Create account");
  }
}

function handleLogout(event) {
  event.preventDefault();
  if (typeof logout === "function") logout();
  else {
    if (typeof clearAuth === "function") clearAuth();
    window.location.href = "login.html";
  }
}

// Expose guards globally so pages can call them inline
window.requireAuth = requireAuth;
window.verifySession = verifySession;
