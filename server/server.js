// server/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const prisma = require("./prismaClient");
const authRoutes = require("./authRoutes");
const { authenticateToken } = require("./authMiddleware");

const app = express();
const PORT = process.env.PORT || 4000;

// --- Security baseline ---
app.disable("x-powered-by");

const IS_PROD = process.env.NODE_ENV === "production";

// If you are behind a reverse proxy in staging/production, set TRUST_PROXY=true.
if (IS_PROD || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

function isStrongJwtSecret(secret) {
  const s = String(secret || "");
  if (s.length < 32) return false;
  const lowered = s.toLowerCase();
  if (lowered.includes("dev-secret")) return false;
  if (lowered.includes("change-me")) return false;
  if (lowered.includes("password")) return false;
  return true;
}

function clampString(v, maxLen) {
  const s = String(v ?? "").trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function logError(context, err) {
  const safe = {
    message: err?.message || String(err),
    code: err?.code,
    meta: err?.meta,
  };
  if (!IS_PROD) {
    // Helpful in dev
    safe.stack = err?.stack;
  }
  console.error(context, safe);
}

const rawOrigins = String(process.env.CORS_ORIGINS || "").trim();
const allowedOrigins = rawOrigins
  ? rawOrigins
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

// In production you should set CORS_ORIGINS to your real domains.
// In dev we allow all for convenience.
app.use(
  cors({
    origin: (origin, cb) => {
      if (!IS_PROD) return cb(null, true);
      if (!origin) return cb(null, true); // allow same-origin / server-to-server
      if (allowedOrigins && allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"), false);
    },
    credentials: false,
  })
);

app.use(
  helmet({
    // keep defaults; minimal / safe baseline
  })
);

// Rate limit: general API
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300, // generous for dev; adjust later
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Rate limit: auth endpoints (brute-force protection)
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Enforce a real JWT secret in production
if (IS_PROD && !isStrongJwtSecret(process.env.JWT_SECRET)) {
  throw new Error(
    "JWT_SECRET must be set to a strong random value (>= 32 chars) in production."
  );
}

// Middleware
app.use(
  express.json({
    limit: "100kb",
    strict: true,
  })
);

// Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Timeline helper (best-effort; never breaks main flow)
// IMPORTANT: only write fields that exist in Prisma (no projectName here)
async function createTimelineEvent({
  userId,
  type,
  label,
  projectId = null,
}) {
  try {
    await prisma.timelineEvent.create({
      data: {
        userId,
        type,
        label,
        projectId: projectId ? Number(projectId) : null,
      },
    });
  } catch (err) {
    // Do not break main flow if timeline insert fails
    console.warn("Timeline insert failed:", err?.message || err);
  }
}

// Auth routes
app.use("/api/auth", authRoutes);

// ✅ Portal: current user
app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!user) return res.status(401).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error("GET /api/me error:", err);
    return res.status(500).json({ message: "Failed to fetch user" });
  }
});

// ✅ Portal: update profile (used by settings page)
app.patch("/api/me", authenticateToken, async (req, res) => {
  try {
    const name = clampString(req.body?.name, 100);
    const email = clampString(req.body?.email, 254).toLowerCase();

    const data = {};
    if (name) data.name = name;
    if (email) data.email = email;

    if (!Object.keys(data).length) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    if (data.email && !isValidEmail(data.email)) {
      return res.status(400).json({ message: "Invalid email" });
    }

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    res.json({ user: updated });
  } catch (err) {
    console.error("PATCH /api/me error:", err);
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

// ---- API: PROJECTS ----
function projectPhaseFromStatus(status) {
  const s = String(status || "").toLowerCase();
  if (["planning"].includes(s)) return "Planning";
  if (["design"].includes(s)) return "Design";
  if (["build", "development", "dev"].includes(s)) return "Build";
  if (["testing", "qa"].includes(s)) return "Testing";
  if (["complete", "completed", "done"].includes(s)) return "Delivery";
  return "In progress";
}

function projectStatusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (["complete", "completed", "done"].includes(s)) return "Completed";
  return "Active";
}

app.get("/api/projects", authenticateToken, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { ownerId: req.userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, status: true, updatedAt: true },
    });

    const shaped = projects.map((p) => ({
      id: p.id,
      name: p.name,
      phase: projectPhaseFromStatus(p.status),
      status: projectStatusLabel(p.status),
      updated: p.updatedAt
        ? new Date(p.updatedAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "",
    }));

    res.json({ projects: shaped });
  } catch (err) {
    console.error("GET /api/projects FULL error:", err);
    console.error("GET /api/projects message:", err?.message);
    console.error("GET /api/projects meta:", err?.meta);
    res.status(500).json({ message: "Failed to fetch projects" });
  }
});

