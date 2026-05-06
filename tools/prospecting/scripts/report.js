"use strict";

const { getDb } = require("../lib/db");

function one(db, sql, params = []) {
  return db.prepare(sql).get(...params).count;
}

function main() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const counts = {
    prospectsFound: one(db, "SELECT COUNT(*) AS count FROM prospects"),
    audited: one(db, "SELECT COUNT(*) AS count FROM prospects WHERE website_audited_at IS NOT NULL"),
    actionable: one(db, "SELECT COUNT(*) AS count FROM prospects WHERE score >= 70 AND classification NOT IN ('Not Fit', 'unclassified') AND status != 'suppressed'"),
    queued: one(db, "SELECT COUNT(*) AS count FROM send_queue WHERE status = 'queued'"),
    sentToday: one(db, "SELECT COUNT(*) AS count FROM outreach_events WHERE event_type = 'send' AND status = 'sent' AND date(created_at) = date(?)", [today]),
    suppressed: one(db, "SELECT COUNT(*) AS count FROM suppressions"),
    manualApproved: one(db, "SELECT COUNT(*) AS count FROM prospects WHERE status = 'approved' OR manual_approved = 1"),
    needsManual: one(db, "SELECT COUNT(*) AS count FROM prospects WHERE requires_manual_approval = 1 AND status NOT IN ('suppressed', 'contacted')"),
    dryRunToday: one(db, "SELECT COUNT(*) AS count FROM outreach_events WHERE event_type = 'dry_run_send' AND date(created_at) = date(?)", [today]),
    repliesLogged: one(db, "SELECT COUNT(*) AS count FROM outreach_events WHERE event_type = 'reply'")
  };

  const byClassification = db.prepare(`
    SELECT classification, COUNT(*) AS count
    FROM prospects
    GROUP BY classification
    ORDER BY count DESC
  `).all();

  const byCompliance = db.prepare(`
    SELECT COALESCE(compliance_status, 'not_checked') AS compliance_status, COUNT(*) AS count
    FROM prospects
    GROUP BY COALESCE(compliance_status, 'not_checked')
    ORDER BY count DESC
  `).all();

  console.log("BrightFoundry Prospecting - Daily Report");
  console.log("-".repeat(48));
  console.log(`Prospects found:      ${counts.prospectsFound}`);
  console.log(`Audited:              ${counts.audited}`);
  console.log(`Actionable:           ${counts.actionable}`);
  console.log(`Queued:               ${counts.queued}`);
  console.log(`Sent today:           ${counts.sentToday}`);
  console.log(`Dry-run sends today:  ${counts.dryRunToday}`);
  console.log(`Suppressed:           ${counts.suppressed}`);
  console.log(`Manual approved:      ${counts.manualApproved}`);
  console.log(`Needs manual review:  ${counts.needsManual}`);
  console.log(`Replies logged:       ${counts.repliesLogged}`);

  console.log("\nClassification:");
  for (const row of byClassification) {
    console.log(`  ${(row.classification || "unclassified").padEnd(24)} ${row.count}`);
  }

  console.log("\nCompliance:");
  for (const row of byCompliance) {
    console.log(`  ${row.compliance_status.padEnd(24)} ${row.count}`);
  }
}

main();
