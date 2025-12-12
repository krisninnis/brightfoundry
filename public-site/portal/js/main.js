// BrightFoundry Client Portal JS
// - Theme toggle (light/dark)
// - Real auth gate using JWT from config.js
// - Real API rendering for projects, messages, files, support tickets, invoices & timeline
// - Avatar upload with localStorage
// - Account chip dropdown + logout
// - Search & filters
// - Profile update, support ticket + message creation, invoice status toggling
// - Offline banner + safe API fetch wrapper (Step 5A)

(function () {
  const THEME_KEY = "bf-portal-theme";
  const AUTH_STORAGE_KEY = "bf-portal-auth"; // same key used in auth.js
  const AVATAR_KEY = "bf-portal-avatar";

  // --------------------
  // OFFLINE / API STATUS
  // --------------------
  let apiOffline = false;
  let offlineBannerShown = false;

  function ensureOfflineBanner() {
    if (offlineBannerShown) return;

    const banner = document.createElement("div");
    banner.className = "portal-offline-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML = `
      <div class="portal-offline-banner-inner">
        <strong>Offline mode</strong>
        <span>Some data may be unavailable right now. We’ll reconnect automatically.</span>
        <button type="button" class="portal-offline-banner-close" aria-label="Dismiss">×</button>
      </div>
    `;

    document.body.appendChild(banner);

    const closeBtn = banner.querySelector(".portal-offline-banner-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        banner.remove();
        offlineBannerShown = false;
      });
    }

    offlineBannerShown = true;
  }

  function setApiOfflineState(isOffline) {
    apiOffline = !!isOffline;
    if (apiOffline) ensureOfflineBanner();
  }

  async function apiFetch(path, options = {}) {
    if (typeof API_BASE_URL === "undefined" || typeof getAuthHeaders !== "function") {
      setApiOfflineState(true);
      throw new Error("API is not configured");
    }

    const url = `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

    try {
      const res = await fetch(url, options);

      // Token expired / invalid -> logout and redirect
      if (res.status === 401) {
        setApiOfflineState(false);
        try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
        redirectToLogin();
        throw new Error("Not authenticated");
      }

      setApiOfflineState(false);
      return res;
    } catch (err) {
      setApiOfflineState(true);
      throw err;
    }
  }

  // --------------------
  // AUTH HANDLING
  // --------------------
  function getAuthState() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("Could not read auth state from localStorage", err);
      return null;
    }
  }

  function setAuthUser(updatedUser) {
    try {
      const current = getAuthState();
      if (!current) return;
      const next = { ...current, user: updatedUser };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn("Could not update auth user in storage", err);
    }
  }

  function clearAuthState() {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (err) {
      console.warn("Could not clear auth state", err);
    }
  }

  async function ensureAuthAndUser() {
    const auth = getAuthState();
    if (!auth || !auth.token) {
      redirectToLogin();
      return null;
    }

    const hasHelpers =
      typeof API_BASE_URL !== "undefined" &&
      typeof getAuthHeaders === "function";

    if (!hasHelpers) {
      console.warn(
        "API config helpers missing; using stored user only (no /me check)."
      );
      return getAuthState()?.user || null;
    }

    let user = getAuthState()?.user;

    try {
      // ✅ FIX: backend uses /api/me (not /api/auth/me)
      const res = await apiFetch("/me", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Not authenticated");

      const data = await res.json();
      const freshUser = data.user || data;
      user = freshUser;
      setAuthUser(user);
    } catch (err) {
      console.warn("Auth check failed, redirecting to login:", err);
      clearAuthState();
      redirectToLogin();
      return null;
    }

    return user;
  }

  function redirectToLogin() {
    const current = window.location.pathname.split("/").pop();
    if (current !== "login.html" && current !== "register.html") {
      window.location.href = "login.html";
    }
  }

  // --------------------
  // THEME
  // --------------------
  function applyTheme(theme) {
    const body = document.body;
    if (theme === "dark") {
      body.classList.add("theme-dark");
    } else {
      body.classList.remove("theme-dark");
    }
  }

  function getStoredTheme() {
    return localStorage.getItem(THEME_KEY);
  }

  function storeTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const saved = getStoredTheme();
    if (saved === "dark" || saved === "light") {
      applyTheme(saved);
    } else {
      applyTheme("light");
    }
  }

  function toggleTheme() {
    const isDark = document.body.classList.contains("theme-dark");
    const next = isDark ? "light" : "dark";
    applyTheme(next);
    storeTheme(next);
  }

  // --------------------
  // AVATAR
  // --------------------
  function getStoredAvatar() {
    try {
      const raw = localStorage.getItem(AVATAR_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("Could not read avatar from storage", err);
      return null;
    }
  }

  function storeAvatar(dataUrl) {
    try {
      const payload = { dataUrl };
      localStorage.setItem(AVATAR_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn("Could not store avatar", err);
    }
  }

  function clearAvatar() {
    try {
      localStorage.removeItem(AVATAR_KEY);
    } catch (err) {
      console.warn("Could not clear avatar", err);
    }
  }

  function applyAvatarToEls() {
    const avatar = getStoredAvatar();
    const src = avatar?.dataUrl || "";

    const els = document.querySelectorAll(".portal-avatar-img");
    els.forEach((img) => {
      if (src) {
        img.src = src;
        img.classList.remove("portal-avatar-placeholder");
      } else {
        img.src =
          "data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%235652FF'/%3E%3Cstop offset='100%25' stop-color='%23FF6FD8'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='80' height='80' rx='16' fill='url(%23g)'/%3E%3C/svg%3E";
        img.classList.add("portal-avatar-placeholder");
      }
    });
  }

  function initAvatar() {
    applyAvatarToEls();

    const input = document.getElementById("portal-avatar-input");
    if (input) {
      input.addEventListener("change", function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
          const dataUrl = evt.target?.result;
          if (!dataUrl || typeof dataUrl !== "string") return;
          storeAvatar(dataUrl);
          applyAvatarToEls();
        };
        reader.readAsDataURL(file);
      });
    }

    const removeBtn = document.getElementById("portal-avatar-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        clearAvatar();
        applyAvatarToEls();
      });
    }
  }

  // --------------------
  // DEMO DATA (fallback) – will be overwritten by API
  // --------------------
  let demoProjects = [];
  let demoTickets = [];
  let demoMessages = [];
  let demoFiles = [];
  let demoInvoices = [];
  let demoTimeline = [];

  // --------------------
  // FILTER STATE
  // --------------------
  let projectsFilter = "all";
  let projectsSearchTerm = "";

  let filesFilter = "all";
  let filesSearchTerm = "";

  let ticketsFilter = "all";
  let ticketsSearchTerm = "";

  let invoicesFilter = "all";
  let invoicesSearchTerm = "";

  let timelineFilter = "all";
  let timelineSearchTerm = "";

  // --------------------
  // API LOADERS
  // --------------------
  async function loadProjectsFromApi() {
    if (typeof API_BASE_URL === "undefined" || typeof getAuthHeaders !== "function") return;

    try {
      const res = await apiFetch("/projects", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch projects");

      const data = await res.json();
      if (Array.isArray(data.projects)) demoProjects = data.projects;

      renderDashboardOverview();
      renderDashboardProjects();
      renderProjectsList();
      populateTicketProjectOptions();
      populateMessageProjectOptions();
    } catch (err) {
      console.warn("Could not load projects from API", err);
    }
  }

  async function loadMessagesFromApi() {
    if (typeof API_BASE_URL === "undefined" || typeof getAuthHeaders !== "function") return;

    try {
      const res = await apiFetch("/messages", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch messages");

      const data = await res.json();
      if (Array.isArray(data.messages)) demoMessages = data.messages;

      renderDashboardMessages();
      renderMessagesList();
    } catch (err) {
      console.warn("Could not load messages from API", err);
    }
  }

  async function loadFilesFromApi() {
    if (typeof API_BASE_URL === "undefined" || typeof getAuthHeaders !== "function") return;

    try {
      const res = await apiFetch("/files", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch files");

      const data = await res.json();
      if (Array.isArray(data.files)) demoFiles = data.files;

      renderDashboardFiles();
      renderFilesList();
    } catch (err) {
      console.warn("Could not load files from API", err);
    }
  }

  async function loadSupportTicketsFromApi() {
    if (typeof API_BASE_URL === "undefined" || typeof getAuthHeaders !== "function") return;

    try {
      const res = await apiFetch("/support-tickets", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch tickets");

      const data = await res.json();
      if (Array.isArray(data.tickets)) demoTickets = data.tickets;

      renderSupportTickets();
      updateDashboardSupportCounts();
    } catch (err) {
      console.warn("Could not load support tickets from API", err);
    }
  }

  async function loadInvoicesFromApi() {
    if (typeof API_BASE_URL === "undefined" || typeof getAuthHeaders !== "function") return;

    try {
      const res = await apiFetch("/invoices", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch invoices");

      const data = await res.json();
      if (Array.isArray(data.invoices)) demoInvoices = data.invoices;

      renderInvoicesList();
      updateDashboardFinancials();
      updateInvoiceSidebarMetrics();
    } catch (err) {
      console.warn("Could not load invoices from API", err);
    }
  }

  async function loadTimelineFromApi() {
    if (typeof API_BASE_URL === "undefined" || typeof getAuthHeaders !== "function") return;

    try {
      const res = await apiFetch("/timeline", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch timeline");

      const data = await res.json();
      if (Array.isArray(data.events)) demoTimeline = data.events;

      renderTimeline();
    } catch (err) {
      console.warn("Could not load timeline from API", err);
    }
  }

  // --------------------
  // WRITE HELPERS
  // --------------------
  async function createSupportTicket(subject, projectId) {
    const trimmed = (subject || "").trim();
    if (!trimmed) throw new Error("Please enter a short description of your request.");

    const payload = { subject: trimmed };
    if (projectId) {
      const numeric = Number(projectId);
      if (!Number.isNaN(numeric)) payload.projectId = numeric;
    }

    const res = await apiFetch("/support-tickets", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let message = "Failed to create support ticket";
      try {
        const data = await res.json();
        if (data && data.message) message = data.message;
      } catch {}
      throw new Error(message);
    }

    const data = await res.json();
    return data.ticket;
  }

  async function createMessage(subject, body, projectId) {
    const trimmedSubject = (subject || "").trim();
    const trimmedBody = (body || "").trim();

    if (!trimmedSubject) throw new Error("Please add a subject for your message.");
    if (!trimmedBody) throw new Error("Please write a short message.");

    const payload = { subject: trimmedSubject, body: trimmedBody };
    if (projectId) {
      const numeric = Number(projectId);
      if (!Number.isNaN(numeric)) payload.projectId = numeric;
    }

    const res = await apiFetch("/messages", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let message = "Failed to send message";
      try {
        const data = await res.json();
        if (data && data.message) message = data.message;
      } catch {}
      throw new Error(message);
    }

    const data = await res.json();
    return data.message;
  }

  async function updateProfile(name, email) {
    const payload = {};
    if (typeof name === "string" && name.trim()) payload.name = name.trim();
    if (typeof email === "string" && email.trim()) payload.email = email.trim();

    const res = await apiFetch("/me", {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let message = "Failed to update profile";
      try {
        const data = await res.json();
        if (data && data.message) message = data.message;
      } catch {}
      throw new Error(message);
    }

    const data = await res.json();
    const user = data.user || data;
    setAuthUser(user);
    return user;
  }

  async function updateInvoiceStatus(invoiceIdLabel, dbStatus) {
    const numeric = parseInt(String(invoiceIdLabel).replace(/^INV-/, ""), 10);
    if (Number.isNaN(numeric)) throw new Error("Invalid invoice id");

    const res = await apiFetch(`/invoices/${numeric}/status`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: dbStatus }),
    });

    if (!res.ok) {
      let message = "Failed to update invoice";
      try {
        const data = await res.json();
        if (data && data.message) message = data.message;
      } catch {}
      throw new Error(message);
    }

    const data = await res.json();
    return data.invoice;
  }

  // --------------------
  // FILTER HELPERS
  // --------------------
  function getVisibleProjects() {
    let projects = demoProjects.slice();

    if (projectsFilter === "active") projects = projects.filter((p) => p.status !== "Completed");
    else if (projectsFilter === "completed") projects = projects.filter((p) => p.status === "Completed");

    if (projectsSearchTerm) {
      const term = projectsSearchTerm.toLowerCase();
      projects = projects.filter((p) => {
        return (
          p.name.toLowerCase().includes(term) ||
          p.phase.toLowerCase().includes(term) ||
          p.status.toLowerCase().includes(term)
        );
      });
    }

    return projects;
  }

  function isImageFile(file) {
    if (!file.type) return false;
    const lower = file.type.toLowerCase();
    return lower.includes("png") || lower.includes("jpg") || lower.includes("jpeg") || lower.includes("gif");
  }

  function getVisibleFiles() {
    let files = demoFiles.slice();

    if (filesFilter === "images") files = files.filter((f) => isImageFile(f));
    else if (filesFilter === "documents") files = files.filter((f) => !isImageFile(f));

    if (filesSearchTerm) {
      const term = filesSearchTerm.toLowerCase();
      files = files.filter((f) => f.name.toLowerCase().includes(term));
    }

    return files;
  }

  function getVisibleTickets() {
    let tickets = demoTickets.slice();

    if (ticketsFilter === "open") tickets = tickets.filter((t) => t.status === "Open");
    else if (ticketsFilter === "in-progress") tickets = tickets.filter((t) => t.status === "In progress");
    else if (ticketsFilter === "resolved") tickets = tickets.filter((t) => t.status === "Resolved");

    if (ticketsSearchTerm) {
      const term = ticketsSearchTerm.toLowerCase();
      tickets = tickets.filter((t) => {
        return (
          t.subject.toLowerCase().includes(term) ||
          t.project.toLowerCase().includes(term) ||
          t.id.toLowerCase().includes(term)
        );
      });
    }

    return tickets;
  }

  function getVisibleInvoices() {
    let invoices = demoInvoices.slice();

    if (invoicesFilter === "outstanding") invoices = invoices.filter((i) => i.status === "Outstanding");
    else if (invoicesFilter === "paid") invoices = invoices.filter((i) => i.status === "Paid");
    else if (invoicesFilter === "overdue") invoices = invoices.filter((i) => i.status === "Overdue");

    if (invoicesSearchTerm) {
      const term = invoicesSearchTerm.toLowerCase();
      invoices = invoices.filter((i) => {
        return (
          String(i.id).toLowerCase().includes(term) ||
          i.project.toLowerCase().includes(term) ||
          String(i.amount).toLowerCase().includes(term) ||
          (i.when || "").toLowerCase().includes(term)
        );
      });
    }

    return invoices;
  }

  function getVisibleTimeline() {
    let events = demoTimeline.slice();

    if (timelineFilter === "project") events = events.filter((e) => e.type === "project");
    else if (timelineFilter === "billing") events = events.filter((e) => e.type === "billing");
    else if (timelineFilter === "support") events = events.filter((e) => e.type === "support");

    if (timelineSearchTerm) {
      const term = timelineSearchTerm.toLowerCase();
      events = events.filter((e) => e.label.toLowerCase().includes(term) || e.project.toLowerCase().includes(term));
    }

    return events;
  }

  // --------------------
  // RENDER HELPERS
  // --------------------
  function renderDashboardOverview() {
    const projects = demoProjects;
    const openProjects = projects.filter((p) => p.status !== "Completed");
    const completedProjects = projects.filter((p) => p.status === "Completed");

    const openEl = document.getElementById("dashboard-open-projects");
    const completedEl = document.getElementById("dashboard-completed-projects");

    if (openEl) openEl.textContent = String(openProjects.length);
    if (completedEl) completedEl.textContent = String(completedProjects.length);
  }

  function renderDashboardProjects() {
    const container = document.getElementById("dashboard-projects");
    if (!container) return;

    if (!demoProjects.length) {
      container.innerHTML =
        '<p class="empty-state-text">No projects yet – once you have an active project, you’ll see it here.</p>';
      return;
    }

    const recent = demoProjects.slice(0, 3);
    container.innerHTML = recent
      .map(
        (p) => `
      <div class="dashboard-project-row">
        <div class="dashboard-project-main">
          <div class="dashboard-project-name">${p.name}</div>
          <div class="dashboard-project-phase">${p.phase}</div>
        </div>
        <div class="dashboard-project-meta">
          <span class="dashboard-project-status">${p.status}</span>
          <span class="dashboard-project-updated">${p.updated}</span>
        </div>
      </div>`
      )
      .join("");
  }

  function renderDashboardMessages() {
    const container = document.getElementById("dashboard-messages");
    if (!container) return;

    if (!demoMessages.length) {
      container.innerHTML =
        '<p class="empty-state-text">No recent messages. When your designer sends updates, they’ll show here.</p>';
      return;
    }

    const recent = demoMessages.slice(0, 3);
    container.innerHTML = recent
      .map(
        (m) => `
      <div class="dashboard-message-row">
        <div class="dashboard-message-main">
          <div class="dashboard-message-subject">${m.subject}</div>
          <div class="dashboard-message-preview">${m.preview}</div>
        </div>
        <div class="dashboard-message-meta">
          <div class="dashboard-message-project">${m.project}</div>
          <div class="dashboard-message-updated">${m.updated}</div>
        </div>
      </div>`
      )
      .join("");
  }

  function renderDashboardFiles() {
    const container = document.getElementById("dashboard-files");
    if (!container) return;

    if (!demoFiles.length) {
      container.innerHTML =
        '<p class="empty-state-text">No files yet. Design drafts, exports and assets will appear here.</p>';
      return;
    }

    const recent = demoFiles.slice(0, 3);
    container.innerHTML = recent
      .map(
        (f) => `
      <div class="dashboard-file-row">
        <div class="dashboard-file-main">
          <div class="dashboard-file-name">${f.name}</div>
          <div class="dashboard-file-project">${f.project}</div>
        </div>
        <div class="dashboard-file-meta">
          <div class="dashboard-file-updated">${f.uploaded}</div>
        </div>
      </div>`
      )
      .join("");
  }

  function updateDashboardSupportCounts() {
    const tickets = demoTickets;
    const openCount = tickets.filter((t) => t.status === "Open").length;
    const resolvedCount = tickets.filter((t) => t.status === "Resolved").length;

    const openEl = document.getElementById("dashboard-open-tickets");
    const resolvedEl = document.getElementById("dashboard-resolved-tickets");

    if (openEl) openEl.textContent = String(openCount);
    if (resolvedEl) resolvedEl.textContent = String(resolvedCount);
  }

  function updateDashboardFinancials() {
    const invoices = demoInvoices;
    const outstanding = invoices.filter((i) => i.status === "Outstanding");
    const overdue = invoices.filter((i) => i.status === "Overdue");

    const outstandingEl = document.getElementById("dashboard-outstanding");
    const overdueEl = document.getElementById("dashboard-overdue");

    if (outstandingEl) outstandingEl.textContent = String(outstanding.length);
    if (overdueEl) overdueEl.textContent = String(overdue.length);
  }

  function updateInvoiceSidebarMetrics() {
    const totalEl = document.getElementById("invoice-metric-total");
    const outEl = document.getElementById("invoice-metric-outstanding");
    const overEl = document.getElementById("invoice-metric-overdue");

    if (!totalEl && !outEl && !overEl) return;

    const invoices = demoInvoices;
    const total = invoices.length;
    const outstanding = invoices.filter((i) => i.status === "Outstanding").length;
    const overdue = invoices.filter((i) => i.status === "Overdue").length;

    if (totalEl) totalEl.textContent = String(total);
    if (outEl) outEl.textContent = String(outstanding);
    if (overEl) overEl.textContent = String(overdue);
  }

  function renderProjectsList() {
    const container = document.getElementById("projects-list");
    if (!container) return;

    const projects = getVisibleProjects();
    if (!projects.length) {
      container.innerHTML =
        '<p class="empty-state-text">No projects found. Try adjusting your filters or search.</p>';
      return;
    }

    container.innerHTML = projects
      .map(
        (p) => `
      <div class="projects-row">
        <div class="projects-cell projects-name">
          <div class="projects-name-main">${p.name}</div>
          <div class="projects-name-sub">${p.phase}</div>
        </div>
        <div class="projects-cell projects-status">${p.status}</div>
        <div class="projects-cell projects-updated">${p.updated}</div>
      </div>`
      )
      .join("");
  }

  function renderFilesList() {
    const container = document.getElementById("files-list");
    if (!container) return;

    const files = getVisibleFiles();
    if (!files.length) {
      container.innerHTML =
        '<p class="empty-state-text">No files found. Once your designer shares assets, you’ll see them here.</p>';
      return;
    }

    container.innerHTML = files
      .map(
        (f) => `
      <div class="files-row">
        <div class="files-cell files-name">
          <div class="files-name-main">${f.name}</div>
          <div class="files-name-sub">${f.project}</div>
        </div>
        <div class="files-cell files-type">${f.type || ""}</div>
        <div class="files-cell files-updated">${f.uploaded}</div>
      </div>`
      )
      .join("");
  }

  function renderMessagesList() {
    const container = document.getElementById("messages-list");
    if (!container) return;

    const messages = demoMessages.slice();
    if (!messages.length) {
      container.innerHTML =
        '<p class="empty-state-text">No messages yet. Updates from your designer will appear here.</p>';
      return;
    }

    container.innerHTML = messages
      .map(
        (m) => `
      <div class="messages-row">
        <div class="messages-cell messages-main">
          <div class="messages-subject">${m.subject}</div>
          <div class="messages-preview">${m.preview}</div>
        </div>
        <div class="messages-cell messages-meta">
          <div class="message-project">${m.project}</div>
          <div class="message-updated">${m.updated}</div>
        </div>
      </div>`
      )
      .join("");
  }

  function renderSupportTickets() {
    const container = document.getElementById("tickets-list");
    if (!container) return;

    const tickets = getVisibleTickets();
    if (!tickets.length) {
      container.innerHTML =
        '<p class="empty-state-text">No support tickets yet. When you raise a request, it’ll appear here.</p>';
      return;
    }

    container.innerHTML = tickets
      .map((t) => {
        const statusClass = t.status.toLowerCase().replace(" ", "-");
        return `
        <div class="tickets-row">
          <div class="tickets-cell tickets-subject">
            <div class="tickets-subject-main">${t.subject}</div>
            <div class="tickets-subject-sub">${t.id} • ${t.project}</div>
          </div>
          <div class="tickets-cell tickets-status tickets-status-${statusClass}">${t.status}</div>
          <div class="tickets-cell tickets-updated">${t.updated}</div>
        </div>`;
      })
      .join("");
  }

  function renderInvoicesList() {
    const container = document.getElementById("invoices-list");
    if (!container) return;

    const invoices = getVisibleInvoices();
    if (!invoices.length) {
      container.innerHTML =
        '<p class="empty-state-text">No invoices found. Try a different search or filter.</p>';
      return;
    }

    container.innerHTML = invoices
      .map((inv) => {
        const statusClass = inv.status.toLowerCase();
        return `
        <div class="invoices-row"
             data-invoice-id="${inv.id}"
             data-invoice-status="${inv.status}">
          <div class="invoices-cell invoices-project">
            <div class="invoices-project-main">${inv.project}</div>
            <div class="invoices-project-sub">${inv.id}</div>
          </div>
          <div class="invoices-cell invoices-amount">${inv.amount}</div>
          <div class="invoices-cell invoices-when">${inv.when || ""}</div>
          <div class="invoices-cell invoices-status invoices-status-${statusClass}">${inv.status}</div>
        </div>`;
      })
      .join("");
  }

  function renderTimeline() {
    const container = document.getElementById("timeline-list");
    if (!container) return;

    const events = getVisibleTimeline();
    if (!events.length) {
      container.innerHTML =
        '<p class="empty-state-text">Nothing on the timeline yet. As your project moves forward, key milestones will appear here.</p>';
      return;
    }

    container.innerHTML = events
      .map(
        (e) => `
      <div class="timeline-row">
        <div class="timeline-icon timeline-icon-${e.type}"></div>
        <div class="timeline-main">
          <div class="timeline-label">${e.label}</div>
          <div class="timeline-sub">${e.project} • ${e.date}</div>
        </div>
      </div>`
      )
      .join("");
  }

  // --------------------
  // PROJECT SELECTS FOR SUPPORT & MESSAGES
  // --------------------
  function populateTicketProjectOptions() {
    const select = document.getElementById("new-ticket-project");
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "General (not linked to a specific project)";
    defaultOption.setAttribute("data-default", "true");
    select.appendChild(defaultOption);

    demoProjects.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });

    if (currentValue) select.value = currentValue;
  }

  function populateMessageProjectOptions() {
    const select = document.getElementById("new-message-project");
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "General (not linked to a specific project)";
    defaultOption.setAttribute("data-default", "true");
    select.appendChild(defaultOption);

    demoProjects.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });

    if (currentValue) select.value = currentValue;
  }

  // --------------------
  // MESSAGES SEARCH
  // --------------------
  function initMessagesSearch() {
    const searchInput = document.getElementById("messages-search");
    const listEl = document.getElementById("messages-list");
    if (!searchInput || !listEl) return;

    searchInput.addEventListener("input", function (e) {
      const term = e.target.value.trim().toLowerCase();

      if (!term) {
        renderMessagesList();
        return;
      }

      const filtered = demoMessages.filter((m) => {
        return (
          m.subject.toLowerCase().includes(term) ||
          m.preview.toLowerCase().includes(term) ||
          m.project.toLowerCase().includes(term)
        );
      });

      if (!filtered.length) {
        listEl.innerHTML =
          '<p class="empty-state-text">No messages match that search.</p>';
        return;
      }

      listEl.innerHTML = filtered
        .map(
          (m) => `
        <div class="messages-row">
          <div class="messages-cell messages-main">
            <div class="messages-subject">${m.subject}</div>
            <div class="messages-preview">${m.preview}</div>
          </div>
          <div class="messages-cell messages-meta">
            <div class="message-project">${m.project}</div>
            <div class="message-updated">${m.updated}</div>
          </div>
        </div>`
        )
        .join("");
    });
  }

  // --------------------
  // ACCOUNT MENU
  // --------------------
  function initAccountMenu() {
    const chip = document.getElementById("portal-account-chip");
    const menu = document.getElementById("portal-account-menu");
    if (!chip || !menu) return;

    chip.addEventListener("click", function () {
      menu.classList.toggle("is-open");
    });

    document.addEventListener("click", function (e) {
      const clickedInsideMenu = menu.contains(e.target);
      const clickedChip = chip.contains(e.target);
      if (!clickedInsideMenu && !clickedChip) {
        menu.classList.remove("is-open");
      }
    });
  }

  // --------------------
  // DOM READY
  // --------------------
  document.addEventListener("DOMContentLoaded", async function () {
    let user = null;
    try {
      user = await ensureAuthAndUser();
    } catch (err) {
      console.warn("Auth failed", err);
    }
    if (!user) return;

    initTheme();
    const themeToggleBtn = document.querySelector(".portal-theme-toggle");
    if (themeToggleBtn) themeToggleBtn.addEventListener("click", toggleTheme);

    const nameEls = document.querySelectorAll("#portal-account-name-menu");
    const emailEls = document.querySelectorAll("#portal-account-email-menu");
    const displayNameEls = document.querySelectorAll(".portal-account-name");

    function applyUserToHeader(u) {
      nameEls.forEach((el) => (el.textContent = u.name || "Your Client"));
      emailEls.forEach((el) => (el.textContent = u.email || ""));
      displayNameEls.forEach((el) => (el.textContent = u.name || "Your Client"));
    }

    applyUserToHeader(user);

    initAvatar();
    initAccountMenu();

    const themeSelect = document.getElementById("portal-theme-select");
    if (themeSelect) {
      const saved = getStoredTheme() || "light";
      themeSelect.value = saved;
      themeSelect.addEventListener("change", function (e) {
        const chosen = e.target.value === "dark" ? "dark" : "light";
        applyTheme(chosen);
        storeTheme(chosen);
      });
    }

    const currentPage = window.location.pathname.split("/").pop();
    document.querySelectorAll(".portal-bottom-link").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;
      if (href.endsWith(currentPage)) link.classList.add("is-active");
    });

    const logoutLinks = document.querySelectorAll("[data-logout]");
    logoutLinks.forEach((btn) =>
      btn.addEventListener("click", function () {
        clearAuthState();
        redirectToLogin();
      })
    );

    // Base dashboard renders
    renderDashboardOverview();
    renderDashboardProjects();
    renderDashboardMessages();
    renderDashboardFiles();
    updateDashboardSupportCounts();
    updateDashboardFinancials();
    updateInvoiceSidebarMetrics();
    renderTimeline();

    // PROJECTS filters/search
    const projectsSearchInput = document.getElementById("projects-search");
    const projectFilterButtons = document.querySelectorAll(".projects-filter-btn");
    if (projectsSearchInput) {
      projectsSearchInput.addEventListener("input", function (e) {
        projectsSearchTerm = e.target.value.trim();
        renderProjectsList();
      });
    }
    if (projectFilterButtons.length) {
      projectFilterButtons.forEach((btn) =>
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-filter") || "all";
          projectsFilter = value;
          projectFilterButtons.forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          renderProjectsList();
        })
      );
    }

    // FILES filters/search
    const filesSearchInput = document.getElementById("files-search");
    const filesFilterButtons = document.querySelectorAll(".files-filter-btn");
    if (filesSearchInput) {
      filesSearchInput.addEventListener("input", function (e) {
        filesSearchTerm = e.target.value.trim();
        renderFilesList();
      });
    }
    if (filesFilterButtons.length) {
      filesFilterButtons.forEach((btn) =>
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-filter") || "all";
          filesFilter = value;
          filesFilterButtons.forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          renderFilesList();
        })
      );
    }

    // MESSAGES
    initMessagesSearch();
    populateMessageProjectOptions();

    const newMessageForm = document.getElementById("new-message-form");
    const newMessageSubject = document.getElementById("new-message-subject");
    const newMessageBody = document.getElementById("new-message-body");
    const newMessageProject = document.getElementById("new-message-project");
    const newMessageStatus = document.getElementById("new-message-status");

    if (newMessageForm && newMessageSubject && newMessageBody) {
      newMessageForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const subject = newMessageSubject.value.trim();
        const body = newMessageBody.value.trim();
        const projectValue = newMessageProject && newMessageProject.value ? newMessageProject.value : "";

        if (!subject || !body) {
          if (newMessageStatus) newMessageStatus.textContent = "Please add a subject and a short message.";
          return;
        }

        const submitButton = newMessageForm.querySelector("button[type='submit']");
        if (submitButton) submitButton.disabled = true;
        if (newMessageStatus) newMessageStatus.textContent = "Sending...";

        try {
          const message = await createMessage(subject, body, projectValue);
          demoMessages = [message, ...demoMessages];
          newMessageSubject.value = "";
          newMessageBody.value = "";
          if (newMessageProject) newMessageProject.value = "";
          renderMessagesList();
          renderDashboardMessages();
          if (newMessageStatus) newMessageStatus.textContent = "Message sent.";
          loadTimelineFromApi();
        } catch (err) {
          console.error("Failed to send message:", err);
          if (newMessageStatus) {
            newMessageStatus.textContent = err && err.message ? err.message : "Could not send message. Please try again.";
          }
        } finally {
          if (submitButton) submitButton.disabled = false;
        }
      });
    }

    // SUPPORT
    populateTicketProjectOptions();

    const ticketsSearchInput = document.getElementById("tickets-search");
    const ticketFilterButtons = document.querySelectorAll(".tickets-filter-btn");
    const newTicketForm = document.getElementById("new-ticket-form");
    const newTicketSubject = document.getElementById("new-ticket-subject");
    const newTicketStatus = document.getElementById("new-ticket-status");
    const newTicketProject = document.getElementById("new-ticket-project");

    if (ticketsSearchInput) {
      ticketsSearchInput.addEventListener("input", function (e) {
        ticketsSearchTerm = e.target.value.trim();
        renderSupportTickets();
      });
    }
    if (ticketFilterButtons.length) {
      ticketFilterButtons.forEach((btn) =>
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-filter") || "all";
          ticketsFilter = value;
          ticketFilterButtons.forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          renderSupportTickets();
        })
      );
    }

    if (newTicketForm && newTicketSubject) {
      newTicketForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const subject = newTicketSubject.value.trim();
        const projectValue = newTicketProject && newTicketProject.value ? newTicketProject.value : "";

        if (!subject) {
          if (newTicketStatus) newTicketStatus.textContent = "Please add a short description of your request.";
          return;
        }

        const submitButton = newTicketForm.querySelector("button[type='submit']");
        if (submitButton) submitButton.disabled = true;
        if (newTicketStatus) newTicketStatus.textContent = "Sending your request...";

        try {
          const ticket = await createSupportTicket(subject, projectValue);
          demoTickets = [ticket, ...demoTickets];
          newTicketSubject.value = "";
          if (newTicketProject) newTicketProject.value = "";
          renderSupportTickets();
          updateDashboardSupportCounts();
          if (newTicketStatus) newTicketStatus.textContent = "Support request created.";
          loadTimelineFromApi();
        } catch (err) {
          console.error("Failed to create support ticket:", err);
          if (newTicketStatus) {
            newTicketStatus.textContent = err && err.message ? err.message : "Could not create support ticket. Please try again.";
          }
        } finally {
          if (submitButton) submitButton.disabled = false;
        }
      });
    }

    // INVOICES search + filters + click-to-toggle
    const invoicesSearchInput = document.getElementById("invoices-search");
    const invoiceFilterButtons = document.querySelectorAll(".invoices-filter-btn");
    if (invoicesSearchInput) {
      invoicesSearchInput.addEventListener("input", function (e) {
        invoicesSearchTerm = e.target.value.trim();
        renderInvoicesList();
      });
    }
    if (invoiceFilterButtons.length) {
      invoiceFilterButtons.forEach((btn) =>
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-filter") || "all";
          invoicesFilter = value;
          invoiceFilterButtons.forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          renderInvoicesList();
        })
      );
    }

    const invoicesListEl = document.getElementById("invoices-list");
    if (invoicesListEl) {
      invoicesListEl.addEventListener("click", async function (e) {
        const row = e.target.closest(".invoices-row");
        if (!row) return;

        const idLabel = row.getAttribute("data-invoice-id");
        const currentStatus = row.getAttribute("data-invoice-status");
        if (!idLabel || !currentStatus) return;

        let newLabelStatus = currentStatus;
        let dbStatus = null;

        if (currentStatus === "Outstanding" || currentStatus === "Overdue") {
          newLabelStatus = "Paid";
          dbStatus = "paid";
        } else if (currentStatus === "Paid") {
          newLabelStatus = "Outstanding";
          dbStatus = "unpaid";
        }

        if (!dbStatus) return;

        const ok = window.confirm(`Demo: mark invoice ${idLabel} as ${newLabelStatus}?`);
        if (!ok) return;

        try {
          const updated = await updateInvoiceStatus(idLabel, dbStatus);
          demoInvoices = demoInvoices.map((inv) => (inv.id === updated.id ? updated : inv));
          renderInvoicesList();
          updateDashboardFinancials();
          updateInvoiceSidebarMetrics();
          loadTimelineFromApi();
        } catch (err) {
          console.error("Failed to update invoice:", err);
          window.alert(err && err.message ? err.message : "Could not update invoice status.");
        }
      });
    }

    // TIMELINE filters/search
    const timelineSearchInput = document.getElementById("timeline-search");
    const timelineFilterButtons = document.querySelectorAll(".timeline-filter-btn");
    if (timelineSearchInput) {
      timelineSearchInput.addEventListener("input", function (e) {
        timelineSearchTerm = e.target.value.trim();
        renderTimeline();
      });
    }
    if (timelineFilterButtons.length) {
      timelineFilterButtons.forEach((btn) =>
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-filter") || "all";
          timelineFilter = value;
          timelineFilterButtons.forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          renderTimeline();
        })
      );
    }

    // SETTINGS / profile form
    const settingsForm = document.getElementById("settings-form");
    if (settingsForm) {
      const nameInput = document.getElementById("settings-name");
      const emailInput = document.getElementById("settings-email");
      const statusEl = document.getElementById("settings-status");

      if (nameInput) nameInput.value = user.name || "";
      if (emailInput) emailInput.value = user.email || "";

      settingsForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const nameValue = nameInput ? nameInput.value : "";
        const emailValue = emailInput ? emailInput.value : "";

        const submitButton = settingsForm.querySelector("button[type='submit']");
        if (submitButton) submitButton.disabled = true;
        if (statusEl) statusEl.textContent = "Saving your details...";

        try {
          const updatedUser = await updateProfile(nameValue, emailValue);
          if (nameInput) nameInput.value = updatedUser.name || "";
          if (emailInput) emailInput.value = updatedUser.email || "";
          applyUserToHeader(updatedUser);
          if (statusEl) statusEl.textContent = "Profile updated.";
        } catch (err) {
          console.error("Failed to update profile:", err);
          if (statusEl) {
            statusEl.textContent = err && err.message ? err.message : "Could not update your profile. Please try again.";
          }
        } finally {
          if (submitButton) submitButton.disabled = false;
        }
      });
    }

    // Initial renders
    renderProjectsList();
    renderFilesList();
    renderMessagesList();
    renderSupportTickets();
    renderInvoicesList();
    renderTimeline();

    // Fetch live data
    loadProjectsFromApi();
    loadMessagesFromApi();
    loadSupportTicketsFromApi();
    loadInvoicesFromApi();
    loadFilesFromApi();
    loadTimelineFromApi();
  });
})();