// ---- API: MESSAGES ----
// Prisma says Message has createdAt (not updatedAt), and requires fromRole.
app.get("/api/messages", authenticateToken, async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
      },
    });

    const shaped = messages.map((m) => {
      const body = m.body || "";
      // If you previously had "subject" in UI, we can derive a lightweight one:
      // first line up to 60 chars.
      const derivedSubject = body.split("\n")[0].slice(0, 60) || "Message";

      return {
        id: m.id,
        subject: derivedSubject,
        preview: body.slice(0, 90) + (body.length > 90 ? "…" : ""),
        body,
        projectId: m.projectId || null,
        project: m.project?.name || "General",
        updated: m.createdAt
          ? new Date(m.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "",
        fromRole: m.fromRole || "",
      };
    });

    res.json({ messages: shaped });
  } catch (err) {
    console.error("GET /api/messages error:", err);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

app.post("/api/messages", authenticateToken, async (req, res) => {
  try {
    const { subject, body, projectId } = req.body || {};

    // Keep your API contract (subject + body), but store as a single Message.body
    const subj = clampString(subject, 120);
    const msg = clampString(body, 5000);

    if (!subj) return res.status(400).json({ message: "Subject is required" });
    if (!msg) return res.status(400).json({ message: "Message body is required" });

    // Validate projectId belongs to this user if provided
    let projectIdValue = null;
    if (projectId !== undefined && projectId !== null && String(projectId).trim() !== "") {
      const pid = Number(projectId);
      if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ message: "Invalid project id" });
      }
      const p = await prisma.project.findFirst({
        where: { id: pid, ownerId: req.userId },
        select: { id: true },
      });
      projectIdValue = p ? p.id : null;
    }

    const storedBody = `${subj}\n\n${msg}`;

    const created = await prisma.message.create({
      data: {
        userId: req.userId,
        projectId: projectIdValue,
        body: storedBody,
        // Never trust client-side role claims for write attribution.
        fromRole: "client",
      },
      include: {
        project: { select: { name: true } },
      },
    });

    await createTimelineEvent({
      userId: req.userId,
      type: "support",
      label: `Support message sent: ${subj}`,
      projectId: created.projectId,
    });

    res.json({
      message: {
        id: created.id,
        subject: subj,
        preview:
          created.body.slice(0, 90) + (created.body.length > 90 ? "…" : ""),
        body: created.body,
        projectId: created.projectId,
        project: created.project?.name || "General",
        updated: new Date(created.createdAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        fromRole: created.fromRole,
      },
    });
  } catch (err) {
    console.error("POST /api/messages error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

// ---- API: FILES ----
app.get("/api/files", authenticateToken, async (req, res) => {
  try {
    const files = await prisma.file.findMany({
      where: { userId: req.userId },
      orderBy: { uploadedAt: "desc" },
      include: {
        project: { select: { name: true } },
      },
    });

    const shaped = files.map((f) => ({
      id: f.id,
      name: f.filename,
      type: f.type || "",
      project: f.project?.name || "General",
      uploaded: f.uploadedAt
        ? new Date(f.uploadedAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "",
    }));

    res.json({ files: shaped });
  } catch (err) {
    console.error("GET /api/files error:", err);
    res.status(500).json({ message: "Failed to fetch files" });
  }
});

// ---- API: SUPPORT TICKETS ----
// Prisma says SupportTicket does NOT have projectName. Derive project display from relation.
app.get("/api/support-tickets", authenticateToken, async (req, res) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
      },
    });

    const shaped = tickets.map((t) => {
      const raw = String(t.status || "open").toLowerCase();
      const status = raw === "closed" ? "Closed" : "Open";
      return {
      id: `TCK-${t.id}`,
      subject: t.subject,
      project: t.project?.name || "General",
      status,
      updated: new Date(t.createdAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      };
    });

    res.json({ tickets: shaped });
  } catch (err) {
    console.error("GET /api/support-tickets error:", err);
    res.status(500).json({ message: "Failed to fetch tickets" });
  }
});

