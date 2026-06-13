/**
 * lib/score.js
 * Scoring and Claw Labs-specific prospect classification.
 *
 * Classification categories:
 *   Website Launch Sprint  — no website, or Facebook/Linktree only
 *   Website Refresh        — has a site but it's outdated or low quality
 *   AI Assistant           — decent site, service business, AI chat opportunity
 *   Automation Help        — operational business, workflow improvement opportunity
 *   Not Fit                — already well set up, low rating, or poor signals
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Website signal scanning
// Used when we have raw HTML from the scraper.
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_CHAT_PATTERNS = [
  "tawk.to", "intercom", "drift.com", "crisp.chat", "livechat.com",
  "tidio", "olark", "zendesk", "freshchat", "hubspot",
];

const BOOKING_PLATFORM_PATTERNS = [
  "calendly", "acuityscheduling", "booksy", "treatwell", "fresha",
  "phorest", "mindbody", "vagaro", "square appointments", "zcal",
  "simplybook", "setmore", "appointy",
];

const FORM_PATTERNS = [
  "contact us", "get in touch", "send us a message", "enquiry form",
  "request a quote", "request a callback", "fill in the form",
];

const OUTDATED_SIGNALS = [
  "copyright 2015", "copyright 2016", "copyright 2017", "copyright 2018",
  "built with wix", "made with wix", "designed by yell",
  "this site was designed with the wix",
  "flash player",
];

/**
 * Scan HTML for business signals.
 * Returns a plain object of booleans/strings that feed into scoring.
 */
