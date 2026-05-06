/**
 * scripts/import-csv.js
 * Import prospects from a manually prepared CSV file.
 *
 * Use this when you have a list of businesses from your own research
 * (e.g. from a local directory, referral, or Google search by hand).
 *
 * Required CSV columns:
 *   business_name     — Company or trading name
 *   city              — Town or city
 *   selection_reason  — Why you're considering this business (required)
 *
 * Optional CSV columns:
 *   website           — Full URL (https://...)
 *   contact_email     — Direct email address
 *   contact_phone     — Phone number
 *   source            — Where you found them (default: 'manual')
 *   notes             — Free-text notes
 *
 * Usage:
 *   node scripts/import-csv.js --file ./my-leads.csv
 *   npm run import -- --file ./my-leads.csv
 */

"use strict";

const fs                     = require("fs");
const path                   = require("path");
const { parse }              = require("csv-parse/sync");
const { v4: uuidv4 }         = require("uuid");
const { getDb, dedupHash }   = require("../lib/db");
const { isBadEmail, normaliseEmail } = require("../lib/email-validator");
const { isSuppressed }        = require("../lib/suppression");

function cleanRowKeys(row) {
  const clean = {};
  for (const [key, value] of Object.entries(row)) {
    const normalisedKey = String(key).replace(/^\uFEFF/, "").trim();
    clean[normalisedKey] = value;
  }
  return clean;
}

function field(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) {
      return String(row[name]).trim();
    }
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse CLI args
// ─────────────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
const csvPath = fileIdx !== -1 ? args[fileIdx + 1] : null;

if (!csvPath) {
  console.error("Usage: node scripts/import-csv.js --file <path-to-csv>");
  console.error("Example: node scripts/import-csv.js --file ./prospects.csv");
  process.exit(1);
}

const resolvedPath = path.resolve(csvPath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`✗ File not found: ${resolvedPath}`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const db = getDb();

  console.log("BrightFoundry Prospecting — CSV Import");
  console.log("─".repeat(48));
  console.log(`File: ${resolvedPath}\n`);

  const raw = fs.readFileSync(resolvedPath, "utf8");
  let rows;
  try {
    rows = parse(raw, {
      columns:          true,
      skip_empty_lines: true,
      trim:             true,
    }).map(cleanRowKeys);
  } catch (err) {
    console.error("✗ Failed to parse CSV:", err.message);
    process.exit(1);
  }

  console.log(`Rows in file: ${rows.length}\n`);

  const insertProspect = db.prepare(`
    INSERT OR IGNORE INTO prospects (
      id, business_name, website, contact_email, contact_phone,
      city, source, selection_reason,
      status, notes, dedup_hash,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      'new', ?, ?,
      datetime('now'), datetime('now')
    )
  `);

  const stats = {
    imported:  0,
    skipped_dup:        0,
    skipped_missing:    0,
    skipped_email:      0,
    skipped_suppressed: 0,
    errors:    0,
  };

  for (const [i, row] of rows.entries()) {
    const lineNum = i + 2; // 1-indexed, +1 for header

        const businessName    = field(row, "business_name", "businessName", "company_name", "company", "name");
        const city            = field(row, "city", "town", "location");
        const selectionReason = field(row, "selection_reason", "reason", "notes", "why_selected");

    // Required fields
    if (!businessName || !city) {
      console.warn(`  Line ${lineNum}: missing business_name or city — skipped`);
      stats.skipped_missing++;
      continue;
    }
    if (!selectionReason) {
      console.warn(`  Line ${lineNum}: ${businessName} — missing selection_reason — skipped`);
      stats.skipped_missing++;
      continue;
    }

        const website = field(row, "website", "url", "site") || null;
        const phone   = field(row, "contact_phone", "phone", "telephone") || null;
        const notes   = field(row, "notes", "extra_notes") || null;
        const source  = field(row, "source") || "manual";

    // Email validation
        let email = field(row, "contact_email", "email", "business_email") || null;
    if (email) {
      if (isBadEmail(email)) {
        console.warn(`  Line ${lineNum}: ${businessName} — bad email "${email}" — email cleared`);
        email = null;
        stats.skipped_email++;
      } else if (isSuppressed(email)) {
        console.warn(`  Line ${lineNum}: ${businessName} — email "${email}" is suppressed — skipped`);
        stats.skipped_suppressed++;
        continue;
      } else {
        email = normaliseEmail(email);
      }
    }

    // Deduplication
    const hash = dedupHash(businessName, city);
    const exists = db
      .prepare("SELECT id FROM prospects WHERE dedup_hash = ? LIMIT 1")
      .get(hash);

    if (exists) {
      console.log(`  Line ${lineNum}: ${businessName} (${city}) — duplicate, skipped`);
      stats.skipped_dup++;
      continue;
    }

    // Insert
    try {
      insertProspect.run(
        uuidv4(),
        businessName,
        website,
        email,
        phone,
        city,
        source,
        selectionReason,
        notes,
        hash
      );
      console.log(`  ✓ Imported: ${businessName} (${city})`);
      stats.imported++;
    } catch (err) {
      console.error(`  ✗ Line ${lineNum}: ${businessName} — insert error: ${err.message}`);
      stats.errors++;
    }
  }

  console.log("\n─".repeat(48));
  console.log("Import complete:");
  console.log(`  Imported:              ${stats.imported}`);
  console.log(`  Skipped (duplicate):   ${stats.skipped_dup}`);
  console.log(`  Skipped (missing data):${stats.skipped_missing}`);
  console.log(`  Skipped (bad email):   ${stats.skipped_email}`);
  console.log(`  Skipped (suppressed):  ${stats.skipped_suppressed}`);
  console.log(`  Errors:                ${stats.errors}`);
  console.log("\nNext: run 'npm run score' to score imported prospects.");
}

main();
