require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const prisma = require("./prismaClient");
const authRoutes = require("./authRoutes");

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// ---------- MIDDLEWARE ----------
app.use(
  cors({
    origin: "*", // fine for local dev; tighten later if you want
    methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    allowedHeaders: "Content-Type, Authorization",
  })
);
app.use(express.json());

// Simple health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// ---------- AUTH ROUTES ----------
app.use("/api/auth", authRoutes);

// ---------- AUTH MIDDLEWARE FOR DATA ROUTES ----------
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (!token || scheme !== "Bearer") {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const payload = jwt.verify(token, JWT_SECRET); // { id, email, role }
    const user = await prisma.user.findUnique({ where: { id: payload.id } });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// ---------- HELPERS ----------
function mapProjectStatus(dbStatus) {
  switch (dbStatus) {
    case "planning":
      return { status: "Planning", phase: "Discovery & planning" };
    case "design":
      return { status: "In progress", phase: "Design" };
    case "build":
      return { status: "In progress", phase: "Development" };
    case "launched":
      return { status: "Completed", phase: "Launched" };
    default:
      return { status: "In progress", phase: "In progress" };
  }
}

function formatShortDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function mapSupportTicket(t) {
  let statusLabel = t.status;
  if (t.status === "open") statusLabel = "Open";
  if (t.status === "closed") statusLabel = "Resolved";

  return {
    id: `SUP-${String(t.id).padStart(3, "0")}`,
    status: statusLabel,
    subject: t.subject,
    updated: formatShortDate(t.createdAt) || "Recently",
    project: t.project ? t.project.name : "General",
  };
}

// Derive subject + preview from the single `body` field
function mapMessage(m) {
  const fullText = (m.body || "").trim();

  if (!fullText) {
    return {
      id: m.id,
      subject: "Message",
      preview: "",
      project: m.project ? m.project.name : "General",
      from: m.fromRole === "client" ? "You" : "BrightFoundry",
      role: m.fromRole,
      updated: formatShortDate(m.createdAt) || "Recently",
    };
  }

  const lines = fullText.split(/\r?\n/);
  const firstLine = (lines[0] || "").trim();
  const subject = firstLine || "Message";

  const remaining = lines.slice(1).join("\n").trim();
  const previewSource = remaining || fullText;

  let preview = previewSource;
  if (preview.length > 120) {
    preview = preview.slice(0, 117).trim() + "…";
  }

  return {
    id: m.id,
    subject,
    preview,
    project: m.project ? m.project.name : "General",
    from: m.fromRole === "client" ? "You" : "BrightFoundry",
    role: m.fromRole,
    updated: formatShortDate(m.createdAt) || "Recently",
  };
}

function mapInvoice(inv) {
  let statusLabel = inv.status;
  if (inv.status === "unpaid") statusLabel = "Outstanding";
  if (inv.status === "paid") statusLabel = "Paid";
  if (inv.status === "overdue") statusLabel = "Overdue";

  let when = "";
  if (inv.dueDate) {
    const dateLabel = formatShortDate(inv.dueDate);
    if (inv.status === "paid") {
      when = `Paid ${dateLabel}`;
    } else {
      when = `Due ${dateLabel}`;
    }
  }

  return {
    id: `INV-${String(inv.id).padStart(3, "0")}`,
    project: inv.project ? inv.project.name : "General",
    amount: inv.amount,
    currency: inv.currency,
    status: statusLabel,
    when,
  };
}

// ---------- ME (PROFILE) ----------
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user });
  } catch (err) {
    console.error("GET /api/me error:", err);
    res.status(500).json({ message: "Failed to load profile" });
  }
});

