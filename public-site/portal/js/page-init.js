// page-init.js
// Consolidates tiny per-page inline scripts so the portal can use a strict CSP (no inline scripts).

(function () {
  function on(el, event, handler, opts) {
    if (el) el.addEventListener(event, handler, opts);
  }

  function isProtectedPortalPage() {
    const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
    // Only login (and optional register) are public
    return !["login.html", "register.html", ""].includes(page);
  }

  async function runAuthGuardIfNeeded() {
    if (!isProtectedPortalPage()) return;

    // Guard depends on auth.js + config.js
    if (typeof window.requireAuth !== "function") {
      console.warn("requireAuth() not available; cannot guard page yet.");
      return;
    }

    // If no token, requireAuth will redirect to login
    const ok = window.requireAuth();
    if (!ok) return;

    // Optional verification via /api/me (do not hard-fail on offline)
    if (typeof window.verifySession === "function") {
      try {
        await window.verifySession();
      } catch (e) {
        console.warn("verifySession error:", e);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Run auth guard first (protected pages only)
    // Use a microtask so all deferred scripts that also hook DOMContentLoaded have registered.
    Promise.resolve().then(runAuthGuardIfNeeded);

    // --- Shared: "Add another account" (demo-only) ---
    const addAccount = document.getElementById("portal-add-account");
    on(addAccount, "click", () => {
      window.alert("Multi-account switching is coming soon.");
    });

    // --- Shared: keep aria-expanded in sync with menu open/close (main.js toggles class) ---
    const chip = document.getElementById("portal-account-chip");
    const menu = document.getElementById("portal-account-menu");
    if (chip && menu && typeof MutationObserver !== "undefined") {
      const obs = new MutationObserver(() => {
        const open = menu.classList.contains("is-open");
        chip.setAttribute("aria-expanded", open ? "true" : "false");
      });
      obs.observe(menu, { attributes: true, attributeFilter: ["class"] });
    }

    // --- Filters: keep aria-selected in sync (a11y polish) ---
    function wireSimpleAriaSelected(wrapperSelector, buttonSelector) {
      const wrap = document.querySelector(wrapperSelector);
      if (!wrap) return;
      wrap.addEventListener("click", (e) => {
        const btn = e.target.closest(buttonSelector);
        if (!btn) return;
        wrap.querySelectorAll(buttonSelector).forEach((b) => {
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
      });
    }

    // Projects, files, invoices
    wireSimpleAriaSelected(".projects-filters", "button[data-filter]");
    wireSimpleAriaSelected(".files-filter-group", "button[data-filter]");
    wireSimpleAriaSelected(".portal-pill-filter[role='tablist']", "button[data-filter]");

    // Support tickets
    wireSimpleAriaSelected(".tickets-filter-group[role='tablist']", "button.tickets-filter-btn");

    // Timeline: aria-selected mirrors the active class (main.js toggles it)
    const timelineWrap = document.querySelector(".timeline-filter-group[role='tablist']");
    if (timelineWrap) {
      timelineWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("button.timeline-filter-btn");
        if (!btn) return;
        timelineWrap.querySelectorAll("button.timeline-filter-btn").forEach((b) => {
          b.setAttribute("aria-selected", b.classList.contains("is-active") ? "true" : "false");
        });
      });
    }

    // --- Light validation polish (doesn't replace main.js; improves UX) ---
    const msgForm = document.getElementById("new-message-form");
    const msgStatus = document.getElementById("new-message-status");
    if (msgForm && msgStatus) {
      msgForm.addEventListener(
        "submit",
        () => {
          const subject = document.getElementById("new-message-subject");
          const body = document.getElementById("new-message-body");
          if (
            (subject && !String(subject.value || "").trim()) ||
            (body && !String(body.value || "").trim())
          ) {
            msgStatus.textContent = "Please add a subject and a message before sending.";
          }
        },
        true
      );
    }

    const ticketForm = document.getElementById("new-ticket-form");
    const ticketStatus = document.getElementById("new-ticket-status");
    if (ticketForm && ticketStatus) {
      ticketForm.addEventListener(
        "submit",
        () => {
          const subject = document.getElementById("new-ticket-subject");
          if (subject && !String(subject.value || "").trim()) {
            ticketStatus.textContent =
              "Please add a short description so we know what you need.";
          }
        },
        true
      );
    }

    const settingsForm = document.getElementById("settings-form");
    const settingsStatus = document.getElementById("settings-status");
    if (settingsForm && settingsStatus) {
      settingsForm.addEventListener(
        "submit",
        (e) => {
          const name = document.getElementById("settings-name");
          const email = document.getElementById("settings-email");
          const hasName = name && String(name.value || "").trim();
          const hasEmail = email && String(email.value || "").trim();

          if (!hasName && !hasEmail) {
            e.preventDefault();
            settingsStatus.textContent = "Please update your name and/or email, then press save.";
          }
        },
        true
      );
    }

    const pwBtn = document.getElementById("settings-password-btn");
    const pwNote = document.getElementById("settings-security-note");
    on(pwBtn, "click", () => {
      if (pwNote)
        pwNote.textContent =
          "Demo only: password updates will be available when the portal is connected to a real user database.";
    });

    const delBtn = document.getElementById("settings-delete-btn");
    const dangerNote = document.getElementById("settings-danger-note");
    on(delBtn, "click", () => {
      if (dangerNote)
        dangerNote.textContent =
          "Demo only: account deletion requests would be handled securely (verification + email confirmation).";
    });

    // --- Login page helpers ---
    // Providers are "Soon"
    document.querySelectorAll("[data-provider]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const errorEl = document.getElementById("login-error");
        if (errorEl)
          errorEl.textContent =
            "Single sign-on is coming soon. Please sign in with email for now.";
      });
    });

    // Mobile menu behaviour (login page)
    const toggle = document.getElementById("navToggle");
    const mobileMenu = document.getElementById("navMobile");
    const overlay = document.getElementById("navOverlay");

    if (toggle && mobileMenu && overlay) {
      function openMenu() {
        mobileMenu.classList.add("is-open");
        overlay.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
      }

      function closeMenu() {
        mobileMenu.classList.remove("is-open");
        overlay.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }

      toggle.addEventListener("click", () => {
        const isOpen = mobileMenu.classList.contains("is-open");
        if (isOpen) closeMenu();
        else openMenu();
      });

      overlay.addEventListener("click", closeMenu);

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeMenu();
      });

      mobileMenu.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));
    }
  });
})();
