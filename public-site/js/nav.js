(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  const toggle = qs(".nav-toggle");
  const mobile = qs(".nav-mobile");

  if (toggle && mobile) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      mobile.hidden = !open;
    };
    setOpen(false);
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      setOpen(!open);
    });

    // Close on link click
    mobile.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (a) setOpen(false);
    });
  }

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();