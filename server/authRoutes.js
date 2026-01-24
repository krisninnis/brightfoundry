const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("./prismaClient"); // 👈 use shared client

const router = express.Router();
// Back-compat: accept either env var name
const ALLOW_PUBLIC_REGISTER =
  process.env.ALLOW_PUBLIC_REGISTER === "true" ||
  process.env.ALLOW_REGISTRATION === "true";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  // Pragmatic (not perfect) email validation: good enough for auth.
  // Refuse obvious garbage; avoid heavy regexes.
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clampString(v, maxLen) {
  const s = String(v || "").trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

// Helper to create JWT
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    if (!ALLOW_PUBLIC_REGISTER) {
      return res.status(403).json({ message: "Registration is invite-only." });
    }

    const { name, email, password } = req.body || {};

    const safeName = clampString(name, 100);
    const safeEmail = normalizeEmail(email);
    const pw = typeof password === "string" ? password : "";

    if (!safeName || !safeEmail || !pw) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    if (!isValidEmail(safeEmail)) {
      return res.status(400).json({ message: "Invalid email" });
    }

    // Minimal password policy (production-friendly, still lightweight)
    if (pw.length < 12 || pw.length > 200) {
      return res
        .status(400)
        .json({ message: "Password must be at least 12 characters" });
    }

    const existing = await prisma.user.findUnique({ where: { email: safeEmail } });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: safeName,
        email: safeEmail,
        password: hashed,
        role: "client",
      },
    });

    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const safeEmail = normalizeEmail(email);
    const pw = typeof password === "string" ? password : "";

    if (!safeEmail || !pw) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (!isValidEmail(safeEmail)) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Prefer normalized email. (Fallback kept for older rows that may not be normalized.)
    let user = await prisma.user.findUnique({ where: { email: safeEmail } });
    if (!user && typeof email === "string" && email.trim() !== safeEmail) {
      user = await prisma.user.findUnique({ where: { email: email.trim() } });
    }
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(pw, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (!token || scheme !== "Bearer") {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    const id = Number(payload?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    res.json({ user });
  } catch (err) {
    console.error("Me error:", err);
    res.status(401).json({ message: "Invalid or expired token" });
  }
});

module.exports = router;