app.post("/api/support-tickets", authenticateToken, async (req, res) => {
  try {
    const { subject, projectId } = req.body || {};

    const safeSubject = clampString(subject, 200);
    if (!safeSubject) return res.status(400).json({ message: "Subject is required" });

    // Validate projectId belongs to user if provided
    let projectIdValue = null;
    if (projectId !== undefined && projectId !== null && String(projectId).trim() !== "") {
      const pid = Number(projectId);
      if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ message: "Invalid project id" });
      }
      const p = await prisma.project.findFirst({
        where: { id: pid, ownerId: req.userId },
        select: { id: true },
      });
      projectIdValue = p ? p.id : null;
    }

    const created = await prisma.supportTicket.create({
      data: {
        userId: req.userId,
        subject: safeSubject,
        status: "open",
        projectId: projectIdValue,
      },
      include: {
        project: { select: { name: true } },
      },
    });

    await createTimelineEvent({
      userId: req.userId,
      type: "support",
      label: `Support ticket created: ${created.subject}`,
      projectId: created.projectId,
    });

    res.json({
      ticket: {
        id: `TCK-${created.id}`,
        subject: created.subject,
        project: created.project?.name || "General",
        status: created.status === "closed" ? "Closed" : "Open",
        updated: new Date(created.createdAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
      },
    });
  } catch (err) {
    console.error("POST /api/support-tickets error:", err);
    res.status(500).json({ message: "Failed to create support ticket" });
  }
});

// ---- API: INVOICES ----
function labelInvoiceStatus(dbStatus) {
  const s = String(dbStatus || "").toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "overdue") return "Overdue";
  if (s === "pending" || s === "unpaid") return "Outstanding";
  return "Outstanding";
}

app.get("/api/invoices", authenticateToken, async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true } } },
    });

    const shaped = invoices.map((inv) => ({
      id: `INV-${inv.id}`,
      project: inv.project?.name || "General",
      amount: `£${Number(inv.amount || 0).toFixed(2)}`,
      when: inv.dueDate
        ? new Date(inv.dueDate).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "",
      status: labelInvoiceStatus(inv.status),
    }));

    res.json({ invoices: shaped });
  } catch (err) {
    console.error("GET /api/invoices error:", err);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});
app.patch("/api/invoices/:id/status", authenticateToken, async (req, res) => {
  try {
    // --- normalize invoice id ---
    const rawId = req.params.id;
    const id = Number(String(rawId).replace(/^INV-/i, ""));

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid invoice id" });
    }


    // --- admin role must come from DB ---
    const me = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });

    if (me?.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // --- validate status ---
    const allowed = new Set(["pending", "unpaid", "paid", "overdue"]);
    const next = String(req.body?.status || "").toLowerCase();
    if (!allowed.has(next)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const status = next;

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status },
    });

    res.json({ success: true, invoice: updated });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Invoice not found" });
    }
    console.error("PATCH /api/invoices/:id/status error:", err);
    res.status(500).json({ message: "Failed to update invoice" });
  }
});


// ---- API: TIMELINE ----
// Prisma says TimelineEvent does NOT have projectName. Derive from relation.
app.get("/api/timeline", authenticateToken, async (req, res) => {
  try {
    const events = await prisma.timelineEvent.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
      },
    });

    const shaped = events.map((e) => ({
      type: e.type || "project",
      label: e.label || "Update",
      project: e.project?.name || "General",
      date: e.createdAt
        ? new Date(e.createdAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "",
    }));

    res.json({ events: shaped });
  } catch (err) {
    console.error("GET /api/timeline error:", err);
    res.status(500).json({ message: "Failed to fetch timeline" });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
