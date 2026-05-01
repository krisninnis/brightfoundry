// Client portal slideshow (public marketing page)
// Replaces the inline script previously in client-portal.html so we can keep a strict CSP.

(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const slides = [
      {
        src: "img/portal/dashboard.png",
        title: "Dashboard overview",
        caption: "See your current projects, recent activity and quick stats in one clean view."
      },
      {
        src: "img/portal/projects.png",
        title: "Projects list",
        caption: "View all your active projects, statuses and key details at a glance."
      },
      {
        src: "img/portal/messages.png",
        title: "Messages",
        caption: "Keep conversations in one place instead of chasing long email threads."
      },
      {
        src: "img/portal/files.png",
        title: "Files & assets",
        caption: "Download designs, documents and handover files from a single, organised space."
      },
      {
        src: "img/portal/invoices.png",
        title: "Invoices",
        caption: "See past and upcoming invoices together so you always know what’s been paid."
      },
      {
        src: "img/portal/support.png",
        title: "Support tickets",
        caption: "Log support requests, see their status and view replies whenever you need."
      },
      {
        src: "img/portal/timeline.png",
        title: "Timeline",
        caption: "A simple activity feed that shows progress as we move through the project."
      },
      {
        src: "img/portal/settings.png",
        title: "Account settings",
        caption: "Update your details, avatar and preferences in just a few clicks."
      }
    ];

    let currentIndex = 0;

    const imgEl = document.getElementById("portal-slide-image");
    const titleEl = document.getElementById("portal-slide-title");
    const captionEl = document.getElementById("portal-slide-caption");
    const prevBtn = document.querySelector(".portal-slide-btn.prev");
    const nextBtn = document.querySelector(".portal-slide-btn.next");

    if (!imgEl || !titleEl || !captionEl) return;

    function renderSlide(index) {
      const slide = slides[index];
      imgEl.src = slide.src;
      imgEl.alt = slide.title;
      titleEl.textContent = slide.title;
      captionEl.textContent = slide.caption;
    }

    function showNext() {
      currentIndex = (currentIndex + 1) % slides.length;
      renderSlide(currentIndex);
    }

    function showPrev() {
      currentIndex = (currentIndex - 1 + slides.length) % slides.length;
      renderSlide(currentIndex);
    }

    if (prevBtn) prevBtn.addEventListener("click", showPrev);
    if (nextBtn) nextBtn.addEventListener("click", showNext);

    document.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") showPrev();
      if (event.key === "ArrowRight") showNext();
    });

    renderSlide(currentIndex);
  });
})();
