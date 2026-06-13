/**
 * scripts/generate-drafts.js
 * Generate outreach draft messages for all scored, actionable prospects.
 *
 * ── IMPORTANT ────────────────────────────────────────────────────────────────
 *  This script does NOT send any emails.
 *  It writes draft subjects and bodies to the database only.
 *  All drafts must be manually reviewed and approved before use.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Drafts are skipped if:
 *  - The prospect is classified as "Not Fit"
 *  - The prospect has no contact email
 *  - The email is on the suppression list
 *  - A draft has already been generated (use --regen to overwrite)
 *
 * Usage:
 *   node scripts/generate-drafts.js
 *   npm run drafts
 *
 * Flags:
 *   --regen   Regenerate drafts for all eligible prospects, even if they have one
 */

"use strict";

const { getDb }        = require("../lib/db");
const { chooseDraft }  = require("../lib/templates");
const { isSuppressed } = require("../lib/suppression");
const { isBadEmail }   = require("../lib/email-validator");

const args  = process.argv.slice(2);
const regen = args.includes("--regen");

function main() {
  const db = getDb();

  console.log("Claw Labs Prospecting — Generate Drafts");
  console.log("─".repeat(48));
  console.log("No emails will be sent. This writes drafts to the database only.\n");

  const baseQuery = regen
    ? `SELECT * FROM prospects WHERE status NOT IN ('suppressed', 'contacted') AND classification != 'Not Fit' AND classification != 'unclassified'`
    : `SELECT * FROM prospects WHERE status = 'scored' AND classification != 'Not Fit' AND classification != 'unclassified'`;

  const prospects = db.prepare(baseQuery).all();

  console.log(`Eligible prospects: ${prospects.length}${regen ? " (regenerating all)" : ""}\n`);

  if (prospects.length === 0) {
    console.log("Nothing to draft. Run 'npm run score' first, or use --regen to re-generate existing drafts.");
    return;
  }

  const updateDraft = db.prepare(`
    UPDATE prospects
    SET
      outreach_angle      = ?,
      draft_subject       = ?,
      draft_body          = ?,
      draft_generated_at  = datetime('now'),
      status              = 'draft-ready',
      updated_at          = datetime('now')
    WHERE id = ?
  `);

  const stats = {
    drafted:            0,
    skipped_no_email:   0,
    skipped_suppressed: 0,
    skipped_bad_email:  0,
  };

  for (const p of prospects) {
    // Must have an email to draft for
    if (!p.contact_email) {
      console.log(`  — ${p.business_name}: no email — skipped`);
      stats.skipped_no_email++;
      continue;
    }

    // Email must be valid
    if (isBadEmail(p.contact_email)) {
      console.log(`  — ${p.business_name}: bad email format — skipped`);
      stats.skipped_bad_email++;
      continue;
    }

    // Suppression check
    if (isSuppressed(p.contact_email)) {
      console.log(`  — ${p.business_name}: email is suppressed — skipped`);
      stats.skipped_suppressed++;
      // Also mark the record suppressed
      db.prepare("UPDATE prospects SET status='suppressed', updated_at=datetime('now') WHERE id=?").run(p.id);
      continue;
    }

    // Generate draft
    const { angle, subject, body } = chooseDraft(p);

    updateDraft.run(angle, subject, body, p.id);
    stats.drafted++;

    console.log(`  ✓ ${p.business_name} (${p.city || "?"}) → angle: ${angle}`);
    console.log(`    Subject: ${subject}`);
  }

  console.log("\n─".repeat(48));
  console.log("Draft generation complete:");
  console.log(`  Drafts written:         ${stats.drafted}`);
  console.log(`  Skipped (no email):     ${stats.skipped_no_email}`);
  console.log(`  Skipped (bad email):    ${stats.skipped_bad_email}`);
  console.log(`  Skipped (suppressed):   ${stats.skipped_suppressed}`);
  console.log(`\nReminder: these are starting points. Personalise before sending.`);
  console.log("\nNext: run 'npm run export' to export a CSV for review.");
}

main();
