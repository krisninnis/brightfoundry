// Mobile menu (public site)
(function () {
  var toggle = document.getElementById("navToggle");
  var menu = document.getElementById("navMobile");
  var overlay = document.getElementById("navOverlay");
  if (toggle && menu && overlay) {
    function openMenu() {
      menu.classList.add("is-open");
      overlay.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");
    }

    function closeMenu() {
      menu.classList.remove("is-open");
      overlay.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
    }

    toggle.addEventListener("click", function () {
      var isOpen = menu.classList.contains("is-open");
      if (isOpen) closeMenu();
      else openMenu();
    });

    overlay.addEventListener("click", closeMenu);

    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  }

  // Mark current page in sidebar nav
  (function () {
    var filename = window.location.pathname.split("/").pop() || "index.html";
    var sidebarLinks = document.querySelectorAll(".sidebar-nav a");
    sidebarLinks.forEach(function (a) {
      var href = (a.getAttribute("href") || "").split("/").pop();
      if (href === filename) {
        a.setAttribute("aria-current", "page");
      }
    });
  })();
})();
