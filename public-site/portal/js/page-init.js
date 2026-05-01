// page-init.js
// Consolidates tiny per-page scripts so the portal can use a strict CSP with no inline scripts.

(function () {
  "use strict";

  function on(el, event, handler, opts) {
    if (el) el.addEventListener(event, handler, opts);
  }

  function currentPageSlug() {
    // pathname excludes query, but can be:
    // /portal/login.html
    // /portal/login
    // /portal/login/
    const parts = String(window.location.pathname || "")
      .split("/")
      .filter(Boolean);

    const last = (parts[parts.length - 1] || "").toLowerCase();
    return last;
  }

  function isProtectedPortalPage() {
    const page = currentPageSlug();

    const PUBLIC = new Set([
      "login.html",
      "login",
      "register.html",
      "register"
    ]);

    if (PUBLIC.has(page)) return false;

    // If someone hits /portal/ directly, avoid guarding the ambiguous root here.
    if (!page || page === "portal") return false;

    return true;
  }

  async function runAuthGuardIfNeeded() {
    if (!isProtectedPortalPage()) return;

    // Guard depends on auth.js + config.js
    if (typeof window.requireAuth !== "function") {
      console.warn("requireAuth() not available; cannot guard page yet.");
      return;
    }

    const ok = window.requireAuth();
    if (!ok) return;

    // Optional verification via /api/me. Do not hard-fail on offline.
    if (typeof window.verifySession === "function") {
      try {
        await window.verifySession();
      } catch (e) {
        console.warn("verifySession error:", e);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Run auth guard first on protected pages only.
    Promise.resolve().then(runAuthGuardIfNeeded);

    // --- Shared: Add another account ---
    const addAccount = document.getElementById("portal-add-account");
    on(addAccount, "click", () => {
      window.alert("To add or switch accounts, please contact BrightFoundry support.");
    });

    // --- Shared: keep aria-expanded in sync with account menu open/close ---
    const chip = document.getElementById("portal-account-chip");
    const menu = document.getElementById("portal-account-menu");

    if (chip && menu && typeof MutationObserver !== "undefined") {
      const obs = new MutationObserver(() => {
        const open = menu.classList.contains("is-open");
        chip.setAttribute("aria-expanded", open ? "true" : "false");
      });

      obs.observe(menu, { attributes: true, attributeFilter: ["class"] });
    }

    // --- Filters: keep aria-selected in sync ---
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

    wireSimpleAriaSelected(".projects-filters", "button[data-filter]");
    wireSimpleAriaSelected(".files-filter-group", "button[data-filter]");
    wireSimpleAriaSelected(".portal-pill-filter[role='tablist']", "button[data-filter]");
    wireSimpleAriaSelected(".tickets-filter-group[role='tablist']", "button.tickets-filter-btn");

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

    // --- Light validation polish ---
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
            ticketStatus.textContent = "Please add a short description so we know what you need.";
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
      if (pwNote) {
        pwNote.textContent =
          "For password changes or access help, please contact BrightFoundry support so we can handle it safely.";
      }
    });

    const delBtn = document.getElementById("settings-delete-btn");
    const dangerNote = document.getElementById("settings-danger-note");

    on(delBtn, "click", () => {
      if (dangerNote) {
        dangerNote.textContent =
          "For account deletion, data export or privacy requests, please contact BrightFoundry support.";
      }
    });

    // --- Login page helpers ---
    document.querySelectorAll("[data-provider]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();

        const errorEl = document.getElementById("login-error");
        if (errorEl) {
          errorEl.textContent =
            "Single sign-on is not available yet. Please sign in with email for now.";
        }
      });
    });

    // Mobile menu behaviour for portal auth pages.
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

      mobileMenu.querySelectorAll("a").forEach((a) => {
        a.addEventListener("click", closeMenu);
      });
    }
  });
})();