function scanWebsite(html, url) {
  if (!html || typeof html !== "string") {
    return {
      has_live_chat:      false,
      has_booking_cta:    false,
      has_contact_form:   false,
      primary_cta:        "none",
      is_outdated:        false,
      has_enough_content: false,
      website_quality:    0,
    };
  }

  const lower = html.toLowerCase();

  const has_live_chat    = LIVE_CHAT_PATTERNS.some(p => lower.includes(p));
  const has_booking_cta  = BOOKING_PLATFORM_PATTERNS.some(p => lower.includes(p));
  const has_contact_form = FORM_PATTERNS.some(p => lower.includes(p))
                        || lower.includes("<form") || lower.includes("contact");
  const is_outdated      = OUTDATED_SIGNALS.some(p => lower.includes(p));
  const has_enough_content = html.length > 3000;

  // Determine primary CTA type
  let primary_cta = "none";
  if (has_booking_cta)                         primary_cta = "booking";
  else if (lower.includes("whatsapp") || lower.includes("wa.me")) primary_cta = "whatsapp";
  else if (has_contact_form)                   primary_cta = "form";
  else if (lower.includes("call us") || lower.includes("phone")) primary_cta = "phone";

  // Website quality score (0–100)
  let quality = 40;
  if (has_contact_form)    quality += 15;
  if (has_booking_cta)     quality += 10;
  if (has_live_chat)       quality += 10;
  if (!has_enough_content) quality -= 20;
  if (is_outdated)         quality -= 15;
  if (primary_cta === "none") quality -= 10;
  quality = Math.max(0, Math.min(100, quality));

  return {
    has_live_chat,
    has_booking_cta,
    has_contact_form,
    primary_cta,
    is_outdated,
    has_enough_content,
    website_quality: quality,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead scoring  (0–100)
// Higher = better fit for Claw Labs outreach.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a prospect for Claw Labs fit.
 *
 * @param {object} p  Prospect data (from DB or scrape result)
 * @returns {number}  Score 0–100
 */
function scoreLead(p) {
  let score = 20; // base

  // ── Contactability ────────────────────────────────────────────────
  if (p.contact_email) score += 25;
  if (p.contact_phone) score += 10;

  // ── Google reputation ─────────────────────────────────────────────
  const rating = Number(p.google_rating) || 0;
  const reviews = Number(p.review_count) || 0;

  if (rating >= 4.0)  score += 10;
  else if (rating > 0 && rating < 3.5) score -= 15; // not worth working with
  if (reviews >= 10)  score += 8;
  else if (reviews >= 3) score += 3;

  // ── Website signals ───────────────────────────────────────────────
  const hasWebsite = Boolean(p.website && p.website.trim());
  const quality    = Number(p.website_quality) || 0;
  const signals    = parseSignals(p.website_signals);

  if (!hasWebsite) {
    // No website = prime Website Launch Sprint prospect
    score += 15;
  } else {
    if (quality < 40)  score += 12; // weak site = refresh opportunity
    if (quality >= 70) score -= 5;  // already quite good

    if (!signals.has_contact_form) score += 8;   // no enquiry path = opportunity
    if (!signals.has_live_chat)    score += 5;   // no live chat = gap we can fill
    if (signals.is_outdated)       score += 10;  // outdated = clear need
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Claw Labs classification
// ─────────────────────────────────────────────────────────────────────────────

const CLASSIFICATIONS = {
  LAUNCH:     "Website Launch Sprint",
  REFRESH:    "Website Refresh",
  AI:         "AI Assistant",
  AUTOMATION: "Automation Help",
  NOT_FIT:    "Not Fit",
};

/**
 * Classify a prospect into a Claw Labs service category.
 *
 * @param {object} p  Prospect data
 * @returns {{ classification: string, reason: string }}
 */
function classifyLead(p) {
  const rating   = Number(p.google_rating) || 0;
  const reviews  = Number(p.review_count) || 0;
  const hasEmail = Boolean(p.contact_email);
  const hasWebsite = Boolean(p.website && p.website.trim());
  const quality  = Number(p.website_quality) || 0;
  const signals  = parseSignals(p.website_signals);

  // Hard rejections
  if (rating > 0 && rating < 3.5) {
    return {
      classification: CLASSIFICATIONS.NOT_FIT,
      reason: `Low Google rating (${rating}) — not suitable to work with yet`,
    };
  }
  if (!hasEmail) {
    return {
      classification: CLASSIFICATIONS.NOT_FIT,
      reason: "No contact email found — cannot draft outreach",
    };
  }

  // No website at all → Website Launch Sprint
  if (!hasWebsite) {
    return {
      classification: CLASSIFICATIONS.LAUNCH,
      reason: "No website detected — strong candidate for a Website Launch Sprint",
    };
  }

  // Has website but outdated or very low quality → Refresh
  if (signals.is_outdated || quality < 35) {
    return {
      classification: CLASSIFICATIONS.REFRESH,
      reason: `Website exists but quality score is low (${quality}/100)${signals.is_outdated ? " and shows outdated signals" : ""}`,
    };
  }

  // Moderate quality, no enquiry path → still Refresh, framed around conversion
  if (quality < 55 && !signals.has_contact_form) {
    return {
      classification: CLASSIFICATIONS.REFRESH,
      reason: `Website has no clear enquiry/contact path and quality score is moderate (${quality}/100)`,
    };
  }

  // Good website + no live chat → AI Assistant opportunity
  if (quality >= 55 && !signals.has_live_chat) {
    return {
      classification: CLASSIFICATIONS.AI,
      reason: `Decent website (quality ${quality}/100) with no live chat — good fit for an AI assistant`,
    };
  }

  // Good website + already has live chat/booking → Automation Help
  if (quality >= 55 && (signals.has_live_chat || signals.has_booking_cta)) {
    return {
      classification: CLASSIFICATIONS.AUTOMATION,
      reason: `Established website with existing tools — better fit for workflow automation or integrations`,
    };
  }

  // Default — needs more signal
  return {
    classification: CLASSIFICATIONS.REFRESH,
    reason: `Website exists (quality ${quality}/100) — website refresh may be the best entry point`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseSignals(raw) {
  if (!raw) return {};
  try {
    return typeof raw === "object" ? raw : JSON.parse(raw);
  } catch {
    return {};
  }
}

module.exports = { scanWebsite, scoreLead, classifyLead, CLASSIFICATIONS };
