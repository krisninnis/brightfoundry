/**
 * scripts/init-db.js
 * Initialises (or migrates) the local SQLite database.
 * Safe to run multiple times — all statements use IF NOT EXISTS.
 *
 * Usage:
 *   node scripts/init-db.js
 *   npm run init
 */

"use strict";

const { getDb } = require("../lib/db");

console.log("BrightFoundry Prospecting — Database Init");
console.log("─".repeat(48));

try {
  const db = getDb();

  // Verify tables exist
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
    .all()
    .map(r => r.name);

  console.log(`✓ Database ready`);
  console.log(`✓ Tables: ${tables.join(", ")}`);

  const prospectCount = db.prepare("SELECT COUNT(*) as n FROM prospects").get().n;
  const suppressCount = db.prepare("SELECT COUNT(*) as n FROM suppressions").get().n;

  console.log(`\nCurrent data:`);
  console.log(`  Prospects:   ${prospectCount}`);
  console.log(`  Suppressed:  ${suppressCount}`);
  console.log(`\nDatabase location: ${process.env.DB_PATH || "./data/prospects.db"}`);
  console.log("\nReady. Run 'npm run scrape' or 'npm run import' to add prospects.");

} catch (err) {
  console.error("✗ Init failed:", err.message);
  process.exit(1);
}
