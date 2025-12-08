// -----------------------------------------------------
// BrightFoundry Client Portal – Front-End Demo Auth
// -----------------------------------------------------

const AUTH_KEY = "bf-portal-auth";

/* -----------------------------
   AUTH STORAGE HELPERS
--------------------------------*/
function setLoggedIn() {
  localStorage.setItem(AUTH_KEY, "true");
}

function clearLoggedIn() {
  localStorage.removeItem(AUTH_KEY);
}

function isLoggedIn() {
  return localStorage.getItem(AUTH_KEY) === "true";
}

/* -----------------------------
   MINI TOAST (no external CSS needed)
--------------------------------*/
function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.bottom = "24px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.background = "#111827";
  toast.style.color = "#f9fafb";
  toast.style.padding = "10px 18px";
  toast.style.borderRadius = "10px";
  toast.style.fontSize = "0.85rem";
  toast.style.opacity = "0";
  toast.style.transition = "opacity 0.3s ease";

  document.body.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  // Fade out + remove
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 1500);
}

/* -----------------------------
   FAKE REDIRECT LOADING
--------------------------------*/
function fakeRedirect(url) {
  showToast("Signing you in...");
  setTimeout(() => {
    window.location.href = url;
  }, 900); // feels instant but polished
}

/* -----------------------------
   FORM BUTTON LOADING
--------------------------------*/
function setButtonLoading(button, loading = true) {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = "Please wait…";
    button.disabled = true;
    button.style.opacity = "0.7";
  } else {
    button.textContent = button.dataset.originalText;
    button.disabled = false;
    button.style.opacity = "1";
  }
}

/* -----------------------------
   MAIN SCRIPT
--------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const providerButtons = document.querySelectorAll("[data-provider]");

  const path = window.location.pathname;
  const isAuthPage =
    path.endsWith("login.html") || path.endsWith("register.html");

  // Already logged in? Skip auth screens.
  if (isLoggedIn() && isAuthPage) {
    window.location.href = "dashboard.html";
    return;
  }

  /* -----------------------------
     EMAIL/PASSWORD LOGIN
  --------------------------------*/
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector("button[type='submit']");
      setButtonLoading(btn, true);

      // Fake processing delay
      setTimeout(() => {
        setLoggedIn();
        fakeRedirect("dashboard.html");
      }, 700);
    });
  }

  /* -----------------------------
     REGISTER FORM
  --------------------------------*/
  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const btn = registerForm.querySelector("button[type='submit']");
      setButtonLoading(btn, true);

      setTimeout(() => {
        setLoggedIn();
        fakeRedirect("dashboard.html");
      }, 900);
    });
  }

  /* -----------------------------
     SOCIAL / EXTERNAL PROVIDERS
  --------------------------------*/
  providerButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const provider = btn.getAttribute("data-provider");
      showToast(`Connecting with ${provider}…`);

      setButtonLoading(btn, true);

      setTimeout(() => {
        setLoggedIn();
        fakeRedirect("dashboard.html");
      }, 900);
    });
  });
});
