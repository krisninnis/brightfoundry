"use strict";

const { isSuppressed } = require("./suppression");
const { isBadEmail } = require("./email-validator");

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "aol.com",
  "proton.me", "protonmail.com", "pm.me", "mail.com", "gmx.com"
]);

const OPT_OUT = "If this is not useful, just reply 'no thanks' and I will not contact you again.";

function emailDomain(email) {
  const parts = String(email || "").trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}

function websiteDomain(website) {
  try {
    const url = /^https?:\/\//i.test(website || "") ? new URL(website) : new URL(`https://${website}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isManualApproved(prospect) {
  return Number(prospect.manual_approved || 0) === 1 || prospect.status === "approved";
}

function classifyCompliance(prospect) {
  const email = String(prospect.contact_email || "").trim().toLowerCase();

  if (!email) {
    return {
      status: "missing_email",
      requires_manual_approval: true,
      can_send: false,
      reason: "No contact email is present."
    };
  }

  if (isBadEmail(email)) {
    return {
      status: "missing_email",
      requires_manual_approval: true,
      can_send: false,
      reason: "Contact email is missing or invalid."
    };
  }

  if (isSuppressed(email)) {
    return {
      status: "suppressed",
      requires_manual_approval: true,
      can_send: false,
      reason: "Email is on the suppression list."
    };
  }

  const domain = emailDomain(email);
  if (FREE_EMAIL_DOMAINS.has(domain)) {
    return {
      status: "risky_personal_email",
      requires_manual_approval: true,
      can_send: isManualApproved(prospect),
      reason: "Free/personal email domain. Keep for manual review unless explicitly approved."
    };
  }

  if (!prospect.business_name || prospect.classification === "unclassified") {
    return {
      status: "unknown_business_type",
      requires_manual_approval: true,
      can_send: isManualApproved(prospect),
      reason: "Business type is unclear. Manual review required."
    };
  }

  const siteDomain = websiteDomain(prospect.website);
  const safeBusinessDomain = siteDomain ? domain.endsWith(siteDomain) || siteDomain.endsWith(domain) : true;

  return {
    status: safeBusinessDomain ? "safe_business_domain" : "unknown_business_type",
    requires_manual_approval: !safeBusinessDomain,
    can_send: safeBusinessDomain || isManualApproved(prospect),
    reason: safeBusinessDomain
      ? "Business-domain email and non-suppressed contact."
      : "Email domain does not clearly match the website domain. Manual review required."
  };
}

function ensureOptOut(body) {
  const text = String(body || "").trim();
  if (!text) return text;
  if (/(unsubscribe|opt out|no thanks|do not contact|won't contact|will not contact)/i.test(text)) {
    return text;
  }
  return `${text}\n\n${OPT_OUT}`;
}

module.exports = {
  classifyCompliance,
  ensureOptOut,
  isManualApproved,
  OPT_OUT
};