// --------------------
// MOBILE "MORE" MENU
// --------------------
function setupMobileMoreMenu() {
  const moreBtn = document.querySelector("[data-more]");
  if (!moreBtn) return;

  // Create overlay + sheet once
  let overlay = document.querySelector(".portal-more-overlay");
  let sheet = document.querySelector(".portal-more-sheet");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "portal-more-overlay";
    document.body.appendChild(overlay);
  }

  if (!sheet) {
    sheet = document.createElement("div");
    sheet.className = "portal-more-sheet";
    sheet.innerHTML = `
      <a href="invoices.html">🧾 <span>Invoices</span></a>
      <a href="timeline.html">📅 <span>Timeline</span></a>
      <a href="settings.html">⚙️ <span>Settings</span></a>
      <button type="button" class="more-muted" data-logout>🚪 <span>Log out</span></button>
    `;
    document.body.appendChild(sheet);
  }

  function openMenu() {
    overlay.classList.add("is-open");
    sheet.classList.add("is-open");
  }

  function closeMenu() {
    overlay.classList.remove("is-open");
    sheet.classList.remove("is-open");
  }

  moreBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const isOpen = sheet.classList.contains("is-open");
    if (isOpen) closeMenu();
    else openMenu();
  });

  overlay.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // Hook logout inside the More sheet (since it's created dynamically)
  const sheetLogoutBtn = sheet.querySelector("[data-logout]");
  if (sheetLogoutBtn) {
    sheetLogoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        localStorage.removeItem("bf-portal-auth");
      } catch {}
      closeMenu();
      window.location.href = "login.html";
    });
  }

  // Close when navigating via menu links
  sheet.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", closeMenu)
  );
}

document.addEventListener("DOMContentLoaded", () => {
  setupMobileMoreMenu();
});
