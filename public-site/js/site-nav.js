// Mobile menu (public site)
(function () {
  const toggle = document.getElementById("navToggle");
  const menu = document.getElementById("navMobile");
  const overlay = document.getElementById("navOverlay");
  if (!toggle || !menu || !overlay) return;

  function openMenu() {
    menu.classList.add("is-open");
    overlay.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    menu.classList.remove("is-open");
    overlay.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }

  toggle.addEventListener("click", () => {
    const isOpen = menu.classList.contains("is-open");
    if (isOpen) closeMenu();
    else openMenu();
  });

  overlay.addEventListener("click", closeMenu);

  // Close when clicking a link
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
})();
