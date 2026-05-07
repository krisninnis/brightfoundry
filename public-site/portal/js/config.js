// config.js — shared API + auth helpers for the BrightFoundry portal
// CSP-safe (no inline), token stored in sessionStorage, safe redirect handling.

(function () {
  "use strict";

  // -------------------------
  // ENV + API BASE URL
  // -------------------------
  // Treat localhost / 127.0.0.1 / *.local as dev.
  const isDevHost =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname.endsWith(".local");

  // Optional manual override (useful for testing production API locally):
  // localStorage.setItem("bf-env", "development") or "production"
  const forcedEnv = (() => {
    try {
      const v = localStorage.getItem("bf-env");
      return v === "development" || v === "production" ? v : null;
    } catch {
      return null;
    }
  })();

  const ENV = forcedEnv || (isDevHost ? "development" : "production");

  // Host only (no trailing /api). All callers must use `${API_BASE_URL}/api/...`
  // DEV: derive host from current page to avoid localhost vs 127.0.0.1 CORS mismatches.
  // PROD: fixed API domain.
  const API_BASE_URL_RAW =
    ENV === "production"
      ? "https://brightfoundry.onrender.com"
      : `${window.location.protocol}//${window.location.hostname}:4000`;

  // Normalize: remove any trailing slashes to avoid // in URLs
  const API_BASE_URL = String(API_BASE_URL_RAW || "").replace(/\/+$/, "");

  // -------------------------
  // AUTH STORAGE
  // -------------------------
  // Store auth in sessionStorage (more secure than localStorage for XSS blast radius).
  // Migrate any old localStorage auth once, then remove it.
  const AUTH_STORAGE_KEY = "bf-portal-auth";

  const authStore = {
    get() {
      try {
        return sessionStorage.getItem(AUTH_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    set(v) {
      try {
        sessionStorage.setItem(AUTH_STORAGE_KEY, v);
      } catch {
        // ignore
      }
    },
    remove() {
      try {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
    },
  };

  (function migrateAuthFromLocalStorageOnce() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw && !authStore.get()) authStore.set(raw);
      if (raw) localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
  })();

  function getAuthData() {
    try {
      const raw = authStore.get();
      return raw ? JSON.parse(raw) : null;
    } catch {
      // Bad JSON in storage — wipe to recover cleanly
      authStore.remove();
      return null;
    }
  }

  function saveAuth(token, user) {
    if (!token || typeof token !== "string") return;
    const data = { token, user: user || null };
    try {
      authStore.set(JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  function clearAuth() {
    authStore.remove();
  }

  function getAuthToken() {
    const data = getAuthData();
    return data && data.token ? data.token : null;
  }

  function getCurrentUser() {
    const data = getAuthData();
    return data && data.user ? data.user : null;
  }

  function getAuthHeaders(extra = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...extra,
    };

    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  // -------------------------
  // SAFE REDIRECT HELPERS (avoid open-redirects)
  // -------------------------
  function safeReturnTo(raw) {
    const fallback = "dashboard.html";
    if (!raw || typeof raw !== "string") return fallback;

    const v = raw.trim();

    // disallow URLs / schemes / path traversal
    if (
      v.includes("://") ||
      v.startsWith("//") ||
      v.toLowerCase().startsWith("javascript:") ||
      v.toLowerCase().startsWith("data:")
    ) {
      return fallback;
    }
    if (v.includes("/") || v.includes("\\") || v.includes("\0")) return fallback;

    // allow only *.html in this folder, optionally with query/hash
    const base = v.split("?")[0].split("#")[0];
    if (!/^[a-z0-9-]+\.html$/i.test(base)) return fallback;

    return v;
  }

  function redirectToLoginWithReturn(returnTo = "") {
    const dest =
      returnTo || window.location.pathname.split("/").pop() || "dashboard.html";
    const safeDest = safeReturnTo(dest);
    window.location.href = `login.html?returnTo=${encodeURIComponent(safeDest)}`;
  }

  function logout() {
    clearAuth();
    window.location.href = "login.html";
  }

  // -------------------------
  // Expose globally (portal code relies on these)
  // -------------------------
  window.ENV = ENV;
  window.API_BASE_URL = API_BASE_URL;

  window.saveAuth = saveAuth;
  window.clearAuth = clearAuth;
  window.getAuthToken = getAuthToken;
  window.getCurrentUser = getCurrentUser;
  window.getAuthHeaders = getAuthHeaders;

  window.redirectToLoginWithReturn = redirectToLoginWithReturn;
  window.logout = logout;
})();
