/**
 * scripts/export-review.js
 * Export prospects with outreach drafts to a CSV file for Kristian's review.
 *
 * The CSV is the gate before any contact happens.
 * Nothing in this tool sends emails — the CSV is for manual decision-making.
 *
 * Columns exported:
 *   id, business_name, website, contact_email, contact_phone, city,
 *   classification, score, selection_reason, classification_reason,
 *   draft_subject, draft_body, source, google_rating, review_count,
 *   status, notes, created_at
 *
 * Usage:
 *   node scripts/export-review.js
 *   npm run export
 *
 * Flags:
 *   --status <s>   Filter by status (default: draft-ready)
 *                  e.g. --status scored  to export scored-but-not-drafted too
 *   --all          Export everything except suppressed/not-fit
 */

"use strict";

const fs                 = require("fs");
const path               = require("path");
const { stringify }      = require("csv-stringify/sync");
const { getDb }          = require("../lib/db");

// ─────────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const allFlag   = args.includes("--all");
const statusIdx = args.indexOf("--status");
const statusFilter = statusIdx !== -1 ? args[statusIdx + 1] : null;

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const db = getDb();

  console.log("BrightFoundry Prospecting — Export for Review");
  console.log("─".repeat(48));

  // Build query
  let whereClause;
  if (allFlag) {
    whereClause = `WHERE status NOT IN ('suppressed') AND classification NOT IN ('Not Fit', 'unclassified')`;
  } else if (statusFilter) {
    whereClause = `WHERE status = '${statusFilter.replace(/'/g, "''")}'`;
  } else {
    whereClause = `WHERE status = 'draft-ready'`;
  }

  const prospects = db.prepare(`
    SELECT
      id,
      business_name,
      website,
      contact_email,
      contact_phone,
      city,
      classification,
      score,
      selection_reason,
      classification_reason,
      outreach_angle,
      draft_subject,
      draft_body,
      source,
      google_rating,
      review_count,
      status,
      notes,
      created_at
    FROM prospects
    ${whereClause}
    ORDER BY score DESC, classification ASC
  `).all();

  console.log(`Prospects to export: ${prospects.length}\n`);

  if (prospects.length === 0) {
    console.log("Nothing to export.");
    console.log("Run 'npm run drafts' first, or use --all to export all non-suppressed prospects.");
    return;
  }

  // Prepare output directory
  const exportDir = path.resolve(
    __dirname,
    "..",
    process.env.EXPORT_DIR || "./exports"
  );
  fs.mkdirSync(exportDir, { recursive: true });

  // Timestamped filename
  const ts       = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `bf-prospects-review-${ts}.csv`;
  const outPath  = path.join(exportDir, filename);

  // Build CSV rows
  const rows = prospects.map(p => ({
    "ID":                    p.id,
    "Business Name":         p.business_name || "",
    "Website":               p.website || "",
    "Contact Email":         p.contact_email || "",
    "Contact Phone":         p.contact_phone || "",
    "City":                  p.city || "",
    "Classification":        p.classification || "",
    "Score (0-100)":         p.score ?? "",
    "Selection Reason":      p.selection_reason || "",
    "Classification Reason": p.classification_reason || "",
    "Outreach Angle":        p.outreach_angle || "",
    "Draft Subject":         p.draft_subject || "",
    "Draft Body":            p.draft_body || "",
    "Source":                p.source || "",
    "Google Rating":         p.google_rating ?? "",
    "Review Count":          p.review_count ?? "",
    "Status":                p.status || "",
    "Notes":                 p.notes || "",
    "Added":                 p.created_at || "",
    "APPROVED (Y/N)":        "",   // Kristian fills this in
    "PERSONALISED NOTES":    "",   // For personalisation notes before sending
  }));

  const csv = stringify(rows, { header: true });
  fs.writeFileSync(outPath, csv, "utf8");

  console.log(`✓ Exported to: ${outPath}`);
  console.log(`\nThe CSV has ${rows.length} rows.`);
  console.log(`\nInstructions:`);
  console.log(`  1. Open the CSV in Excel or Google Sheets`);
  console.log(`  2. Review each row — check the draft subject and body`);
  console.log(`  3. Fill in the "APPROVED (Y/N)" column for rows you want to contact`);
  console.log(`  4. Add personalisation notes in "PERSONALISED NOTES" where helpful`);
  console.log(`  5. For any email you want to suppress, run:`);
  console.log(`     npm run suppress -- --email address@example.com --reason "not suitable"`);
  console.log(`\nRemember: no emails have been sent. This is for planning only.`);

  // Summary breakdown
  const byClassification = {};
  for (const p of prospects) {
    const c = p.classification || "unclassified";
    byClassification[c] = (byClassification[c] || 0) + 1;
  }

  console.log("\nBreakdown:");
  for (const [label, count] of Object.entries(byClassification)) {
    console.log(`  ${label.padEnd(26)} ${count}`);
  }
}

main();
