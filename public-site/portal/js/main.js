// BrightFoundry Client Portal JS 
// - Theme toggle (light/dark)
// - Simple fake auth gate (front-end only)
// - Demo data rendering for dashboard, projects, files, messages, support, invoices & timeline
// - Avatar upload (optional) with default gradient fallback
// - Account chip dropdown + logout
// - Search & filters for projects, files, messages, tickets, invoices, timeline

(function () {
  const THEME_KEY = "bf-portal-theme";
  const AUTH_KEY = "bf-portal-auth";
  const AVATAR_KEY = "bf-portal-avatar"; // stores data URL for uploaded avatar

  // --------------------
  // AUTH HANDLING (simple front-end gate)
  // --------------------
  function isLoggedIn() {
    return localStorage.getItem(AUTH_KEY) === "true";
  }

  function requireAuth() {
    const path = window.location.pathname;
    const isAuthPage =
      path.endsWith("login.html") || path.endsWith("register.html");

    if (!isAuthPage && !isLoggedIn()) {
      window.location.href = "login.html";
    }
  }

  function logoutAndRedirect() {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = "login.html";
  }

  // --------------------
  // THEME HANDLING
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
  // MESSAGES SEARCH
  // --------------------
  function initMessagesSearch() {
    const searchInput = document.getElementById("messages-search");
    const list = document.getElementById("messages-list");
    if (!searchInput || !list) return;

    function applyFilter() {
      const q = searchInput.value.trim().toLowerCase();
      const threads = Array.from(list.querySelectorAll(".message-thread"));
      let visibleCount = 0;

      threads.forEach((thread) => {
        const text = thread.innerText.toLowerCase();
        const matches = !q || text.includes(q);
        thread.style.display = matches ? "" : "none";
        if (matches) visibleCount++;
      });

      const countEl = document.getElementById("messages-count");
      if (countEl) {
        countEl.textContent = visibleCount;
      }
    }

    applyFilter();
    searchInput.addEventListener("input", applyFilter);
  }

  // --------------------
  // AVATAR HANDLING
  // --------------------
  function applyAvatar(dataUrl) {
    const containers = document.querySelectorAll(
      ".portal-avatar, .portal-account-avatar, #settings-profile-avatar"
    );

    containers.forEach((container) => {
      if (!container) return;

      let img = container.querySelector(".portal-avatar-img");
      if (!img) {
        img = document.createElement("img");
        img.className = "portal-avatar-img";
        img.alt = "Profile avatar";
        container.appendChild(img);
      }

      if (dataUrl) {
        img.src = dataUrl;
        container.classList.add("has-photo");
        img.style.display = "block";
      } else {
        img.removeAttribute("src");
        container.classList.remove("has-photo");
        img.style.display = "none";
      }
    });
  }

  function initAvatar() {
    const stored = localStorage.getItem(AVATAR_KEY);
    if (stored) {
      applyAvatar(stored);
    } else {
      applyAvatar(null); // default gradient
    }

    // Avatar upload (Settings page)
    const avatarInput = document.getElementById("settings-avatar");
    if (avatarInput) {
      avatarInput.addEventListener("change", function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
          const dataUrl = evt.target.result;
          try {
            localStorage.setItem(AVATAR_KEY, dataUrl);
          } catch (err) {
            console.warn("Could not store avatar in localStorage", err);
          }
          applyAvatar(dataUrl);
        };
        reader.readAsDataURL(file);
      });
    }

    // Remove avatar
    const removeBtn = document.getElementById("settings-avatar-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        localStorage.removeItem(AVATAR_KEY);
        applyAvatar(null);
      });
    }
  }

  // --------------------
  // LOAD PROJECTS FROM API
  // --------------------
  async function loadProjectsFromApi() {
    try {
      const res = await fetch("http://localhost:4000/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");

      const data = await res.json();

      // Support either { projects: [...] } or plain array
      if (Array.isArray(data.projects)) {
        demoProjects = data.projects;
      } else if (Array.isArray(data)) {
        demoProjects = data;
      }

      // Re-render bits that depend on projects
      renderDashboardOverview();
      renderDashboardProjects();
      renderProjectsList();
      updateDashboardSupportCounts();
    } catch (err) {
      console.warn(
        "Could not load projects from API, using local demo data instead.",
        err
      );
    }
  }

  // --------------------
  // LOAD MESSAGES FROM API
  // --------------------
  async function loadMessagesFromApi() {
    try {
      const res = await fetch("http://localhost:4000/api/messages");
      if (!res.ok) throw new Error("Failed to fetch messages");

      const data = await res.json();

      // Support either { messages: [...] } or plain array
      if (Array.isArray(data.messages)) {
        messagesData = data.messages;
      } else if (Array.isArray(data)) {
        messagesData = data;
      }

      // Re-render parts that depend on messages
      renderDashboardOverview();
      renderDashboardMessages();
      renderMessagesList();

      // Re-apply search filter so the visible count updates
      const searchInput = document.getElementById("messages-search");
      if (searchInput) {
        const evt = new Event("input");
        searchInput.dispatchEvent(evt);
      }
    } catch (err) {
      console.warn(
        "Could not load messages from API, using local demo data instead.",
        err
      );
    }
  }

  // --------------------
  // DEMO DATA
  // --------------------
  let demoProjects = [
    {
      id: 1,
      name: "Bright Bakery website",
      status: "In progress",
      phase: "Design & build",
      updated: "2 days ago",
    },
    {
      id: 2,
      name: "Coaching landing page",
      status: "Reviewing",
      phase: "Content & copy",
      updated: "5 days ago",
    },
    {
      id: 3,
      name: "Client portal prototype",
      status: "In progress",
      phase: "Development",
      updated: "Today",
    },
    {
      id: 4,
      name: "Brand refresh",
      status: "Completed",
      phase: "Launched",
      updated: "Last week",
    },
  ];

  const demoTickets = [
    {
      id: "SUP-012",
      status: "Open",
      subject: "Homepage hero not loading",
      updated: "Today",
      project: "Bright Bakery website",
    },
    {
      id: "SUP-011",
      status: "Resolved",
      subject: "Colour tweak on buttons",
      updated: "2 days ago",
      project: "Coaching landing page",
    },
    {
      id: "SUP-010",
      status: "In progress",
      subject: "Client portal login issue",
      updated: "Last week",
      project: "Client portal prototype",
    },
  ];

  const demoMessages = [
    {
      id: "MSG-101",
      subject: "Homepage layout feedback",
      preview:
        "Updated the hero section as discussed – what do you think?",
      updated: "Today",
      project: "Bright Bakery website",
    },
    {
      id: "MSG-102",
      subject: "Colour palette options",
      preview: "Version B feels closer to our brand colours.",
      updated: "Yesterday",
      project: "Brand refresh",
    },
    {
      id: "MSG-103",
      subject: "Launch date confirmation",
      preview: "We’re on track for the launch window we discussed.",
      updated: "3 days ago",
      project: "Client portal prototype",
    },
  ];

  const demoFiles = [
    {
      id: "FILE-001",
      name: "homepage-layout-v3.png",
      project: "Bright Bakery website",
      uploaded: "Today",
    },
    {
      id: "FILE-002",
      name: "brand-colours-guide.pdf",
      project: "Brand refresh",
      uploaded: "2 days ago",
    },
    {
      id: "FILE-003",
      name: "portal-wireframes-notes.docx",
      project: "Client portal prototype",
      uploaded: "5 days ago",
    },
    {
      id: "FILE-004",
      name: "coaching-landing-copy-v2.docx",
      project: "Coaching landing page",
      uploaded: "1 week ago",
    },
  ];

  const demoInvoices = [
    {
      id: "INV-001",
      project: "Bright Bakery website",
      status: "Paid",
      amount: "£1,200",
      when: "Paid 12 Nov",
    },
    {
      id: "INV-002",
      project: "Coaching landing page",
      status: "Outstanding",
      amount: "£650",
      when: "Due in 5 days",
    },
    {
      id: "INV-003",
      project: "Client portal prototype",
      status: "Overdue",
      amount: "£2,100",
      when: "Due 3 days ago",
    },
  ];

  // Timeline events (demo – mix of project, billing, support)
  const demoTimeline = [
    {
      id: "TL-001",
      type: "project",
      label: "Project kick-off call",
      project: "Bright Bakery website",
      date: "Today",
      relatedId: "",
    },
    {
      id: "TL-002",
      type: "billing",
      label: "Invoice INV-002 issued",
      project: "Coaching landing page",
      date: "Today",
      relatedId: "INV-002",
    },
    {
      id: "TL-003",
      type: "support",
      label: "Support ticket SUP-012 opened",
      project: "Bright Bakery website",
      date: "Yesterday",
      relatedId: "SUP-012",
    },
    {
      id: "TL-004",
      type: "project",
      label: "Client portal prototype development started",
      project: "Client portal prototype",
      date: "3 days ago",
      relatedId: "",
    },
    {
      id: "TL-005",
      type: "billing",
      label: "Invoice INV-001 paid",
      project: "Bright Bakery website",
      date: "Last week",
      relatedId: "INV-001",
    },
    {
      id: "TL-006",
      type: "support",
      label: "Ticket SUP-011 resolved",
      project: "Coaching landing page",
      date: "Last week",
      relatedId: "SUP-011",
    },
  ];

  // --------------------
  // CLIENT-SIDE STATE (live data from API or fallback demo)
  // --------------------
  let messagesData = demoMessages.slice();

  // --------------------
  // FILTER STATE
  // --------------------
  let projectsFilter = "all"; // 'all' | 'active' | 'completed'
  let projectsSearchTerm = "";

  let filesFilter = "all"; // 'all' | 'images' | 'documents'
  let filesSearchTerm = "";

  let ticketsFilter = "all"; // 'all' | 'open' | 'in-progress' | 'resolved'
  let ticketsSearchTerm = "";

  let invoicesFilter = "all"; // 'all' | 'outstanding' | 'paid' | 'overdue'
  let invoicesSearchTerm = "";

  let timelineFilter = "all"; // 'all' | 'project' | 'billing' | 'support'
  let timelineSearchTerm = "";

  function getVisibleProjects() {
    let projects = demoProjects.slice();

    if (projectsFilter === "active") {
      projects = projects.filter((p) => p.status !== "Completed");
    } else if (projectsFilter === "completed") {
      projects = projects.filter((p) => p.status === "Completed");
    }

    if (projectsSearchTerm) {
      const term = projectsSearchTerm.toLowerCase();
      projects = projects.filter((p) =>
        p.name.toLowerCase().includes(term)
      );
    }

    return projects;
  }

  function isImageFile(file) {
    const lower = file.name.toLowerCase();
    return /\.(png|jpe?g|gif|webp|svg)$/.test(lower);
  }

  function getVisibleFiles() {
    let files = demoFiles.slice();

    if (filesFilter === "images") {
      files = files.filter((f) => isImageFile(f));
    } else if (filesFilter === "documents") {
      files = files.filter((f) => !isImageFile(f));
    }

    if (filesSearchTerm) {
      const term = filesSearchTerm.toLowerCase();
      files = files.filter((f) =>
        f.name.toLowerCase().includes(term)
      );
    }

    return files;
  }

  function getVisibleTickets() {
    let tickets = demoTickets.slice();

    if (ticketsFilter === "open") {
      tickets = tickets.filter((t) => t.status === "Open");
    } else if (ticketsFilter === "in-progress") {
      tickets = tickets.filter((t) => t.status === "In progress");
    } else if (ticketsFilter === "resolved") {
      tickets = tickets.filter((t) => t.status === "Resolved");
    }

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

    if (invoicesFilter === "outstanding") {
      invoices = invoices.filter((i) => i.status === "Outstanding");
    } else if (invoicesFilter === "paid") {
      invoices = invoices.filter((i) => i.status === "Paid");
    } else if (invoicesFilter === "overdue") {
      invoices = invoices.filter((i) => i.status === "Overdue");
    }

    if (invoicesSearchTerm) {
      const term = invoicesSearchTerm.toLowerCase();
      invoices = invoices.filter((i) => {
        return (
          i.id.toLowerCase().includes(term) ||
          i.project.toLowerCase().includes(term) ||
          i.amount.toLowerCase().includes(term) ||
          i.when.toLowerCase().includes(term)
        );
      });
    }

    return invoices;
  }

  function getVisibleTimeline() {
    let events = demoTimeline.slice();

    if (timelineFilter === "project") {
      events = events.filter((e) => e.type === "project");
    } else if (timelineFilter === "billing") {
      events = events.filter((e) => e.type === "billing");
    } else if (timelineFilter === "support") {
      events = events.filter((e) => e.type === "support");
    }

    if (timelineSearchTerm) {
      const term = timelineSearchTerm.toLowerCase();
      events = events.filter((e) => {
        return (
          e.label.toLowerCase().includes(term) ||
          e.project.toLowerCase().includes(term) ||
          e.date.toLowerCase().includes(term) ||
          (e.relatedId && e.relatedId.toLowerCase().includes(term))
        );
      });
    }

    return events;
  }

  // --------------------
  // RENDER FUNCTIONS
  // --------------------
  function renderDashboardOverview() {
    const container = document.getElementById("dashboard-cards");
    if (!container) return;

    const activeProjects = demoProjects.filter(
      (p) => p.status === "In progress" || p.status === "Reviewing"
    ).length;

    const openTickets = demoTickets.filter((t) => t.status === "Open").length;

    const recentMessages = messagesData.length;

    container.innerHTML = `
      <div class="portal-card">
        <h3>Active projects</h3>
        <p>You currently have <strong>${activeProjects}</strong> projects in progress or review.</p>
      </div>
      <div class="portal-card">
        <h3>Support tickets</h3>
        <p><strong>${openTickets}</strong> open ticket(s). View details on the Support page.</p>
      </div>
      <div class="portal-card">
        <h3>Recent messages</h3>
        <p><strong>${recentMessages}</strong> recent message thread(s) in your inbox.</p>
      </div>
    `;
  }

  function renderDashboardProjects() {
    const container = document.getElementById("dashboard-projects");
    if (!container) return;

    if (!demoProjects.length) {
      container.innerHTML = `
        <p class="empty-state-text">
          No projects yet. Once your first project starts, you’ll see a quick overview here.
        </p>
      `;
      return;
    }

    const topProjects = demoProjects.slice(0, 3);

    const items = topProjects
      .map((p) => {
        return `
          <div class="dashboard-item-row">
            <div class="dashboard-item-main">
              <div class="dashboard-item-title">${p.name}</div>
              <div class="dashboard-item-sub">
                ${p.phase} • Updated ${p.updated}
              </div>
            </div>
            <div class="dashboard-item-tag">${p.status}</div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = items;
  }

  function renderDashboardMessages() {
    const container = document.getElementById("dashboard-messages");
    if (!container) return;

    if (!messagesData.length) {
      container.innerHTML = `
        <p class="empty-state-text">
          No messages yet. New replies and updates will appear here.
        </p>
      `;
      return;
    }

    const topMessages = messagesData.slice(0, 3);

    const items = topMessages
      .map((m) => {
        return `
          <div class="dashboard-item-row">
            <div class="dashboard-item-main">
              <div class="dashboard-item-title">${m.subject}</div>
              <div class="dashboard-item-sub">
                ${m.project} • ${m.updated}
              </div>
            </div>
            <div class="dashboard-item-preview">
              ${m.preview}
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = items;
  }

  function updateDashboardSupportCounts() {
    const openEl = document.getElementById("dashboard-open-tickets");
    const resolvedEl = document.getElementById("dashboard-resolved-tickets");
    if (!openEl || !resolvedEl) return;

    const openCount = demoTickets.filter((t) => t.status === "Open").length;
    const resolvedCount = demoTickets.filter(
      (t) => t.status === "Resolved"
    ).length;

    openEl.textContent = openCount;
    resolvedEl.textContent = resolvedCount;
  }

  function updateInvoicesSummary() {
    const totalEl = document.getElementById("invoices-total-count");
    const outstandingEl = document.getElementById(
      "invoices-outstanding-count"
    );
    if (!totalEl || !outstandingEl) return;

    const total = demoInvoices.length;
    const outstanding = demoInvoices.filter(
      (i) => i.status === "Outstanding" || i.status === "Overdue"
    ).length;

    totalEl.textContent = total;
    outstandingEl.textContent = outstanding;
  }

  function renderProjectsList() {
    const container = document.getElementById("projects-list");
    if (!container) return;

    const projects = getVisibleProjects();

    if (!projects.length) {
      container.innerHTML = `
        <p class="empty-state-text">
          No projects found. Try a different search or filter.
        </p>
      `;
      return;
    }

    const rows = projects
      .map((p) => {
        return `
          <div class="projects-row">
            <div class="projects-cell projects-name">
              <div class="projects-name-main">${p.name}</div>
              <div class="projects-name-sub">Last updated ${p.updated}</div>
            </div>
            <div class="projects-cell projects-phase">${p.phase}</div>
            <div class="projects-cell projects-status">${p.status}</div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = rows;
  }

  function renderFilesList() {
    const container = document.getElementById("files-list");
    if (!container) return;

    const files = getVisibleFiles();

    if (!files.length) {
      container.innerHTML = `
        <p class="empty-state-text">
          No files found. Try a different search or filter.
        </p>
      `;
      return;
    }

    const rows = files
      .map((f) => {
        return `
          <div class="files-row">
            <div class="files-cell files-name">
              <div class="files-name-main">${f.name}</div>
              <div class="files-name-sub">${f.project}</div>
            </div>
            <div class="files-cell files-project">
              ${f.project}
            </div>
            <div class="files-cell files-date">
              ${f.uploaded}
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = rows;
  }

  function renderMessagesList() {
    const container = document.getElementById("messages-list");
    if (!container) return;

    if (!messagesData.length) {
      container.innerHTML = `
        <p class="empty-state-text">
          No messages yet. New replies and updates will appear here.
        </p>
      `;
      return;
    }

    const rows = messagesData
      .map((m) => {
        return `
          <div class="message-thread">
            <div class="message-main">
              <div class="message-subject">${m.subject}</div>
              <div class="message-preview">${m.preview}</div>
            </div>
            <div class="message-meta">
              <div class="message-project">${m.project}</div>
              <div class="message-updated">${m.updated}</div>
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = rows;
  }

  function renderSupportTickets() {
    const container = document.getElementById("tickets-list");
    if (!container) return;

    const tickets = getVisibleTickets();

    if (!tickets.length) {
      container.innerHTML = `
        <p class="empty-state-text">
          No tickets found. Try a different search or filter.
        </p>
      `;
      return;
    }

    const rows = tickets
      .map((t) => {
        const statusClass = t.status.toLowerCase().replace(" ", "-");
        return `
          <div class="tickets-row">
            <div class="tickets-cell tickets-subject">
              <div class="tickets-subject-main">${t.subject}</div>
              <div class="tickets-subject-sub">${t.id} • ${t.project}</div>
            </div>
            <div class="tickets-cell tickets-status tickets-status-${statusClass}">
              ${t.status}
            </div>
            <div class="tickets-cell tickets-updated">
              ${t.updated}
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = rows;
  }

  function renderInvoicesList() {
    const container = document.getElementById("invoices-list");
    if (!container) return;

    const invoices = getVisibleInvoices();

    const countEl = document.getElementById("invoices-count");
    if (countEl) {
      countEl.textContent = invoices.length;
    }

    if (!invoices.length) {
      container.innerHTML = `
        <p class="empty-state-text">
          No invoices found. Try a different search or filter.
        </p>
      `;
      return;
    }

    const rows = invoices
      .map((inv) => {
        const statusClass = inv.status.toLowerCase(); // paid / outstanding / overdue
        return `
          <div class="invoices-row">
            <div class="invoices-cell invoices-main">
              <div class="invoices-id">${inv.id}</div>
              <div class="invoices-project">${inv.project}</div>
            </div>
            <div class="invoices-cell invoices-amount">
              ${inv.amount}
            </div>
            <div class="invoices-cell invoices-when">
              ${inv.when}
            </div>
            <div class="invoices-cell invoices-status">
              <span class="invoice-status invoice-status-${statusClass}">
                ${inv.status}
              </span>
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = rows;
  }

  function renderTimelineList() {
    const container = document.getElementById("timeline-list");
    if (!container) return;

    const events = getVisibleTimeline();

    const countEl = document.getElementById("timeline-count");
    if (countEl) {
      countEl.textContent = events.length;
    }

    if (!events.length) {
      container.innerHTML = `
        <p class="empty-state-text">
          No events found. Try a different search or filter.
        </p>
      `;
      return;
    }

    const rows = events
      .map((e) => {
        const pillClass =
          e.type === "project"
            ? "timeline-pill-project"
            : e.type === "billing"
            ? "timeline-pill-billing"
            : "timeline-pill-support";

        const typeLabel =
          e.type === "project"
            ? "Project"
            : e.type === "billing"
            ? "Billing"
            : "Support";

        const relatedMarkup = e.relatedId
          ? `<span class="timeline-id">${e.relatedId}</span>`
          : "";

        return `
          <div class="timeline-row">
            <div class="timeline-line"></div>
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-top">
                <div class="timeline-title">${e.label}</div>
                <div class="timeline-meta-date">${e.date} • ${e.project}</div>
              </div>
              <div class="timeline-bottom">
                <span class="timeline-pill ${pillClass}">${typeLabel}</span>
                ${relatedMarkup}
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = rows;
  }

  // --------------------
  // ACCOUNT CHIP MENU
  // --------------------
  function initAccountMenu() {
    const chip = document.getElementById("portal-account-chip");
    const menu = document.getElementById("portal-account-menu");
    if (!chip || !menu) return;

    chip.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.classList.toggle("is-open");
    });

    document.addEventListener("click", function (e) {
      if (!menu.classList.contains("is-open")) return;
      const clickedInsideMenu = menu.contains(e.target);
      const clickedChip = chip.contains(e.target);
      if (!clickedInsideMenu && !clickedChip) {
        menu.classList.remove("is-open");
      }
    });
  }

  // --------------------
  // INIT
  // --------------------
  document.addEventListener("DOMContentLoaded", function () {
    // Auth gate
    requireAuth();

    // Theme
    initTheme();
    const toggleButtons = document.querySelectorAll(".portal-theme-toggle");
    toggleButtons.forEach((btn) => {
      btn.addEventListener("click", toggleTheme);
    });

    // Avatars
    initAvatar();

    // Account chip dropdown
    initAccountMenu();

    // Theme select in Settings
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

    // Mobile bottom nav active state
    const currentPage = window.location.pathname.split("/").pop();
    document.querySelectorAll(".portal-bottom-link").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;
      if (href.endsWith(currentPage)) {
        link.classList.add("is-active");
      }
    });

    // Logout links
    const logoutLinks = document.querySelectorAll("[data-logout]");
    logoutLinks.forEach((link) => {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        logoutAndRedirect();
      });
    });

    // --------------------
    // PROJECTS CONTROLS
    // --------------------
    const projectsSearchInput = document.getElementById("projects-search");
    const projectFilterButtons = document.querySelectorAll(
      ".projects-filter-btn"
    );

    if (projectsSearchInput) {
      projectsSearchInput.addEventListener("input", function (e) {
        projectsSearchTerm = e.target.value.trim();
        renderProjectsList();
      });
    }

    if (projectFilterButtons.length) {
      projectFilterButtons.forEach((btn) => {
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-filter") || "all";
          projectsFilter = value;

          projectFilterButtons.forEach((b) =>
            b.classList.remove("is-active")
          );
          btn.classList.add("is-active");

          renderProjectsList();
        });
      });
    }

    // --------------------
    // FILES CONTROLS
    // --------------------
    const filesSearchInput = document.getElementById("files-search");
    const filesFilterButtons = document.querySelectorAll(".files-filter-btn");

    if (filesSearchInput) {
      filesSearchInput.addEventListener("input", function (e) {
        filesSearchTerm = e.target.value.trim();
        renderFilesList();
      });
    }

    if (filesFilterButtons.length) {
      filesFilterButtons.forEach((btn) => {
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-filter") || "all";
          filesFilter = value;

          filesFilterButtons.forEach((b) =>
            b.classList.remove("is-active")
          );
          btn.classList.add("is-active");

          renderFilesList();
        });
      });
    }

    // --------------------
    // MESSAGES CONTROLS
    // --------------------
    initMessagesSearch();

    // --------------------
    // SUPPORT CONTROLS
    // --------------------
    const ticketsSearchInput = document.getElementById("tickets-search");
    const ticketFilterButtons = document.querySelectorAll(
      ".tickets-filter-btn"
    );

    if (ticketsSearchInput) {
      ticketsSearchInput.addEventListener("input", function (e) {
        ticketsSearchTerm = e.target.value.trim();
        renderSupportTickets();
      });
    }

    if (ticketFilterButtons.length) {
      ticketFilterButtons.forEach((btn) => {
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-filter") || "all";
          ticketsFilter = value;

          ticketFilterButtons.forEach((b) =>
            b.classList.remove("is-active")
          );
          btn.classList.add("is-active");

          renderSupportTickets();
        });
      });
    }

    // --------------------
    // INVOICES CONTROLS
    // --------------------
    const invoicesSearchInput = document.getElementById("invoices-search");
    const invoiceFilterButtons = document.querySelectorAll(
      ".invoices-filter-btn"
    );

    if (invoicesSearchInput) {
      invoicesSearchInput.addEventListener("input", function (e) {
        invoicesSearchTerm = e.target.value.trim();
        renderInvoicesList();
      });
    }

    if (invoiceFilterButtons.length) {
      invoiceFilterButtons.forEach((btn) => {
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-filter") || "all";
          invoicesFilter = value;

          invoiceFilterButtons.forEach((b) =>
            b.classList.remove("is-active")
          );
          btn.classList.add("is-active");

          renderInvoicesList();
        });
      });
    }

    // --------------------
    // TIMELINE CONTROLS
    // --------------------
    const timelineSearchInput = document.getElementById("timeline-search");
    const timelineFilterButtons = document.querySelectorAll(
      ".timeline-filter-btn"
    );

    if (timelineSearchInput) {
      timelineSearchInput.addEventListener("input", function (e) {
        timelineSearchTerm = e.target.value.trim();
        renderTimelineList();
      });
    }

    if (timelineFilterButtons.length) {
      timelineFilterButtons.forEach((btn) => {
        btn.addEventListener("click", function () {
          const value = btn.getAttribute("data-filter") || "all";
          timelineFilter = value;

          timelineFilterButtons.forEach((b) =>
            b.classList.remove("is-active")
          );
          btn.classList.add("is-active");

          renderTimelineList();
        });
      });
    }

    // Initial renders (no-op on pages that don't have the containers)
    renderDashboardOverview();
    renderProjectsList();
    renderFilesList();
    renderMessagesList();
    renderSupportTickets();
    renderInvoicesList();
    renderTimelineList();
    updateInvoicesSummary();

    renderDashboardProjects();
    renderDashboardMessages();
    updateDashboardSupportCounts();

    // Try to refresh projects and messages from the API
    loadProjectsFromApi();
    loadMessagesFromApi();
  });
})();
