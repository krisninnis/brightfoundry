/* portal/js/login.js */

import { API_BASE, setAuthToken } from "./config.js";

function $(sel) {
  return document.querySelector(sel);
}

function setStatus(msg) {
  const el = $("#loginStatus");
  if (el) el.textContent = msg;
}

async function onSubmit(e) {
  e.preventDefault();

  const email = ($("#email")?.value || "").trim();
  const password = $("#password")?.value || "";

  if (!email || !password) {
    setStatus("Enter email and password.");
    return;
  }

  try {
    setStatus("Signing in...");

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(data?.message || "Login failed.");
      return;
    }

    if (!data?.token) {
      setStatus("Login failed: no token returned.");
      return;
    }

    setAuthToken(data.token);
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    setStatus("Network error. Check API is running.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = $("#loginForm");
  if (form) form.addEventListener("submit", onSubmit);
});
