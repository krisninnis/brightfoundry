/**
 * scripts/scrape.js
 * Google Places scraper for Claw Labs prospect discovery.
 *
 * ── IMPORTANT RULES ──────────────────────────────────────────────────────────
 *  - Uses only the official Google Places API (public business data)
 *  - No CAPTCHA bypassing
 *  - Volume is capped at SCRAPE_RUN_CAP (default 30 across all queries)
 *  - Polite delay between requests (SCRAPE_DELAY_MS, default 1000ms)
 *  - Skips duplicates automatically (dedup by business name + city)
 *  - Records WHY each business was selected in selection_reason
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Configuration:
 *  Edit SEARCH_TARGETS below to define which types of businesses to find.
 *  Each entry has a query, city, and selection_reason.
 *
 * Usage:
 *   node scripts/scrape.js
 *   npm run scrape
 */

"use strict";

const { v4: uuidv4 }         = require("uuid");
const { getDb, dedupHash }   = require("../lib/db");
const { scrapeQuery }         = require("../lib/scraper");
const { scanWebsite }         = require("../lib/score");
const { scoreLead, classifyLead } = require("../lib/score");
const { isBadEmail, normaliseEmail } = require("../lib/email-validator");
const { isSuppressed }        = require("../lib/suppression");

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURE: Which businesses to search for
//
// Add or remove entries here to target different types of businesses.
// selection_reason is stored with every prospect — be specific about WHY.
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_TARGETS = [
  {
    query: "independent cafe",
    city: "Manchester",
    selectionReason: "Independent café — likely needs a website or refresh; high foot traffic businesses benefit from strong web presence",
  },
  {
    query: "local plumber",
    city: "Manchester",
    selectionReason: "Local trades business — plumbers often have weak or no websites; strong AI assistant or launch sprint candidate",
  },
  {
    query: "independent estate agent",
    city: "Manchester",
    selectionReason: "Estate agents — website quality varies widely; strong automation and AI assistant opportunity",
  },
  // Add more targets here as needed:
  // { query: "accountant", city: "Leeds", selectionReason: "..." },
  // { query: "personal trainer", city: "Birmingham", selectionReason: "..." },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const db = getDb();

  const RUN_CAP          = Number(process.env.SCRAPE_RUN_CAP) || 30;
  const SCORE_THRESHOLD  = Number(process.env.SCRAPE_SCORE_THRESHOLD) || 40;

  console.log("Claw Labs Prospecting — Scrape Run");
  console.log("─".repeat(48));
  console.log(`Cap:             ${RUN_CAP} prospects total`);
  console.log(`Score threshold: ${SCORE_THRESHOLD} minimum`);
  console.log(`Targets:         ${SEARCH_TARGETS.length} queries\n`);

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("✗ GOOGLE_PLACES_API_KEY is not set in .env");
    console.error("  Copy .env.example to .env and add your API key.");
    process.exit(1);
  }

  const stats = {
    fetched:     0,
    kept:        0,
    skipped_dup: 0,
    skipped_score: 0,
    skipped_email: 0,
    skipped_suppressed: 0,
  };

  const insertProspect = db.prepare(`
    INSERT OR IGNORE INTO prospects (
      id, business_name, website, contact_email, contact_phone,
      city, source, selection_reason,
      google_rating, review_count, place_id,
      has_contact_form, primary_cta, website_signals, website_quality,
      score, classification, classification_reason,
      status, dedup_hash, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      'new', ?, datetime('now'), datetime('now')
    )
  `);

  const insertRun = db.prepare(`
    INSERT INTO scrape_runs (id, query, city, results_found, results_kept, run_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const target of SEARCH_TARGETS) {
    if (stats.kept >= RUN_CAP) {
      console.log(`\nReached cap of ${RUN_CAP}. Stopping.`);
      break;
    }

    const remaining = RUN_CAP - stats.kept;

    console.log(`\n[${target.query} — ${target.city}]`);

    const raw = await scrapeQuery({
      query:           target.query,
      city:            target.city,
      selectionReason: target.selectionReason,
      cap:             Math.min(remaining, 20),
      onProgress:      msg => console.log(msg),
    });

    stats.fetched += raw.length;
    let keptThisRun = 0;

    for (const r of raw) {
      // Deduplication
      const hash = dedupHash(r.name, r.city);
      const exists = db
        .prepare("SELECT id FROM prospects WHERE dedup_hash = ? LIMIT 1")
        .get(hash);

      if (exists) {
        stats.skipped_dup++;
        continue;
      }

      // Email validation (if present)
      const email = r.contact_email || null;
      if (email && isBadEmail(email)) {
        stats.skipped_email++;
        continue;
      }

      // Suppression check
      if (email && isSuppressed(email)) {
        stats.skipped_suppressed++;
        continue;
      }

      // Scan website signals
      const signals = scanWebsite(r.html, r.website);

      // Score the prospect
      const prospectForScoring = {
        website:         r.website,
        contact_email:   email,
        contact_phone:   r.phone,
        google_rating:   r.rating,
        review_count:    r.reviewCount,
        website_quality: signals.website_quality,
        website_signals: signals,
      };

      const score = scoreLead(prospectForScoring);

      if (score < SCORE_THRESHOLD) {
        stats.skipped_score++;
        continue;
      }

      const { classification, reason: classReason } = classifyLead({
        ...prospectForScoring,
        website_signals: JSON.stringify(signals),
      });

      // Insert
      const id = uuidv4();
      insertProspect.run(
        id,
        r.name,
        r.website || null,
        email,
        r.phone || null,
        r.city || target.city,
        "google_places",
        r.selectionReason,
        r.rating || null,
        r.reviewCount || null,
        r.placeId || null,
        signals.has_contact_form ? 1 : 0,
        signals.primary_cta || null,
        JSON.stringify(signals),
        signals.website_quality || 0,
        score,
        classification,
        classReason,
        hash
      );

      stats.kept++;
      keptThisRun++;
      console.log(`    → Saved [score: ${score}] [${classification}]`);
    }

    insertRun.run(
      uuidv4(),
      target.query,
      target.city,
      raw.length,
      keptThisRun
    );
  }

  console.log("\n─".repeat(48));
  console.log("Scrape complete:");
  console.log(`  Fetched from API:   ${stats.fetched}`);
  console.log(`  Saved:              ${stats.kept}`);
  console.log(`  Skipped (dup):      ${stats.skipped_dup}`);
  console.log(`  Skipped (score<${SCORE_THRESHOLD}): ${stats.skipped_score}`);
  console.log(`  Skipped (bad email):${stats.skipped_email}`);
  console.log(`  Skipped (suppressed):${stats.skipped_suppressed}`);
  console.log("\nNext: run 'npm run score' then 'npm run drafts' then 'npm run export'");
}

main().catch(err => {
  console.error("✗ Scrape failed:", err.message);
  process.exit(1);
});
