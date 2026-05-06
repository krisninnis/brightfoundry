"use strict";

const SERVICE_WORDS = [
  "roof", "clean", "cleaning", "plumb", "electric", "builder", "property",
  "mechanic", "garage", "salon", "beauty", "spa", "treatment", "clinic",
  "dog", "pet", "walk", "groom", "repair", "install", "maintenance",
  "landscap", "garden", "trade", "service"
];

const QUESTION_CATEGORIES = [
  "price", "cost", "quote", "availability", "opening", "hours", "area",
  "areas", "booking", "appointment", "emergency", "treatment", "service"
];

function parseAudit(audit) {
  if (!audit) return {};
  if (typeof audit === "object") return audit;
  try {
    return JSON.parse(audit);
  } catch {
    return {};
  }
}

function includesAny(text, words) {
  const haystack = String(text || "").toLowerCase();
  return words.some(word => haystack.includes(word));
}

function scoreBotFit(prospect, auditInput) {
  const audit = parseAudit(auditInput || prospect.website_audit);
  const text = [
    prospect.business_name,
    prospect.selection_reason,
    prospect.classification_reason,
    prospect.notes,
    prospect.city
  ].filter(Boolean).join(" ");

  const signals = [];
  let score = 0;

  if (includesAny(text, SERVICE_WORDS)) {
    score += 25;
    signals.push("Looks like a service business.");
  }

  if (audit.contact_enquiry_quote_booking_words || includesAny(text, ["booking", "enquiry", "quote", "appointment"])) {
    score += 15;
    signals.push("Uses booking, enquiry, quote, or appointment language.");
  }

  if (audit.faq_wording || includesAny(text, ["faq", "question", "questions"])) {
    score += 15;
    signals.push("FAQ/question wording suggests repeat customer questions.");
  }

  if (audit.price_service_menu_treatment_wording || includesAny(text, ["price", "service", "menu", "treatment"])) {
    score += 10;
    signals.push("Service, price, menu, or treatment wording is present.");
  }

  if (includesAny(text, QUESTION_CATEGORIES) || audit.price_service_menu_treatment_wording) {
    score += 10;
    signals.push("Likely repeat question categories are present.");
  }

  if (audit.contact_form && !audit.has_live_chat) {
    score += 20;
    signals.push("Has a contact form but no obvious instant-help assistant.");
  }

  if (!audit.booking_link && (audit.contact_form || audit.tel_link)) {
    score += 5;
    signals.push("Enquiry path exists but may still need automation support.");
  }

  const capped = Math.min(100, score);
  const label = capped >= 70 ? "High Fit" : capped >= 45 ? "Medium Fit" : "Low Fit";

  return {
    score: capped,
    label,
    signals
  };
}

module.exports = { scoreBotFit };
