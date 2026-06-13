/**
 * scripts/suppress.js
 * Manage the outreach suppression list.
 *
 * Suppressed email addresses are never included in draft generation
 * or CSV exports. This is the v1 opt-out mechanism.
 *
 * Usage:
 *   # Add an email to the suppression list
 *   node scripts/suppress.js --email someone@example.com --reason "asked not to be contacted"
 *   npm run suppress -- --email someone@example.com
 *
 *   # List all suppressed emails
 *   node scripts/suppress.js --list
 *   npm run suppress -- --list
 *
 *   # Remove an email (only for corrections / accidental additions)
 *   node scripts/suppress.js --remove someone@example.com
 */

"use strict";

const {
  suppress,
  unsuppress,
  listSuppressed,
  markProspectSuppressed,
} = require("../lib/suppression");

const { isBadEmail, normaliseEmail } = require("../lib/email-validator");

// ─────────────────────────────────────────────────────────────────────────────
// Parse args
// ─────────────────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);

const listFlag   = args.includes("--list");
const emailIdx   = args.indexOf("--email");
const removeIdx  = args.indexOf("--remove");
const reasonIdx  = args.indexOf("--reason");

const emailArg  = emailIdx  !== -1 ? args[emailIdx  + 1] : null;
const removeArg = removeIdx !== -1 ? args[removeIdx + 1] : null;
const reasonArg = reasonIdx !== -1 ? args[reasonIdx + 1] : "manual";

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

if (listFlag) {
  console.log("Claw Labs Prospecting — Suppression List");
  console.log("─".repeat(48));
  const rows = listSuppressed();
  if (rows.length === 0) {
    console.log("Suppression list is empty.");
  } else {
    console.log(`${rows.length} suppressed email(s):\n`);
    for (const r of rows) {
      console.log(`  ${r.email}`);
      console.log(`    Reason:  ${r.reason}`);
      console.log(`    Added:   ${r.added_at}`);
    }
  }
  process.exit(0);
}

if (removeArg) {
  const email = normaliseEmail(removeArg);
  console.log(`Removing "${email}" from suppression list...`);
  const removed = unsuppress(email);
  if (removed) {
    console.log(`✓ Removed. Note: the matching prospect record's status has NOT been changed.`);
    console.log(`  You will need to manually update it in the database if needed.`);
  } else {
    console.log(`  Email was not in the suppression list.`);
  }
  process.exit(0);
}

if (emailArg) {
  const email = normaliseEmail(emailArg);

  if (isBadEmail(email)) {
    console.error(`✗ "${email}" does not look like a valid email address.`);
    process.exit(1);
  }

  console.log(`Adding "${email}" to suppression list...`);
  const result = suppress(email, String(reasonArg).slice(0, 200));

  if (result.added) {
    console.log(`✓ Suppressed: ${email}`);
    // Also mark matching prospect records
    markProspectSuppressed(email);
    console.log(`  Any matching prospect records have been marked as 'suppressed'.`);
  } else {
    console.log(`  Already suppressed: ${email}`);
  }
  process.exit(0);
}

// No valid command
console.log("Claw Labs Prospecting — Suppression List Manager");
console.log("─".repeat(48));
console.log("Usage:");
console.log("  --email <address>              Add email to suppression list");
console.log("  --email <address> --reason <r> Add with a custom reason");
console.log("  --list                         Show all suppressed emails");
console.log("  --remove <address>             Remove email (corrections only)");
console.log("\nExamples:");
console.log('  npm run suppress -- --email contact@example.com');
console.log('  npm run suppress -- --email contact@example.com --reason "Replied asking to be removed"');
console.log('  npm run suppress -- --list');
