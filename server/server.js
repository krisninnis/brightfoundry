// server/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const prisma = require("./prismaClient");
const authRoutes = require("./authRoutes");
const { authenticateToken } = require("./authMiddleware");

const app = express();

const PORT = Number(process.env.PORT) || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

/* ------------------------------------------------------------------ */
/* 🔐 Startup security checks                                          */
/* ------------------------------------------------------------------ */

function isStrongJwtSecret(secret) {
  const s = String(secret || "");
  if (s.length < 32) return false;
  const lowered = s.toLowerCase();
  if (lowered.includes("dev")) return false;
  if (lowered.includes("change")) return false;
  if (lowered.includes("password")) return false;
  if (/^([a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{48})$/i.test(s)) return false; // too short hex
  return true;
}

// Fail fast in prod if JWT_SECRET is missing/weak
if (IS_PROD && !isStrongJwtSecret(process.env.JWT_SECRET)) {
  throw new Error(
    "Security error: JWT_SECRET must be a strong random value (>=32 chars) in production."
  );
}

/* ------------------------------------------------------------------ */
/* 🔧 Express baseline                                                 */
/* ------------------------------------------------------------------ */

app.disable("x-powered-by");

// If behind reverse proxy (Render/Fly/NGINX/Cloudflare), enable this in prod.
// Locally keep it off unless you explicitly set TRUST_PROXY=true.
if (IS_PROD || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

// Basic request id (helps debugging without leaking details to users)
app.use((req, res, next) => {
  const rid = req.headers["x-request-id"] || crypto.randomUUID();
  req.requestId = String(rid);
  res.setHeader("x-request-id", req.requestId);
  next();
});

// IMPORTANT: parse JSON BEFORE registering routes that read req.body
app.use(
  express.json({
    limit: "100kb",
    strict: true,
    type: ["application/json", "application/*+json"],
  })
);

/* ------------------------------------------------------------------ */
/* 🛡️ Security headers                                                 */
/* ------------------------------------------------------------------ */

app.use(
  helmet({
    // ✅ API returns JSON; CSP should be enforced by the static site / portal HTML, not the API.
    // This also removes Helmet's default CSP which currently includes 'unsafe-inline' for styles.
    contentSecurityPolicy: false,

    // ✅ Don't emit HSTS in dev (it can cause confusing local caching behavior)
    hsts: IS_PROD,
  })
);

/* ------------------------------------------------------------------ */
/* 🌍 CORS (fail-closed in production; explicit allowlist in dev)      */
/* ------------------------------------------------------------------ */

const rawOrigins = String(
  process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS || ""
).trim();

const configuredOrigins = rawOrigins
  ? rawOrigins
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

// Explicit dev allowlist when env is not set (prevents "allow all" footgun)
const DEV_DEFAULT_ORIGINS = [
  "http://127.0.0.1:5055",
  "http://localhost:5055",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
];

const allowedOrigins = IS_PROD
  ? configuredOrigins
  : configuredOrigins.length
  ? configuredOrigins
  : DEV_DEFAULT_ORIGINS;

if (IS_PROD && allowedOrigins.length === 0) {
  throw new Error(
    "Security error: ALLOWED_ORIGINS / CORS_ORIGINS must be set in production."
  );
}

const corsOptions = {
  origin(origin, cb) {
    // No Origin header: same-origin navigation, server-to-server, curl
    if (!origin) return cb(null, true);

    // IMPORTANT: echo the origin string back when allowed
    if (allowedOrigins.includes(origin)) return cb(null, origin);

    // Explicitly disallow others (no throw, no spam)
    return cb(null, false);
  },
  credentials: false,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600,
  optionsSuccessStatus: 204,
};

// Apply CORS to all requests
app.use(cors(corsOptions));

// Explicitly handle ALL preflights (prevents “No Access-Control-Allow-Origin” on OPTIONS)
app.options("*", cors(corsOptions));

/* ------------------------------------------------------------------ */
/* 🚦 Rate limiting                                                    */
/* ------------------------------------------------------------------ */

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many auth attempts" },
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);

/* ------------------------------------------------------------------ */
/* 🩺 Health checks                                                    */
/* ------------------------------------------------------------------ */

app.get("/health", (_, res) => res.json({ ok: true }));
app.get("/api/health", (_, res) => res.json({ ok: true }));

/* ------------------------------------------------------------------ */
/* 🧰 Helpers                                                          */
/* ------------------------------------------------------------------ */

function clampString(v, maxLen) {
  const s = String(v ?? "").trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeLogError(context, err, req) {
  const payload = {
    context,
    requestId: req?.requestId,
    message: err?.message || String(err),
    code: err?.code,
  };
  if (!IS_PROD) payload.stack = err?.stack;
  console.error(payload);
}

// Best-effort timeline helper (never breaks main flow)
async function createTimelineEvent({ userId, type, label, projectId = null }) {
  try {
    await prisma.timelineEvent.create({
      data: {
        userId,
        type,
        label,
        projectId: projectId ? Number(projectId) : null,
      },
    });
  } catch {
    // ignore (best-effort)
  }
}

/* ------------------------------------------------------------------ */
/* 🔐 Auth routes                                                      */
/* ------------------------------------------------------------------ */

app.use("/api/auth", authRoutes);

/* ------------------------------------------------------------------ */
/* 👤 Current user                                                     */
/* ------------------------------------------------------------------ */

app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!user) return res.status(401).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    safeLogError("GET /api/me", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

app.patch("/api/me", authenticateToken, async (req, res) => {
  try {
    const name = clampString(req.body?.name, 100);
    const email = clampString(req.body?.email, 254).toLowerCase();

    const data = {};
    if (name) data.name = name;

    if (email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ message: "Invalid email" });
      }
      data.email = email;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    res.json({ user: updated });
  } catch (err) {
    safeLogError("PATCH /api/me", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* 📦 Projects                                                         */
/* ------------------------------------------------------------------ */

app.get("/api/projects", authenticateToken, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { ownerId: req.userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, status: true, updatedAt: true },
    });

    res.json({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        updated: p.updatedAt
          ? new Date(p.updatedAt).toLocaleDateString("en-GB")
          : "",
      })),
    });
  } catch (err) {
    safeLogError("GET /api/projects", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* 📨 Messages                                                         */
/* ------------------------------------------------------------------ */

app.get("/api/messages", authenticateToken, async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true } } },
    });

    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        project: m.project?.name || "General",
        fromRole: m.fromRole,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    safeLogError("GET /api/messages", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/messages", authenticateToken, async (req, res) => {
  try {
    const subject = clampString(req.body?.subject, 120);
    const body = clampString(req.body?.body, 5000);

    if (!subject || !body) {
      return res.status(400).json({ message: "Subject and body required" });
    }

    // Optional: accept projectId, but verify it belongs to this user
    let projectIdValue = null;
    if (req.body?.projectId !== undefined && req.body?.projectId !== null) {
      const raw = String(req.body.projectId).trim();
      if (raw) {
        const pid = Number(raw);
        if (!Number.isInteger(pid) || pid <= 0) {
          return res.status(400).json({ message: "Invalid project id" });
        }
        const p = await prisma.project.findFirst({
          where: { id: pid, ownerId: req.userId },
          select: { id: true },
        });
        projectIdValue = p ? p.id : null;
      }
    }

    const created = await prisma.message.create({
      data: {
        userId: req.userId,
        projectId: projectIdValue,
        body: `${subject}\n\n${body}`,
        // Never trust client role claims
        fromRole: "client",
      },
    });

    await createTimelineEvent({
      userId: req.userId,
      type: "support",
      label: `Message sent: ${subject}`,
      projectId: projectIdValue,
    });

    res.json({ message: created });
  } catch (err) {
    safeLogError("POST /api/messages", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* 📄 Invoices (admin-verified update)                                 */
/* ------------------------------------------------------------------ */

app.patch("/api/invoices/:id/status", authenticateToken, async (req, res) => {
  try {
    const id = Number(String(req.params.id).replace(/^INV-/i, ""));
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid invoice id" });
    }

    const me = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });

    if (me?.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const next = String(req.body?.status || "").toLowerCase();
    const allowed = new Set(["pending", "unpaid", "paid", "overdue"]);
    if (!allowed.has(next)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: next },
    });

    res.json({ success: true, invoice: updated });
  } catch (err) {
    safeLogError("PATCH /api/invoices/:id/status", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* 🧾 Invoices (user list)                                             */
/* ------------------------------------------------------------------ */

app.get("/api/invoices", authenticateToken, async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true } } },
    });

    res.json({
      invoices: invoices.map((inv) => ({
        id: `INV-${inv.id}`,
        project: inv.project?.name || "General",
        amountValue: inv.amount,
        amount: `£${Number(inv.amount || 0).toFixed(2)}`,
        when: inv.dueDate
          ? new Date(inv.dueDate).toLocaleDateString("en-GB")
          : new Date(inv.createdAt).toLocaleDateString("en-GB"),
        status: inv.status, // unpaid/paid/overdue/pending
      })),
    });
  } catch (err) {
    safeLogError("GET /api/invoices", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* 📁 Files                                                            */
/* ------------------------------------------------------------------ */

app.get("/api/files", authenticateToken, async (req, res) => {
  try {
    const files = await prisma.file.findMany({
      where: { userId: req.userId },
      orderBy: { uploadedAt: "desc" },
      include: { project: { select: { name: true } } },
    });

    res.json({
      files: files.map((f) => ({
        id: f.id,
        filename: f.filename,
        name: f.filename,
        type: f.type || "",
        project: f.project?.name || "General",
        uploaded: f.uploadedAt
          ? new Date(f.uploadedAt).toLocaleDateString("en-GB")
          : "",
        url: f.url,
      })),
    });
  } catch (err) {
    safeLogError("GET /api/files", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* 🎫 Support tickets                                                  */
/* ------------------------------------------------------------------ */

app.get("/api/support-tickets", authenticateToken, async (req, res) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true } } },
    });

    res.json({
      tickets: tickets.map((t) => ({
        id: `TKT-${t.id}`,
        subject: t.subject,
        status: t.status, // open/closed
        project: t.project?.name || "General",
        updated: t.createdAt
          ? new Date(t.createdAt).toLocaleDateString("en-GB")
          : "",
      })),
    });
  } catch (err) {
    safeLogError("GET /api/support-tickets", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/support-tickets", authenticateToken, async (req, res) => {
  try {
    // Robust subject read (no helper ambiguity)
    const rawSubject =
      req.body && Object.prototype.hasOwnProperty.call(req.body, "subject")
        ? req.body.subject
        : "";

    const subject = String(rawSubject ?? "").trim().slice(0, 200);
    if (!subject) return res.status(400).json({ message: "Subject is required" });

    // Optional projectId — must belong to the user
    let projectIdValue = null;
    if (req.body?.projectId !== undefined && req.body?.projectId !== null) {
      const raw = String(req.body.projectId).trim();
      if (raw) {
        const pid = Number(raw);
        if (!Number.isInteger(pid) || pid <= 0) {
          return res.status(400).json({ message: "Invalid project id" });
        }
        const p = await prisma.project.findFirst({
          where: { id: pid, ownerId: req.userId },
          select: { id: true },
        });
        projectIdValue = p ? p.id : null;
      }
    }

    const created = await prisma.supportTicket.create({
      data: {
        userId: req.userId,
        subject,
        status: "open",
        projectId: projectIdValue,
      },
    });

    await createTimelineEvent({
      userId: req.userId,
      type: "support",
      label: `Ticket created: ${subject}`,
      projectId: projectIdValue,
    });

    res.json({
      ticket: {
        id: `TKT-${created.id}`,
        subject: created.subject,
        status: created.status,
        project: projectIdValue ? "Project" : "General",
        updated: new Date(created.createdAt).toLocaleDateString("en-GB"),
      },
    });
  } catch (err) {
    safeLogError("POST /api/support-tickets", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* 🗓️ Timeline                                                         */
/* ------------------------------------------------------------------ */

app.get("/api/timeline", authenticateToken, async (req, res) => {
  try {
    const events = await prisma.timelineEvent.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true } } },
    });

    res.json({
      events: events.map((e) => ({
        id: e.id,
        type: ["project", "billing", "support"].includes(String(e.type))
          ? String(e.type)
          : "project",
        label: e.label,
        project: e.project?.name || "General",
        date: e.createdAt
          ? new Date(e.createdAt).toLocaleDateString("en-GB")
          : "",
      })),
    });
  } catch (err) {
    safeLogError("GET /api/timeline", err, req);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* 🧯 404 + error handler                                               */
/* ------------------------------------------------------------------ */

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  safeLogError("Unhandled error", err, req);
  res.status(500).json({ message: "Server error" });
});

/* ------------------------------------------------------------------ */
/* 🚀 Start server + graceful shutdown                                  */
/* ------------------------------------------------------------------ */

const server = app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT} (${NODE_ENV})`);
});

async function shutdown(signal) {
  try {
    console.log(`${signal} received, shutting down...`);
    server.close(() => {
      // stop accepting new connections
    });
    await prisma.$disconnect();
  } catch (e) {
    // ignore
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  console.error({
    context: "unhandledRejection",
    message: err?.message,
    stack: err?.stack,
  });
});
process.on("uncaughtException", (err) => {
  console.error({
    context: "uncaughtException",
    message: err?.message,
    stack: err?.stack,
  });
  process.exit(1);
});