app.patch("/api/me", requireAuth, async (req, res) => {
  try {
    const { name, email } = req.body || {};
    const updates = {};

    if (typeof name === "string" && name.trim()) {
      updates.name = name.trim();
    }
    if (typeof email === "string" && email.trim()) {
      updates.email = email.trim();
    }

    if (!Object.keys(updates).length) {
      return res
        .status(400)
        .json({ message: "Nothing to update. Provide name and/or email." });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: updates,
      select: { id: true, name: true, email: true, role: true },
    });

    res.json({ user: updated });
  } catch (err) {
    console.error("PATCH /api/me error:", err);
    if (err.code === "P2002") {
      return res
        .status(400)
        .json({ message: "That email is already in use." });
    }
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// ---------- PROJECTS ----------
app.get("/api/projects", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const projects = await prisma.project.findMany({
      where: isAdmin ? {} : { ownerId: userId },
      orderBy: { updatedAt: "desc" },
    });

    const mapped = projects.map((p) => {
      const { status, phase } = mapProjectStatus(p.status);
      return {
        id: p.id,
        name: p.name,
        status,
        phase,
        updated: formatShortDate(p.updatedAt) || "Recently",
      };
    });

    res.json({ projects: mapped });
  } catch (err) {
    console.error("GET /api/projects error:", err);
    res.status(500).json({ message: "Failed to load projects" });
  }
});

// ---------- MESSAGES ----------
app.get("/api/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const messages = await prisma.message.findMany({
      where: isAdmin ? {} : { userId },
      include: { project: true },
      orderBy: { createdAt: "desc" },
    });

    const mapped = messages.map((m) => mapMessage(m));

    res.json({ messages: mapped });
  } catch (err) {
    console.error("GET /api/messages error:", err);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

app.post("/api/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { subject, body, projectId } = req.body || {};

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return res.status(400).json({ message: "Subject is required" });
    }
    if (!body || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({ message: "Message body is required" });
    }

    let project = null;

    if (projectId != null) {
      const projectIdNum = Number(projectId);
      if (!Number.isNaN(projectIdNum)) {
        const where =
          role === "admin"
            ? { id: projectIdNum }
            : { id: projectIdNum, ownerId: userId };

        project = await prisma.project.findFirst({ where });

        if (!project) {
          return res
            .status(400)
            .json({ message: "Project not found or not accessible" });
        }
      }
    }

    // Store subject + body together in `body`
    const combinedBody = `${subject.trim()}\n\n${body.trim()}`;

    const created = await prisma.message.create({
      data: {
        body: combinedBody,
        fromRole: "client",
        userId,
        ...(project ? { projectId: project.id } : {}),
      },
      include: { project: true },
    });

    // Fire-and-forget timeline entry
    const timelineData = {
      label: `Message sent: ${subject.trim()}`,
      type: "support",
      user: { connect: { id: userId } },
    };

    if (created.projectId) {
      timelineData.project = { connect: { id: created.projectId } };
    }

    prisma.timelineEvent
      .create({ data: timelineData })
      .catch((err) =>
        console.error("Failed to create timeline event for message:", err)
      );

    const mapped = mapMessage(created);

    res.status(201).json({ message: mapped });
  } catch (err) {
    console.error("POST /api/messages error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

// ---------- FILES ----------
app.get("/api/files", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const files = await prisma.file.findMany({
      where: isAdmin ? {} : { userId },
      include: { project: true },
      orderBy: { uploadedAt: "desc" },
    });

    const mapped = files.map((f) => ({
      id: f.id,
      name: f.filename,
      project: f.project ? f.project.name : "General",
      type: f.type,
      size: f.sizeBytes,
      uploaded: formatShortDate(f.uploadedAt) || "Recently",
      url: f.url,
    }));

    res.json({ files: mapped });
  } catch (err) {
    console.error("GET /api/files error:", err);
    res.status(500).json({ message: "Failed to load files" });
  }
});

// ---------- SUPPORT TICKETS ----------
app.get("/api/support-tickets", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const tickets = await prisma.supportTicket.findMany({
      where: isAdmin ? {} : { userId },
      include: { project: true },
      orderBy: { createdAt: "desc" },
    });

    const mapped = tickets.map((t) => mapSupportTicket(t));

    res.json({ tickets: mapped });
  } catch (err) {
    console.error("GET /api/support-tickets error:", err);
    res.status(500).json({ message: "Failed to load support tickets" });
  }
});

