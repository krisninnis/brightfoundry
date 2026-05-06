"use strict";

const { getDb } = require("../lib/db");
const { auditWebsite } = require("../lib/website-auditor");
const { scoreBotFit } = require("../lib/bot-fit");
const { scoreLead, classifyLead } = require("../lib/score");

const args = process.argv.slice(2);
const all = args.includes("--all");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : null;

function buildWebsiteSignals(audit) {
  return {
    hasContactForm: Boolean(audit.contact_form),
    hasBookingCTA: Boolean(audit.booking_link),
    hasPhoneCTA: Boolean(audit.tel_link),
    hasTestimonials: Boolean(audit.visible_reviews_testimonials_wording),
    hasLiveChat: Boolean(audit.has_live_chat),
    hasMobileViewport: Boolean(audit.mobile_viewport),
    hasMetaDescription: Boolean(audit.has_meta_description)
  };
}

function choosePrimaryCta(audit) {
  if (audit.booking_link) return "booking";
  if (audit.contact_form) return "form";
  if (audit.tel_link) return "phone";
  return "none";
}

function classifyWithAudit(prospect, audit, botFit) {
  if (!audit.has_website) {
    return {
      classification: "Website Launch Sprint",
      reason: "No website was present, making this a clear launch sprint opportunity."
    };
  }

  if (!audit.website_loads) {
    return {
      classification: "Website Refresh",
      reason: "Website was present but did not load cleanly during audit."
    };
  }

  if (audit.old_weak_site_score >= 45) {
    return {
      classification: "Website Refresh",
      reason: `Website audit found conversion/trust gaps: ${audit.audit_notes.join(" ")}`
    };
  }

  if (botFit.score >= 70) {
    return {
      classification: "AI Assistant",
      reason: `AI assistant fit is strong: ${botFit.signals.join(" ")}`
    };
  }

  return classifyLead(prospect);
}

function scoreWithAudit(prospect, audit, botFit) {
  const base = scoreLead({
    ...prospect,
    has_contact_form: audit.contact_form ? 1 : 0,
    primary_cta: choosePrimaryCta(audit),
    website_quality: audit.website_quality
  });

  const auditBoost = audit.old_weak_site_score >= 45 ? 10 : 0;
  const noWebsiteBoost = !audit.has_website ? 15 : 0;
  const botBoost = botFit.score >= 70 ? 7 : botFit.score >= 45 ? 4 : 0;

  return Math.min(100, base + auditBoost + noWebsiteBoost + botBoost);
}

async function main() {
  const db = getDb();

  console.log("BrightFoundry Prospecting - Website Audit");
  console.log("-".repeat(48));
  console.log("Polite checks only: one page request per prospect, timeout/delay enabled.\n");

  let query = `
    SELECT * FROM prospects
    WHERE status != 'suppressed'
  `;
  if (!all) {
    query += " AND website_audited_at IS NULL";
  }
  query += " ORDER BY created_at ASC";
  if (Number.isFinite(limit) && limit > 0) {
    query += ` LIMIT ${Math.floor(limit)}`;
  }

  const prospects = db.prepare(query).all();
  console.log(`Prospects to audit: ${prospects.length}${all ? " (--all)" : ""}\n`);

  if (prospects.length === 0) {
    console.log("Nothing to audit.");
    return;
  }

  const update = db.prepare(`
    UPDATE prospects
    SET
      website_audit = ?,
      website_audited_at = datetime('now'),
      website_signals = ?,
      website_quality = ?,
      has_contact_form = ?,
      primary_cta = ?,
      bot_fit_score = ?,
      bot_fit_signals = ?,
      score = ?,
      classification = ?,
      classification_reason = ?,
      status = CASE WHEN status = 'new' THEN 'scored' ELSE status END,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  const stats = {
    audited: 0,
    no_website: 0,
    did_not_load: 0,
    actionable: 0
  };

  for (const p of prospects) {
    const audit = await auditWebsite(p.website);
    const botFit = scoreBotFit(p, audit);
    const score = scoreWithAudit(p, audit, botFit);
    const classification = classifyWithAudit(p, audit, botFit);

    update.run(
      JSON.stringify(audit),
      JSON.stringify(buildWebsiteSignals(audit)),
      audit.website_quality,
      audit.contact_form ? 1 : 0,
      choosePrimaryCta(audit),
      botFit.score,
      JSON.stringify(botFit),
      score,
      classification.classification,
      classification.reason,
      p.id
    );

    stats.audited++;
    if (!audit.has_website) stats.no_website++;
    if (audit.has_website && !audit.website_loads) stats.did_not_load++;
    if (score >= 70 && classification.classification !== "Not Fit") stats.actionable++;

    console.log(`  ${p.business_name}: ${classification.classification} | score ${score} | weakness ${audit.old_weak_site_score}`);
  }

  console.log("\n" + "-".repeat(48));
  console.log("Audit complete:");
  console.log(`  Audited:       ${stats.audited}`);
  console.log(`  No website:    ${stats.no_website}`);
  console.log(`  Did not load:  ${stats.did_not_load}`);
  console.log(`  Actionable:    ${stats.actionable}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
