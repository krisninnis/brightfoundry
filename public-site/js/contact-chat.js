// Contact page — chat-style intake assistant (CSP-safe external JS)
(function () {
  // =========================
  // CONFIG
  // =========================
  const DEST_EMAIL = "brightfoundry.contact@gmail.com";
  const EMAIL_SUBJECT = "BrightFoundry enquiry – project details";
  const MAX_TEXT = 600;

  // =========================
  // DOM
  // =========================
  const chatLog = document.getElementById("bfChatLog");
  const chatInput = document.getElementById("bfChatInput");
  const sendBtn = document.getElementById("bfChatSend");
  const quickOptions = document.getElementById("bfQuickOptions");
  const hint = document.getElementById("bfChatHint");

  const summaryActions = document.getElementById("bfSummaryActions");
  const summaryText = document.getElementById("bfSummaryText");
  const copyBtn = document.getElementById("bfCopySummary");
  const emailLink = document.getElementById("bfEmailSummary");
  const restartBtn = document.getElementById("bfRestart");
  const copyStatus = document.getElementById("bfCopyStatus");

  // Honeypot
  const honeypot = document.getElementById("bf_company");

  // If we’re not on the contact page (or markup not present), do nothing.
  if (!chatLog || !chatInput || !sendBtn || !summaryText || !emailLink || !summaryActions) return;

  // =========================
  // STATE
  // =========================
  const answers = {
    name: "",
    contact: "",
    business: "",
    location: "",
    website: "",
    projectType: "",
    goals: "",
    pagesFeatures: "",
    examples: "",
    contentReady: "",
    deadline: "",
    budget: "",
    contactStyle: ""
  };

  const steps = [
    {
      key: "name",
      q: "Hi — quick few questions. What’s your name?",
      type: "text",
      placeholder: "e.g. Sam"
    },
    {
      key: "contact",
      q: "Best contact email or phone number?",
      type: "text",
      placeholder: "e.g. sam@email.com"
    },
    {
      key: "business",
      q: "What’s your business name, or what should I call the project?",
      type: "text",
      placeholder: "e.g. Harbour & Hearth Café"
    },
    {
      key: "location",
      q: "Where are you based / what area do you serve?",
      type: "text",
      placeholder: "e.g. Bridgend / South Wales / UK-wide"
    },
    {
      key: "website",
      q: "Do you already have a website? If yes, paste the link, or type “no”.",
      type: "text",
      placeholder: "e.g. https://example.com or no"
    },
    {
      key: "projectType",
      q: "What are you interested in?",
      type: "options",
      options: [
        "Website Launch Sprint",
        "Website design",
        "Web app / client portal",
        "AI chatbot / automation",
        "Branding / visual identity",
        "Media / content",
        "Care plan / ongoing support",
        "Not sure yet"
      ]
    },
    {
      key: "goals",
      q: "What’s the main goal? More enquiries, bookings, sales, credibility, or something else?",
      type: "text",
      placeholder: "e.g. more enquiries + clearer services"
    },
    {
      key: "pagesFeatures",
      q: "What pages or features do you think you need? Keep it rough.",
      type: "text",
      placeholder: "e.g. Home, Services, About, Contact form, Gallery"
    },
    {
      key: "examples",
      q: "Any websites you like the style of? Paste links, or type “none”.",
      type: "text",
      placeholder: "e.g. https://site1.com, https://site2.com"
    },
    {
      key: "contentReady",
      q: "Do you have content ready, such as logo, photos or text?",
      type: "options",
      options: ["Yes — mostly ready", "Partly — needs help", "No — need guidance"]
    },
    {
      key: "deadline",
      q: "Any deadline or important date? Or type “no deadline”.",
      type: "text",
      placeholder: "e.g. launch before March / no deadline"
    },
    {
      key: "budget",
      q: "Rough budget range? Optional, but it helps me suggest a realistic phase one.",
      type: "options",
      optional: true,
      options: [
        "Not sure yet",
        "Around £950 – £1,500",
        "Around £1,500 – £2,400",
        "£2,400+ / larger project",
        "Ongoing care or smaller update"
      ]
    },
    {
      key: "contactStyle",
      q: "How would you like to handle the next step?",
      type: "options",
      options: ["Email-only — no calls", "Quick call if useful", "Not sure yet"]
    }
  ];

  let stepIndex = 0;

  // =========================
  // HELPERS
  // =========================
  function clampText(str) {
    const s = String(str || "");
    if (s.length <= MAX_TEXT) return s.trim();
    return (s.slice(0, MAX_TEXT) + "…").trim();
  }

  function setInputEnabled(isEnabled) {
    chatInput.disabled = !isEnabled;
    sendBtn.disabled = !isEnabled;
    chatInput.classList.toggle("is-disabled", !isEnabled);
    sendBtn.classList.toggle("is-disabled", !isEnabled);
  }

  function setInputPlaceholder(text) {
    chatInput.placeholder = text || "Type your answer…";
  }

  function currentStep() {
    return steps[stepIndex];
  }

  // Create a bubble without innerHTML (CSP-safe, XSS-resistant).
  function makeBubbleText(text) {
    const frag = document.createDocumentFragment();
    const parts = String(text || "").split("\n");
    parts.forEach((part, i) => {
      frag.appendChild(document.createTextNode(part));
      if (i < parts.length - 1) frag.appendChild(document.createElement("br"));
    });
    return frag;
  }

  function addMsg(role, text) {
    const wrap = document.createElement("div");
    wrap.className = "bf-chat-row " + (role === "user" ? "is-user" : "is-bot");

    const bubble = document.createElement("div");
    bubble.className = "bf-chat-bubble " + (role === "user" ? "is-user" : "is-bot");
    bubble.appendChild(makeBubbleText(text));

    wrap.appendChild(bubble);
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function setQuickOptions(opts) {
    if (!quickOptions) return;

    quickOptions.replaceChildren();

    if (!opts || !opts.length) {
      quickOptions.classList.add("is-hidden");
      return;
    }

    quickOptions.classList.remove("is-hidden");

    opts.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-small bf-chat-option";
      btn.textContent = opt;
      btn.addEventListener("click", () => submitAnswer(opt));
      quickOptions.appendChild(btn);
    });
  }

  // =========================
  // FLOW
  // =========================
  function askNext() {
    const s = currentStep();
    if (!s) return;

    addMsg("bot", s.q);

    if (s.type === "options") {
      setQuickOptions(s.options);
      setInputPlaceholder("Or type your own answer…");
    } else {
      setQuickOptions(null);
      setInputPlaceholder(s.placeholder || "Type your answer…");
    }

    chatInput.value = "";
    chatInput.focus();
  }

  function buildSummary() {
    const lines = [
      "BrightFoundry enquiry — summary",
      "--------------------------------",
      `Name: ${answers.name || "-"}`,
      `Contact: ${answers.contact || "-"}`,
      `Business/project: ${answers.business || "-"}`,
      `Location/area: ${answers.location || "-"}`,
      `Current website: ${answers.website || "-"}`,
      "",
      `Interested in: ${answers.projectType || "-"}`,
      `Main goal: ${answers.goals || "-"}`,
      `Pages/features: ${answers.pagesFeatures || "-"}`,
      `Examples/links: ${answers.examples || "-"}`,
      `Content ready: ${answers.contentReady || "-"}`,
      `Deadline: ${answers.deadline || "-"}`,
      `Budget: ${answers.budget || "-"}`,
      `Preferred next step: ${answers.contactStyle || "-"}`,
      "",
      "Notes:",
      "- If you are not sure about budget or scope, BrightFoundry can suggest the simplest sensible starting point.",
      "- If you have any files, such as logo, photos or text, you can reply to this email with attachments or links.",
      "- Response time: within 1–2 working days."
    ];

    return lines.join("\n");
  }

  function finish() {
    setQuickOptions(null);
    setInputEnabled(false);

    if (hint) hint.textContent = "Thanks — generating your summary…";

    addMsg(
      "bot",
      "Thanks — that’s everything. I’ll reply by email first, and we can keep it email-only if you prefer."
    );

    const summary = buildSummary();
    summaryText.value = summary;

    const mailto =
      "mailto:" + encodeURIComponent(DEST_EMAIL) +
      "?subject=" + encodeURIComponent(EMAIL_SUBJECT) +
      "&body=" + encodeURIComponent(summary);

    emailLink.setAttribute("href", mailto);

    const controls = document.getElementById("bfChatControls");
    if (controls) controls.classList.add("is-hidden");

    summaryActions.classList.remove("is-hidden");
  }

  function submitAnswer(raw) {
    // Spam honeypot
    if (honeypot && honeypot.value && honeypot.value.trim().length > 0) {
      if (hint) hint.textContent = "Thanks — please email your details instead.";
      setInputEnabled(false);
      return;
    }

    const s = currentStep();
    if (!s) return;

    const val = clampText(raw);
    if (!val) return;

    addMsg("user", val);
    answers[s.key] = val;

    stepIndex += 1;

    if (stepIndex >= steps.length) finish();
    else askNext();
  }

  function resetAll() {
    stepIndex = 0;
    Object.keys(answers).forEach((k) => {
      answers[k] = "";
    });

    chatLog.replaceChildren();

    if (copyStatus) copyStatus.textContent = "";

    summaryText.value = "";
    summaryActions.classList.add("is-hidden");

    const controls = document.getElementById("bfChatControls");
    if (controls) controls.classList.remove("is-hidden");

    setInputEnabled(true);

    if (hint) {
      hint.textContent = "Tip: keep it rough — you don’t need perfect wording.";
    }

    askNext();
  }

  // =========================
  // EVENTS
  // =========================
  sendBtn.addEventListener("click", () => submitAnswer(chatInput.value));

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAnswer(chatInput.value);
    }
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(summaryText.value || "");
        if (copyStatus) copyStatus.textContent = "Copied to clipboard.";
      } catch (err) {
        if (copyStatus) {
          copyStatus.textContent = "Couldn’t copy automatically — select the text and copy manually.";
        }
      }
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener("click", () => resetAll());
  }

  // =========================
  // INIT
  // =========================
  resetAll();
})();
