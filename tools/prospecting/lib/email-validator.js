/**
 * lib/email-validator.js
 * Validates email addresses and rejects known bad patterns.
 * Blocks automated/system addresses, platform domains, and scrape artefacts.
 */

"use strict";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Prefixes that indicate automated/system addresses — never contact these
const BLOCKED_PREFIXES = [
  "noreply@",
  "no-reply@",
  "donotreply@",
  "do-not-reply@",
  "mailer-daemon@",
  "postmaster@",
  "bounce@",
  "bounces@",
  "notification@",
  "notifications@",
  "alerts@",
  "automated@",
  "system@",
];

// Platform/service domains — emails scraped from these are not real contacts
const BLOCKED_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  // Website builders / platforms
  "wix.com",
  "wixpress.com",
  "squarespace.com",
  "weebly.com",
  "wordpress.com",
  "blogger.com",
  "webflow.io",
  // Tech platforms
  "google.com",
  "googleapis.com",
  "googlemail.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "twitter.com",
  "linkedin.com",
  // Payment / e-commerce
  "stripe.com",
  "shopify.com",
  "paypal.com",
  // Infra / CDN
  "cloudflare.com",
  "amazonaws.com",
  "azure.com",
  "sentry.io",
  // Marketing tools
  "mailchimp.com",
  "klaviyo.com",
  "hubspot.com",
  "zendesk.com",
  "sendgrid.net",
  "resend.com",
];

// File extension substrings that appear in scraped "emails" (false positives from HTML)
const BLOCKED_EXTENSIONS = [
  ".png@", ".jpg@", ".gif@", ".svg@", ".webp@",
  ".css@", ".js@",  ".pdf@", ".zip@",
];

/**
 * Returns true if the email should NOT be used for outreach.
 *
 * @param {string|null|undefined} email
 * @returns {boolean}
 */
function isBadEmail(email) {
  if (!email || typeof email !== "string") return true;

  const e = email.trim().toLowerCase();

  // Basic format check
  if (!EMAIL_RE.test(e)) return true;

  // Too long
  if (e.length > 254) return true;

  // Encoded characters (scraped artifacts)
  if (e.includes("u003c") || e.includes("u003e") || e.includes("%40")) return true;

  // Blocked prefixes
  if (BLOCKED_PREFIXES.some(p => e.startsWith(p))) return true;

  // Blocked domains
  const domain = e.split("@")[1] || "";
  if (BLOCKED_DOMAINS.some(d => domain === d || domain.endsWith("." + d))) return true;

  // File extension false-positives
  if (BLOCKED_EXTENSIONS.some(x => e.includes(x))) return true;

  return false;
}

/**
 * Normalise an email for consistent storage and comparison.
 *
 * @param {string} email
 * @returns {string}
 */
function normaliseEmail(email) {
  return String(email || "").trim().toLowerCase();
}

module.exports = { isBadEmail, normaliseEmail };
