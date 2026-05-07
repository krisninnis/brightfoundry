// server/prisma/seed.js
// Safe, schema-aligned seed for BrightFoundry
// Usage:
//   set SEED_ALLOW=true
//   set SEED_ADMIN_EMAIL=you@domain.com
//   set SEED_ADMIN_PASSWORD=StrongPass1234!
//   node prisma/seed.js
//
// Notes:
// - Refuses to run unless SEED_ALLOW=true
// - Validates email format
// - Refuses weak passwords
// - bcrypt self-check before writing to DB
// - Explicit findUnique + update/create (avoids Prisma 6 upsert ambiguity)
// - Creates/updates ONE admin user (minimum needed to launch)

require("dotenv").config();

const bcrypt = require("bcryptjs");
const prisma = require("../prismaClient");

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error("Missing required env var: " + name);
  return String(v).trim();
}

// Mirror exactly: clampString(email, 254).toLowerCase() from authRoutes.js
function normalizeEmail(raw) {
  var s = String(raw == null ? "" : raw).trim();
  var clamped = s.length > 254 ? s.slice(0, 254) : s;
  return clamped.toLowerCase();
}

function assertStrongPassword(pw, name) {
  if (pw.length < 12) throw new Error(name + " must be at least 12 characters");
  if (!/[a-z]/.test(pw)) throw new Error(name + " must include a lowercase letter");
  if (!/[A-Z]/.test(pw)) throw new Error(name + " must include an uppercase letter");
  if (!/[0-9]/.test(pw)) throw new Error(name + " must include a number");
}

async function main() {
  var allow = String(process.env.SEED_ALLOW || "").trim().toLowerCase() === "true";
  if (!allow) {
    console.log("Seeding skipped (set SEED_ALLOW=true to enable).");
    return;
  }

  var rawEmail = mustGetEnv("SEED_ADMIN_EMAIL");
  var password = mustGetEnv("SEED_ADMIN_PASSWORD");
  var name = String(process.env.SEED_ADMIN_NAME || "BrightFoundry Admin").trim().slice(0, 100);

  var email = normalizeEmail(rawEmail);
  if (!email || !email.includes("@")) {
    throw new Error("SEED_ADMIN_EMAIL is not a valid email address");
  }

  assertStrongPassword(password, "SEED_ADMIN_PASSWORD");

  var hash = await bcrypt.hash(password, 12);

  // Verify hash round-trips correctly before writing to DB
  var selfCheck = await bcrypt.compare(password, hash);
  if (!selfCheck) throw new Error("bcrypt self-check failed -- hash did not verify");

  // Explicit find + update/create (avoids upsert ambiguity in Prisma 6)
  var existing = await prisma.user.findUnique({ where: { email: email } });
  if (existing) {
    var updated = await prisma.user.update({
      where: { email: email },
      data: { name: name, password: hash, role: "admin" },
      select: { id: true },
    });
    console.log("Admin user updated (id=" + updated.id + ", email=" + email + ").");
  } else {
    var created = await prisma.user.create({
      data: { name: name, email: email, password: hash, role: "admin" },
      select: { id: true },
    });
    console.log("Admin user created (id=" + created.id + ", email=" + email + ").");
  }

  console.log("Seed complete (admin ensured).");
}

main()
  .catch(function(e) {
    console.error("Seed error:", e && e.message ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async function() {
    try { await prisma.$disconnect(); } catch(ignore) {}
  });
