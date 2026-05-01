// auth.js — handles login + session guards (CSP-safe, no inline scripts)
// Requires: config.js (API_BASE_URL) and main.js (saveAuth/getAuthToken/getAuthHeaders/clearAuth/logout)

(function () {
  "use strict";

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
  // PAGE DETECTION (PREVENT AUTH REDIRECT LOOPS)
  // --------------------
  function currentFileName() {
    try {
      const path = window.location.pathname || "";
      return path.split("/").pop() || "";
    } catch {
      return "";
    }
  }

  function isLoginOrRegisterPage() {
    const file = currentFileName().toLowerCase();
    // supports both login.html and /portal/login (some servers rewrite)
    return (
      file === "login.html" ||
      file === "register.html" ||
      file === "login" ||
      file === "register"
    );
  }

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
    if (typeof label === "string") submit.textContent = label;
  }

  function isNetworkOfflineError(err) {
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

  function hasApiConfig() {
    return typeof API_BASE_URL !== "undefined" && typeof API_BASE_URL === "string" && API_BASE_URL.length > 0;
  }

  function jsonHeaders() {
    return { "Content-Type": "application/json" };
  }

  function initAuthOfflineUX(mode) {
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
    if (!hasApiConfig()) return false;

    try {
      const res = await fetch(`${API_BASE_URL}/api/health`, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      return !!res.ok;
    } catch {
      return false;
    }
  }

  // --------------------
  // SAFETY: prevent open-redirect via returnTo
  // Only allow same-folder .html targets like "dashboard.html" or "projects.html"
  // --------------------
  function safeReturnTo(raw) {
    const fallback = "dashboard.html";
    if (!raw || typeof raw !== "string") return fallback;

    const v = raw.trim();

    // Disallow anything that looks like a URL / protocol / JS scheme / network-path reference
    if (
      v.includes("://") ||
      v.startsWith("//") ||
      v.toLowerCase().startsWith("javascript:") ||
      v.toLowerCase().startsWith("data:")
    ) {
      return fallback;
    }

    // Keep it as a simple file name in this folder (no slashes)
    if (v.includes("/") || v.includes("\\") || v.includes("\0")) return fallback;

    // Allow only .html files (optionally with query/hash)
    const base = v.split("?")[0].split("#")[0];
    if (!/^[a-z0-9-]+\.html$/i.test(base)) return fallback;

    // Never allow returning to auth pages (prevents loops)
    const lowerBase = base.toLowerCase();
    if (lowerBase === "login.html" || lowerBase === "register.html") return fallback;

    return v;
  }

  // --- Auth guard (use on any protected portal page) ---
  function requireAuth() {
    // ✅ Critical: never redirect while on login/register pages
    if (isLoginOrRegisterPage()) return true;

    const token = typeof getAuthToken === "function" ? getAuthToken() : null;

    if (!token) {
      const current = currentFileName() || "dashboard.html";
      const returnTo = safeReturnTo(current);

      // Use replace() to avoid back-button redirect loops
      const dest = `login.html?returnTo=${encodeURIComponent(returnTo)}`;

      if (typeof redirectToLoginWithReturn === "function") {
        redirectToLoginWithReturn(returnTo);
      } else {
        window.location.replace(dest);
      }
      return false;
    }

    return true;
  }

  // Optional: verify token by calling /me
  async function verifySession() {
    if (!hasApiConfig()) return null;
    if (typeof getAuthHeaders !== "function") return null;

    try {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        method: "GET",
        headers: getAuthHeaders(),
        cache: "no-store",
      });

      if (!res.ok) {
        // token invalid/expired
        if (typeof logout === "function") {
          logout();
        } else {
          if (typeof clearAuth === "function") clearAuth();
          window.location.replace("login.html");
        }
        return null;
      }

      const data = await res.json().catch(() => ({}));

      // Keep user data fresh in sessionStorage (optional)
      if (
        data &&
        data.user &&
        typeof saveAuth === "function" &&
        typeof getAuthToken === "function"
      ) {
        const token = getAuthToken();
        if (token) saveAuth(token, data.user);
      }

      return data.user || null;
    } catch (err) {
      if (isNetworkOfflineError(err)) return null;
      console.warn("Session verify failed:", err);
      return null;
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (!hasApiConfig()) {
      setAuthError("login", "API is not configured (missing API_BASE_URL).");
      return;
    }
    if (typeof saveAuth !== "function") {
      setAuthError("login", "Portal auth helpers are missing (saveAuth).");
      return;
    }

    const email = document.querySelector("#login-email")?.value.trim() || "";
    const password = document.querySelector("#login-password")?.value || "";

    setAuthError("login", "");

    if (!email || !password) {
      setAuthError("login", "Please enter your email and password.");
      return;
    }

    setAuthBusy("login", true, "Signing in...");

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.message || "Invalid email or password.";
        setAuthError("login", msg);
        return;
      }

      if (!data || !data.token) {
        setAuthError("login", "Login failed: server did not return a token.");
        return;
      }

      saveAuth(data.token, data.user);

      // Redirect back to where they were going (or dashboard) — sanitized
      const params = new URLSearchParams(window.location.search);
      const returnToRaw = params.get("returnTo") || "dashboard.html";
      const returnTo = safeReturnTo(returnToRaw);

      window.location.replace(returnTo);
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

    // Invite-only: prevent public self-signups even if a register form exists
    setAuthError(
      "register",
      "Registration is invite-only. If you’re an active client, please use the access link provided when your project starts."
    );

    setAuthBusy("register", true, "Invite-only");
    setTimeout(() => setAuthBusy("register", false, "Create account"), 1200);
  }

  function handleLogout(event) {
    event.preventDefault();
    if (typeof logout === "function") {
      logout();
    } else {
      if (typeof clearAuth === "function") clearAuth();
      window.location.replace("login.html");
    }
  }

  // Expose guards globally so pages can call them
  window.requireAuth = requireAuth;
  window.verifySession = verifySession;
})();
