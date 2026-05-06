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
// - Refuses weak passwords
// - Creates/updates ONE admin user (minimum needed to launch)

require("dotenv").config();

const bcrypt = require("bcryptjs");
const prisma = require("../prismaClient");

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing required env var: ${name}`);
  return String(v).trim();
}

function assertStrongPassword(pw, name) {
  if (pw.length < 12) throw new Error(`${name} must be at least 12 characters`);
  if (!/[a-z]/.test(pw)) throw new Error(`${name} must include a lowercase letter`);
  if (!/[A-Z]/.test(pw)) throw new Error(`${name} must include an uppercase letter`);
  if (!/[0-9]/.test(pw)) throw new Error(`${name} must include a number`);
}

async function main() {
  const allow = String(process.env.SEED_ALLOW || "").toLowerCase() === "true";
  if (!allow) {
    console.log("⚠️  Seeding skipped (set SEED_ALLOW=true to enable).");
    return;
  }

  const email = mustGetEnv("SEED_ADMIN_EMAIL").toLowerCase();
  const password = mustGetEnv("SEED_ADMIN_PASSWORD");

  assertStrongPassword(password, "SEED_ADMIN_PASSWORD");

  const name = String(process.env.SEED_ADMIN_NAME || "BrightFoundry Admin").slice(0, 100);

  const hash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { name, password: hash, role: "admin" },
    create: { name, email, password: hash, role: "admin" },
    select: { id: true },
  });

  console.log("✅ Seed complete (admin ensured).");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {}
  });
