(function () {
  // Single source of truth for theme across marketing site + portal.
  // Storage key: bf-theme
  // Allowed values: "light" | "dark"
  // DOM authority:
  //   - <html data-theme="light|dark">
  // Compatibility:
  //   - also toggles .theme-dark on <body> and <html> for legacy portal CSS

  var THEME_KEY = "bf-theme";

  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function safeGet() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function safeSet(v) {
    try {
      localStorage.setItem(THEME_KEY, v);
    } catch (e) {}
  }

  function resolveInitialTheme() {
    var v = safeGet();
    if (v === "light" || v === "dark") return v;
    return prefersDark() ? "dark" : "light";
  }

  function iconBasePath() {
    // Icons live in: /public-site/portal/img/icons/{sun|moon}.svg (or .png)
    // Marketing pages should use: "portal/img/icons/..."
    // Portal pages (already inside /portal/) should use: "img/icons/..."
    var path = (window.location && window.location.pathname) ? window.location.pathname : "";
    return path.indexOf("/portal/") !== -1 ? "img/icons/" : "portal/img/icons/";
  }

  function updateToggles(theme) {
    var isDark = theme === "dark";
    var base = iconBasePath();

    // Prefer SVG if present (you’re already serving sun.svg)
    var iconSrc = base + (isDark ? "moon.svg" : "sun.svg");

    var toggles = document.querySelectorAll("[data-theme-toggle], .site-theme-toggle, .portal-theme-toggle");

    for (var i = 0; i < toggles.length; i++) {
      var btn = toggles[i];
      btn.setAttribute("aria-pressed", isDark ? "true" : "false");
      btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");

      // Prefer an explicit [data-theme-icon] element, otherwise fall back to any <img> inside.
      var img = btn.querySelector("[data-theme-icon]") || btn.querySelector("img");
      if (!img) {
        img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.loading = "lazy";
        // Keep aria-label, remove visible label text (if any)
        btn.textContent = "";
        btn.appendChild(img);
      }

      // Normalise attributes/classes so CSS sizing works everywhere
      img.setAttribute("data-theme-icon", "");
      if (!img.classList.contains("bf-theme-toggle-icon")) img.classList.add("bf-theme-toggle-icon");

      img.src = iconSrc;
    }
  }

  function apply(theme) {
    if (theme !== "light" && theme !== "dark") theme = resolveInitialTheme();
    var isDark = theme === "dark";

    // Primary modern hook
    document.documentElement.setAttribute("data-theme", theme);

    // Compatibility hooks for older CSS
    document.documentElement.classList.toggle("theme-dark", isDark);
    if (document.body) document.body.classList.toggle("theme-dark", isDark);

    updateToggles(theme);
  }

  function toggle() {
    var current = document.documentElement.getAttribute("data-theme");
    var next = current === "dark" ? "light" : "dark";
    safeSet(next);
    apply(next);
  }

  function bind() {
    document.addEventListener("click", function (e) {
      var target = e.target;
      if (!target) return;

      var btn = target.closest
        ? target.closest("[data-theme-toggle], .site-theme-toggle, .portal-theme-toggle")
        : null;

      if (!btn) return;
      e.preventDefault();
      toggle();
    });
  }

  function init() {
    apply(resolveInitialTheme());

    // If user never explicitly chose, follow OS changes (without storing)
    if (window.matchMedia) {
      var mql = window.matchMedia("(prefers-color-scheme: dark)");
      var handler = function () {
        var stored = safeGet();
        if (stored !== "light" && stored !== "dark") {
          apply(resolveInitialTheme());
        }
      };

      try {
        if (mql.addEventListener) mql.addEventListener("change", handler);
        else if (mql.addListener) mql.addListener(handler);
      } catch (e) {}
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  bind();

  // Optional tiny API
  window.BFTheme = {
    get: safeGet,
    set: function (v) {
      if (v === "light" || v === "dark") {
        safeSet(v);
        apply(v);
      }
    },
    toggle: toggle,
    apply: apply
  };
})();
