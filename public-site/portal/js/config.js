// config.js – shared API + auth helpers for the BrightFoundry portal

// -------- ENV + API BASE URL --------
// Auto-detect environment based on hostname so you can't accidentally ship "development" live.
const ENV =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "development"
    : "production";

// Base URL of your Node/Express API
const API_BASE_URL =
  ENV === "production"
    ? "https://api.brightfoundry.co.uk/api"
    : "http://localhost:4000/api";

// Key used to store auth in localStorage
const AUTH_STORAGE_KEY = "bf-portal-auth";

// Read current auth bundle from storage
function getAuthData() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Could not parse auth storage", err);
    return null;
  }
}

// Save token + user to storage
function saveAuth(token, user) {
  const data = { token, user };
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Could not save auth", err);
  }
}

// Remove auth from storage
function clearAuth() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Get just the token
function getAuthToken() {
  const data = getAuthData();
  return data && data.token ? data.token : null;
}

// Get just the user object
function getCurrentUser() {
  const data = getAuthData();
  return data && data.user ? data.user : null;
}

// Default headers for JSON API calls (adds Authorization when token present)
function getAuthHeaders(extra = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...extra,
  };

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

// Redirect helpers (so we can send people back to where they were going)
function redirectToLoginWithReturn(returnTo = "") {
  const dest =
    returnTo || window.location.pathname.split("/").pop() || "dashboard.html";
  const url = `login.html?returnTo=${encodeURIComponent(dest)}`;
  window.location.href = url;
}

function logout() {
  clearAuth();
  window.location.href = "login.html";
}

// Expose globally so auth.js and main.js can use them
window.ENV = ENV;
window.API_BASE_URL = API_BASE_URL;
window.saveAuth = saveAuth;
window.clearAuth = clearAuth;
window.getAuthToken = getAuthToken;
window.getCurrentUser = getCurrentUser;
window.getAuthHeaders = getAuthHeaders;
window.redirectToLoginWithReturn = redirectToLoginWithReturn;
window.logout = logout;
