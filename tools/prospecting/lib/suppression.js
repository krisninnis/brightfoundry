/**
 * lib/suppression.js
 * Suppression list helpers.
 *
 * A suppressed email address will never be included in draft generation
 * or CSV exports for outreach. This is the opt-out mechanism for v1.
 */

"use strict";

const { v4: uuidv4 }     = require("uuid");
const { getDb }           = require("./db");
const { normaliseEmail }  = require("./email-validator");

/**
 * Check whether an email address is on the suppression list.
 *
 * @param {string} email
 * @returns {boolean}
 */
function isSuppressed(email) {
  if (!email) return false;
  const db = getDb();
  const row = db
    .prepare("SELECT id FROM suppressions WHERE email = ? LIMIT 1")
    .get(normaliseEmail(email));
  return Boolean(row);
}

/**
 * Add an email to the suppression list.
 * Safe to call if already suppressed — upsert by email.
 *
 * @param {string} email
 * @param {string} reason
 * @returns {{ added: boolean, email: string }}
 */
function suppress(email, reason = "manual") {
  const db = getDb();
  const normalised = normaliseEmail(email);

  const existing = db
    .prepare("SELECT id FROM suppressions WHERE email = ? LIMIT 1")
    .get(normalised);

  if (existing) {
    return { added: false, email: normalised };
  }

  db.prepare(`
    INSERT INTO suppressions (id, email, reason, added_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(uuidv4(), normalised, String(reason).slice(0, 200));

  return { added: true, email: normalised };
}

/**
 * Remove an email from the suppression list.
 * Only use this for corrections (e.g. added by mistake).
 *
 * @param {string} email
 * @returns {boolean} true if a row was deleted
 */
function unsuppress(email) {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM suppressions WHERE email = ?")
    .run(normaliseEmail(email));
  return result.changes > 0;
}

/**
 * Return the full suppression list.
 *
 * @returns {Array<{ email: string, reason: string, added_at: string }>}
 */
function listSuppressed() {
  const db = getDb();
  return db
    .prepare("SELECT email, reason, added_at FROM suppressions ORDER BY added_at DESC")
    .all();
}

/**
 * Mark the matching prospect record as suppressed in the prospects table.
 * Does not affect the suppressions table — call suppress() for that.
 *
 * @param {string} email
 */
function markProspectSuppressed(email) {
  const db = getDb();
  db.prepare(`
    UPDATE prospects
    SET status = 'suppressed', updated_at = datetime('now')
    WHERE lower(trim(contact_email)) = ?
  `).run(normaliseEmail(email));
}

module.exports = { isSuppressed, suppress, unsuppress, listSuppressed, markProspectSuppressed };
