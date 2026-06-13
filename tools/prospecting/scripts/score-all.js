/**
 * scripts/score-all.js
 * Score and classify all prospects that are in 'new' status.
 *
 * For prospects from the scraper, signals are already populated.
 * For manual imports, this pass does basic scoring from available fields only.
 *
 * Usage:
 *   node scripts/score-all.js
 *   npm run score
 *
 * Flags:
 *   --all    Re-score ALL prospects, including those already scored
 */

"use strict";

const { getDb }               = require("../lib/db");
const { scoreLead, classifyLead } = require("../lib/score");

const args  = process.argv.slice(2);
const reAll = args.includes("--all");

function main() {
  const db = getDb();

  console.log("Claw Labs Prospecting — Score & Classify");
  console.log("─".repeat(48));

  const query = reAll
    ? "SELECT * FROM prospects WHERE status != 'suppressed'"
    : "SELECT * FROM prospects WHERE status = 'new'";

  const prospects = db.prepare(query).all();

  console.log(`Prospects to process: ${prospects.length}${reAll ? " (re-scoring all)" : " (new only)"}\n`);

  if (prospects.length === 0) {
    console.log("Nothing to score. Run 'npm run scrape' or 'npm run import' first.");
    return;
  }

  const updateProspect = db.prepare(`
    UPDATE prospects
    SET
      score                = ?,
      classification       = ?,
      classification_reason = ?,
      status               = 'scored',
      updated_at           = datetime('now')
    WHERE id = ?
  `);

  const tally = {
    "Website Launch Sprint": 0,
    "Website Refresh":       0,
    "AI Assistant":          0,
    "Automation Help":       0,
    "Not Fit":               0,
    "unclassified":          0,
  };

  for (const p of prospects) {
    const score = scoreLead(p);
    const { classification, reason } = classifyLead(p);

    updateProspect.run(score, classification, reason, p.id);
    tally[classification] = (tally[classification] || 0) + 1;

    console.log(`  ${p.business_name} (${p.city || "?"}) → score: ${score} | ${classification}`);
  }

  console.log("\n─".repeat(48));
  console.log("Classification summary:");
  for (const [label, count] of Object.entries(tally)) {
    if (count > 0) console.log(`  ${label.padEnd(26)} ${count}`);
  }

  const notFit = tally["Not Fit"] || 0;
  const actionable = prospects.length - notFit;
  console.log(`\n  Actionable prospects: ${actionable} of ${prospects.length}`);
  console.log("\nNext: run 'npm run drafts' to generate outreach messages.");
}

main();
