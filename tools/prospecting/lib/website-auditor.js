"use strict";

const axios = require("axios");

const DEFAULT_TIMEOUT_MS = Number(process.env.WEBSITE_AUDIT_TIMEOUT_MS || 8000);
const DEFAULT_DELAY_MS = Number(process.env.WEBSITE_AUDIT_DELAY_MS || 1000);
const CURRENT_YEAR = new Date().getFullYear();

function sleep(ms = DEFAULT_DELAY_MS) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normaliseUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function textFromHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text, words) {
  const haystack = String(text || "").toLowerCase();
  return words.some(word => haystack.includes(word));
}

function detectCopyrightYear(html, text) {
  const combined = `${html || ""} ${text || ""}`;
  const years = Array.from(combined.matchAll(/\b(20[0-2][0-9])\b/g))
    .map(match => Number(match[1]))
    .filter(year => year >= 2000 && year <= CURRENT_YEAR);

  if (years.length === 0) return null;
  return Math.max(...years);
}

function detectBookingLink(html) {
  return /href=["'][^"']*(book|booking|calendly|acuityscheduling|setmore|fresha|treatwell|appoint|simplybook|squareup|timely)[^"']*["']/i.test(html);
}

function buildAuditFromHtml(html, url, finalUrl) {
  const text = textFromHtml(html);
  const lowerHtml = String(html || "").toLowerCase();
  const notes = [];

  const hasTitle = /<title[^>]*>\s*[^<]{3,}\s*<\/title>/i.test(html);
  const hasMetaDescription = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}["']/i.test(html)
    || /<meta[^>]+content=["'][^"']{20,}["'][^>]+name=["']description["']/i.test(html);
  const mobileViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const contactWords = hasAny(text, ["contact", "enquiry", "enquire", "quote", "callback", "call us", "get in touch"]);
  const bookingWords = hasAny(text, ["book", "booking", "appointment", "schedule", "availability"]);
  const hasContactForm = /<form[\s\S]*?(contact|enquir|quote|book|message|name|email|phone)[\s\S]*?<\/form>/i.test(html);
  const hasTelLink = /href=["']tel:/i.test(html);
  const hasBookingLink = detectBookingLink(html);
  const reviewsWording = hasAny(text, ["review", "reviews", "testimonial", "testimonials", "rated", "stars", "google reviews", "happy customers"]);
  const hasFaqWording = hasAny(text, ["faq", "frequently asked", "questions", "what areas", "how much", "how long"]);
  const hasPriceServiceWording = hasAny(text, ["price", "prices", "pricing", "service", "services", "menu", "treatment", "treatments", "repair", "installation"]);
  const hasLiveChat = hasAny(lowerHtml, ["live chat", "intercom", "tawk.to", "crisp.chat", "tidio", "drift.com", "chat widget"]);
  const copyrightYear = detectCopyrightYear(html, text);

  let weakScore = 0;
  if (!hasTitle) {
    weakScore += 12;
    notes.push("Missing or weak page title.");
  }
  if (!hasMetaDescription) {
    weakScore += 12;
    notes.push("Missing or weak meta description.");
  }
  if (!mobileViewport) {
    weakScore += 18;
    notes.push("No mobile viewport tag detected.");
  }
  if (!contactWords) {
    weakScore += 12;
    notes.push("Contact, enquiry, quote, or booking language is not obvious.");
  }
  if (!hasContactForm && !hasTelLink && !hasBookingLink) {
    weakScore += 18;
    notes.push("No clear form, phone link, or booking link detected.");
  }
  if (!reviewsWording) {
    weakScore += 10;
    notes.push("No obvious review or testimonial wording detected.");
  }
  if (copyrightYear && copyrightYear < CURRENT_YEAR - 2) {
    weakScore += 10;
    notes.push(`Copyright year looks old (${copyrightYear}).`);
  }

  if (notes.length === 0) {
    notes.push("Core website signals are present.");
  }

  return {
    has_website: true,
    website_loads: true,
    final_url: finalUrl || url,
    https: /^https:\/\//i.test(finalUrl || url),
    has_title: hasTitle,
    has_meta_description: hasMetaDescription,
    mobile_viewport: mobileViewport,
    contact_enquiry_quote_booking_words: contactWords || bookingWords,
    contact_form: hasContactForm,
    tel_link: hasTelLink,
    booking_link: hasBookingLink,
    visible_reviews_testimonials_wording: reviewsWording,
    faq_wording: hasFaqWording,
    price_service_menu_treatment_wording: hasPriceServiceWording,
    has_live_chat: hasLiveChat,
    copyright_year: copyrightYear,
    old_weak_site_score: Math.min(100, weakScore),
    website_quality: Math.max(0, 100 - Math.min(100, weakScore)),
    audit_notes: notes
  };
}

async function auditWebsite(website, options = {}) {
  const url = normaliseUrl(website);
  if (!url) {
    return {
      has_website: false,
      website_loads: false,
      https: false,
      old_weak_site_score: 95,
      website_quality: 5,
      classification_hint: "Website Launch Sprint",
      audit_notes: ["No website present. Treat as a Website Launch Sprint opportunity."]
    };
  }

  await sleep(options.delayMs ?? DEFAULT_DELAY_MS);

  try {
    const response = await axios.get(url, {
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRedirects: 4,
      headers: {
        "User-Agent": "BrightFoundryProspectingAudit/1.0 (+manual review; no aggressive scraping)",
        "Accept": "text/html,application/xhtml+xml"
      },
      validateStatus: status => status >= 200 && status < 500
    });

    const contentType = String(response.headers["content-type"] || "");
    if (response.status >= 400 || !contentType.includes("text/html")) {
      return {
        has_website: true,
        website_loads: false,
        final_url: response.request?.res?.responseUrl || url,
        https: /^https:\/\//i.test(url),
        old_weak_site_score: 85,
        website_quality: 15,
        audit_notes: [`Website request returned ${response.status} or non-HTML content.`]
      };
    }

    return buildAuditFromHtml(
      response.data,
      url,
      response.request?.res?.responseUrl || url
    );
  } catch (err) {
    return {
      has_website: true,
      website_loads: false,
      final_url: url,
      https: /^https:\/\//i.test(url),
      old_weak_site_score: 85,
      website_quality: 15,
      audit_notes: [`Website did not load within the audit checks: ${err.code || err.message}`]
    };
  }
}

module.exports = {
  auditWebsite,
  buildAuditFromHtml,
  normaliseUrl,
  sleep
};
