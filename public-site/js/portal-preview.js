document.addEventListener("DOMContentLoaded", function () {
  // This is the slideshow/preview script that was inline in client-portal.html.
  // It expects the same DOM hooks you already had in that file.

  const slides = [
    { src: "img/portal/dashboard.png", title: "Dashboard overview", caption: "See your current projects, recent activity and quick status." },
    { src: "img/portal/projects.png", title: "Projects", caption: "Track phase, status and updates in one place." },
    { src: "img/portal/messages.png", title: "Messages", caption: "Keep everything in one thread, tied to a project." },
    { src: "img/portal/support.png", title: "Support", caption: "Raise tickets and track progress." }
  ];

  const img = document.getElementById("portalPreviewImage");
  const title = document.getElementById("portalPreviewTitle");
  const caption = document.getElementById("portalPreviewCaption");

  const prevBtn = document.getElementById("portalPreviewPrev");
  const nextBtn = document.getElementById("portalPreviewNext");

  if (!img || !title || !caption) return;

  let i = 0;

  function render() {
    const s = slides[i];
    img.src = s.src;
    img.alt = s.title;
    title.textContent = s.title;
    caption.textContent = s.caption;
  }

  function next() {
    i = (i + 1) % slides.length;
    render();
  }

  function prev() {
    i = (i - 1 + slides.length) % slides.length;
    render();
  }

  if (nextBtn) nextBtn.addEventListener("click", next);
  if (prevBtn) prevBtn.addEventListener("click", prev);

  render();
});
