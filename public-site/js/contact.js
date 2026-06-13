(function () {
  // Keep your existing behavior — this mirrors the common “mailto builder” pattern.
  // If your contact.html has different IDs, tell me what they are and I’ll match them exactly.

  const form = document.querySelector("form[data-contact-form]") || document.querySelector("form");
  if (!form) return;

  const DEST_EMAIL = "brightfoundry.contact@gmail.com";
  const EMAIL_SUBJECT = "Claw Labs enquiry – project";

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const message = String(fd.get("message") || "").trim();

    const body =
      `Name: ${name}\n` +
      `Email: ${email}\n\n` +
      `${message}\n`;

    const mailto =
      `mailto:${encodeURIComponent(DEST_EMAIL)}` +
      `?subject=${encodeURIComponent(EMAIL_SUBJECT)}` +
      `&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  });
})();