app.post("/api/support-tickets", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";
    const { subject, projectId } = req.body || {};

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return res.status(400).json({ message: "Subject is required" });
    }

    let project = null;

    if (projectId != null) {
      const projectIdNum = Number(projectId);
      if (!Number.isNaN(projectIdNum)) {
        const where = isAdmin
          ? { id: projectIdNum }
          : { id: projectIdNum, ownerId: userId };

        project = await prisma.project.findFirst({ where });

        if (!project) {
          return res
            .status(400)
            .json({ message: "Project not accessible" });
        }
      }
    }

    const createdTicket = await prisma.supportTicket.create({
      data: {
        subject: subject.trim(),
        status: "open",
        user: { connect: { id: userId } },
        ...(project
          ? {
              project: { connect: { id: project.id } },
            }
          : {}),
      },
      include: { project: true },
    });

    const timelineData = {
      label: `Support ticket opened: ${subject.trim()}`,
      type: "support",
      user: { connect: { id: userId } },
    };

    if (createdTicket.projectId) {
      timelineData.project = { connect: { id: createdTicket.projectId } };
    }

    prisma.timelineEvent
      .create({ data: timelineData })
      .catch((err) =>
        console.error(
          "Failed to create timeline event for support ticket:",
          err
        )
      );

    const mapped = mapSupportTicket(createdTicket);

    res.status(201).json({ ticket: mapped });
  } catch (err) {
    console.error("POST /api/support-tickets error:", err);
    res.status(500).json({ message: "Failed to create support ticket" });
  }
});

// ---------- INVOICES ----------
app.get("/api/invoices", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const invoices = await prisma.invoice.findMany({
      where: isAdmin ? {} : { userId },
      include: { project: true },
      orderBy: { createdAt: "desc" },
    });

    const mapped = invoices.map((inv) => mapInvoice(inv));

    res.json({ invoices: mapped });
  } catch (err) {
    console.error("GET /api/invoices error:", err);
    res.status(500).json({ message: "Failed to load invoices" });
  }
});

// PATCH invoice status
app.patch("/api/invoices/:id/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";
    const invoiceId = Number(req.params.id);
    const { status } = req.body || {};

    if (Number.isNaN(invoiceId)) {
      return res.status(400).json({ message: "Invalid invoice id" });
    }

    const allowedStatuses = ["unpaid", "paid", "overdue"];
    if (!allowedStatuses.includes(status)) {
      return res
        .status(400)
        .json({ message: "Status must be unpaid, paid or overdue" });
    }

    const invoice = await prisma.invoice.findFirst({
      where: isAdmin ? { id: invoiceId } : { id: invoiceId, userId },
      include: { project: true },
    });

    if (!invoice) {
      return res
        .status(404)
        .json({ message: "Invoice not found or not accessible" });
    }

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status },
      include: { project: true },
    });

    const invoiceLabel = `INV-${String(updated.id).padStart(3, "0")}`;
    let actionLabel = "";
    if (status === "paid") {
      actionLabel = "marked as paid";
    } else if (status === "overdue") {
      actionLabel = "marked as overdue";
    } else {
      actionLabel = "updated";
    }

    const timelineData = {
      label: `Invoice ${invoiceLabel} ${actionLabel}`,
      type: "billing",
      user: { connect: { id: userId } },
    };

    if (updated.projectId) {
      timelineData.project = { connect: { id: updated.projectId } };
    }

    prisma.timelineEvent
      .create({ data: timelineData })
      .catch((err) =>
        console.error("Failed to create timeline event for invoice:", err)
      );

    const mapped = mapInvoice(updated);
    res.json({ invoice: mapped });
  } catch (err) {
    console.error("PATCH /api/invoices/:id/status error:", err);
    res.status(500).json({ message: "Failed to update invoice status" });
  }
});

// ---------- TIMELINE ----------
app.get("/api/timeline", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "admin";

    const events = await prisma.timelineEvent.findMany({
      where: isAdmin ? {} : { userId },
      include: { project: true },
      orderBy: { createdAt: "desc" },
    });

    const mapped = events.map((e) => ({
      id: e.id,
      type: e.type || "project", // "project" | "billing" | "support"
      label: e.label,
      project: e.project ? e.project.name : "General",
      date: formatShortDate(e.createdAt) || "Recently",
      relatedId: null,
    }));

    res.json({ events: mapped });
  } catch (err) {
    console.error("GET /api/timeline error:", err);
    res.status(500).json({ message: "Failed to load timeline" });
  }
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`BrightFoundry API listening on http://localhost:${PORT}`);
});
