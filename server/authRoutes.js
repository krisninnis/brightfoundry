// server/authRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("./prismaClient");

const router = express.Router();

const IS_PROD = process.env.NODE_ENV === "production";

// ✅ Registration is OFF by default in ALL environments.
// Enable only when you explicitly set: ALLOW_PUBLIC_REGISTER=true
const ALLOW_PUBLIC_REGISTER =
  String(process.env.ALLOW_PUBLIC_REGISTER || process.env.ALLOW_REGISTRATION || "")
    .toLowerCase() === "true";

// JWT config
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || "brightfoundry";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "brightfoundry-portal";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

// Only allow HMAC SHA-256 tokens
const ALLOWED_ALGS = ["HS256"];

function clampString(v, maxLen) {
  const s = String(v ?? "").trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertStrongPassword(pw) {
  const p = String(pw || "");
  if (p.length < 12) return "Password must be at least 12 characters";
  if (!/[a-z]/.test(p)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(p)) return "Password must include an uppercase letter";
  if (!/[0-9]/.test(p)) return "Password must include a number";
  return null;
}

function signAccessToken(user) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET missing");
  }

  // Keep payload minimal. Put user id in `sub`.
  return jwt.sign(
    { role: user.role },
    JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: String(user.id),
    }
  );
}

// Register route (for creating users)
router.post("/register", async (req, res) => {
  try {
    // ✅ HARD RULE: registration disabled unless explicitly enabled.
    if (!ALLOW_PUBLIC_REGISTER) {
      // In production this should almost always be disabled.
      return res.status(403).json({ message: "Registration disabled" });
    }

    const name = clampString(req.body?.name, 100);
    const email = clampString(req.body?.email, 254).toLowerCase();
    const password = String(req.body?.password || "");

    if (!name) return res.status(400).json({ message: "Name is required" });
    if (!isValidEmail(email)) return res.status(400).json({ message: "Valid email is required" });

    const pwErr = assertStrongPassword(password);
    if (pwErr) return res.status(400).json({ message: pwErr });

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "client",
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    const token = signAccessToken(newUser);

    return res.status(201).json({
      token,
      user: newUser,
    });
  } catch (err) {
    console.error("Register error:", err?.message || err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const email = clampString(req.body?.email, 254).toLowerCase();
    const password = String(req.body?.password || "");

    if (!isValidEmail(email)) return res.status(400).json({ message: "Valid email is required" });
    if (!password) return res.status(400).json({ message: "Password is required" });

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Compare password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Sign token (minimal claims)
    const token = signAccessToken(user);

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Login error:", err?.message || err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
