"use strict";

const { v4: uuidv4 } = require("uuid");
const { getDb } = require("./db");
const { classifyCompliance, ensureOptOut, isManualApproved } = require("./compliance");

function hasBeenSent(db, prospect) {
  if (prospect.sent_at || prospect.status === "contacted") return true;
  const sentEvent = db.prepare(`
    SELECT 1 FROM outreach_events
    WHERE prospect_id = ? AND event_type = 'send' AND status = 'sent'
    LIMIT 1
  `).get(prospect.id);
  return Boolean(sentEvent);
}

function buildSendQueue() {
  const db = getDb();
  const prospects = db.prepare(`
    SELECT * FROM prospects
    WHERE status NOT IN ('suppressed', 'contacted')
    ORDER BY score DESC, updated_at ASC
  `).all();

  const insertQueue = db.prepare(`
    INSERT OR IGNORE INTO send_queue (
      id, prospect_id, status, compliance_status, requires_manual_approval, queued_at, created_at, updated_at
    ) VALUES (?, ?, 'queued', ?, ?, datetime('now'), datetime('now'), datetime('now'))
  `);

  const updateProspect = db.prepare(`
    UPDATE prospects
    SET
      compliance_status = ?,
      requires_manual_approval = ?,
      draft_body = ?,
      queued_at = CASE WHEN ? = 1 THEN COALESCE(queued_at, datetime('now')) ELSE queued_at END,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  const stats = {
    considered: prospects.length,
    queued: 0,
    skipped_low_score: 0,
    skipped_not_fit: 0,
    skipped_suppressed: 0,
    skipped_no_draft: 0,
    skipped_compliance: 0,
    skipped_sent: 0,
    already_queued: 0
  };

  const queued = [];

  for (const p of prospects) {
    const compliance = classifyCompliance(p);
    const draftBody = ensureOptOut(p.draft_body);
    let queueable = true;

    if (compliance.status === "suppressed") {
      stats.skipped_suppressed++;
      queueable = false;
    }

    if (queueable && Number(p.score || 0) < 70) {
      stats.skipped_low_score++;
      queueable = false;
    }

    if (queueable && (!p.classification || p.classification === "Not Fit" || p.classification === "unclassified")) {
      stats.skipped_not_fit++;
      queueable = false;
    }

    if (queueable && (!p.draft_subject || !draftBody)) {
      stats.skipped_no_draft++;
      queueable = false;
    }

    if (queueable && !compliance.can_send) {
      stats.skipped_compliance++;
      queueable = false;
    }

    if (queueable && hasBeenSent(db, p)) {
      stats.skipped_sent++;
      queueable = false;
    }

    updateProspect.run(
      compliance.status,
      compliance.requires_manual_approval ? 1 : 0,
      draftBody || p.draft_body,
      queueable ? 1 : 0,
      p.id
    );

    if (!queueable) continue;

    const result = insertQueue.run(
      uuidv4(),
      p.id,
      compliance.status,
      compliance.requires_manual_approval ? 1 : 0
    );

    if (result.changes === 0) {
      stats.already_queued++;
    } else {
      stats.queued++;
      queued.push({
        id: p.id,
        business_name: p.business_name,
        contact_email: p.contact_email,
        score: p.score,
        classification: p.classification,
        compliance_status: compliance.status,
        manual_approved: isManualApproved(p)
      });
    }
  }

  return { stats, queued };
}

module.exports = { buildSendQueue };
