"use strict";

const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../lib/db");
const { classifyCompliance, isManualApproved } = require("../lib/compliance");
const { getSendConfig, sendEmail } = require("../lib/mailer");

function logEvent(db, { prospectId, queueId, eventType, status, detail }) {
  db.prepare(`
    INSERT INTO outreach_events (id, prospect_id, queue_id, event_type, status, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(uuidv4(), prospectId, queueId, eventType, status, detail || null);
}

async function main() {
  const db = getDb();
  const config = getSendConfig();

  console.log("Claw Labs Prospecting - Daily Sender");
  console.log("-".repeat(48));
  console.log(`AUTO_SEND=${config.autoSend ? "true" : "false"}`);
  console.log(`REQUIRE_MANUAL_APPROVAL=${config.requireManualApproval ? "true" : "false"}`);
  console.log(`DAILY_SEND_LIMIT=${config.dailySendLimit} (hard capped at 10)\n`);

  if (config.autoSend && !config.requireManualApproval) {
    console.error("Safety stop: live sending requires REQUIRE_MANUAL_APPROVAL=true.");
    console.error("Set REQUIRE_MANUAL_APPROVAL=true and approve individual prospects before running live sends.");
    process.exit(1);
  }

  let query = `
    SELECT q.*, p.business_name, p.website, p.contact_email, p.draft_subject, p.draft_body,
           p.status AS prospect_status, p.manual_approved, p.score, p.classification
    FROM send_queue q
    JOIN prospects p ON p.id = q.prospect_id
    WHERE q.status = 'queued'
    ORDER BY q.queued_at ASC
    LIMIT ?
  `;

  const rows = db.prepare(query).all(config.dailySendLimit);
  const candidates = config.requireManualApproval
    ? rows.filter(row => isManualApproved({ status: row.prospect_status, manual_approved: row.manual_approved }))
    : rows;

  if (rows.length > 0 && candidates.length === 0 && config.requireManualApproval) {
    console.log("Queued rows exist, but none are marked approved. No sends attempted.");
  }

  if (candidates.length === 0) {
    console.log("No eligible queued emails for today.");
    return;
  }

  const updateSent = db.prepare(`
    UPDATE send_queue
    SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now'), last_error = NULL
    WHERE id = ?
  `);
  const updateFailed = db.prepare(`
    UPDATE send_queue
    SET status = 'failed', last_error = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const updateProspectSent = db.prepare(`
    UPDATE prospects
    SET status = 'contacted', sent_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `);

  let attempted = 0;
  let sent = 0;
  let dryRun = 0;
  let failed = 0;

  for (const row of candidates) {
    const compliance = classifyCompliance({
      id: row.prospect_id,
      business_name: row.business_name,
      website: row.website,
      contact_email: row.contact_email,
      status: row.prospect_status,
      manual_approved: row.manual_approved,
      classification: row.classification
    });

    if (!compliance.can_send) {
      console.log(`  skipped: ${row.business_name} - ${compliance.status}`);
      logEvent(db, {
        prospectId: row.prospect_id,
        queueId: row.id,
        eventType: "send",
        status: "skipped",
        detail: compliance.reason
      });
      continue;
    }

    attempted++;
    try {
      const result = await sendEmail({
        to: row.contact_email,
        subject: row.draft_subject,
        text: row.draft_body
      }, config);

      if (result.dryRun) {
        dryRun++;
        console.log(`  WOULD SEND: ${row.business_name} <${row.contact_email}> | ${row.draft_subject}`);
        logEvent(db, {
          prospectId: row.prospect_id,
          queueId: row.id,
          eventType: "dry_run_send",
          status: "not_sent",
          detail: "AUTO_SEND=false; no live email sent."
        });
      } else {
        sent++;
        console.log(`  SENT: ${row.business_name} <${row.contact_email}>`);
        updateSent.run(row.id);
        updateProspectSent.run(row.prospect_id);
        logEvent(db, {
          prospectId: row.prospect_id,
          queueId: row.id,
          eventType: "send",
          status: "sent",
          detail: result.providerId ? `Resend id ${result.providerId}` : "Sent via Resend."
        });
      }
    } catch (err) {
      failed++;
      updateFailed.run(err.message, row.id);
      console.log(`  FAILED: ${row.business_name} - ${err.message}`);
      logEvent(db, {
        prospectId: row.prospect_id,
        queueId: row.id,
        eventType: "send",
        status: "failed",
        detail: err.message
      });
    }
  }

  console.log("\n" + "-".repeat(48));
  console.log("Daily sender complete:");
  console.log(`  Attempted: ${attempted}`);
  console.log(`  Dry-run:   ${dryRun}`);
  console.log(`  Sent:      ${sent}`);
  console.log(`  Failed:    ${failed}`);
  if (!config.autoSend) {
    console.log("\nConfirmed: AUTO_SEND=false, so no live emails were sent.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
