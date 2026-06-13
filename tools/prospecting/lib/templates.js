/**
 * lib/templates.js
 * Claw Labs outreach draft templates.
 *
 * These are STARTING POINTS for manual review — not final copy.
 * Kristian should personalise before sending.
 *
 * All templates include:
 *  - Claw Labs branding throughout
 *  - An opt-out sentence
 *  - A clear, honest value proposition
 *  - No pressure or urgency tactics
 *
 * Angles match the classification categories:
 *  - no_website        → Website Launch Sprint
 *  - outdated_website  → Website Refresh
 *  - weak_enquiry      → Website Refresh (conversion-focused)
 *  - ai_opportunity    → AI Assistant
 *  - automation        → Automation Help
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Template definitions
// Each function receives a context object and returns { subject, body }.
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES = {

  /**
   * For businesses with no website (or social/directory only).
   */
  no_website({ businessName, city }) {
    return {
      subject: `Quick thought for ${businessName}`,
      body: `Hi,

I came across ${businessName} while looking at local businesses in ${city} and noticed you don't currently have a dedicated website.

I'm Kristian from Claw Labs — we build clean, professional websites for small businesses, usually launched within a couple of weeks.

Having your own site means customers can find you on Google, learn what you offer, and get in touch directly — all without relying on social platforms you don't control.

If this is something you've been thinking about, I'd be happy to have a quick informal chat. No obligation at all.

Happy to send over a few examples of recent work if that would help.

Best,
Kristian
Claw Labs
brightfoundry.co.uk

---
If you'd prefer not to hear from me, just reply with "unsubscribe" and I won't contact you again.
`.trim(),
    };
  },

  /**
   * For businesses with an outdated or low-quality website.
   */
  outdated_website({ businessName, city }) {
    return {
      subject: `A small thought on your website, ${businessName}`,
      body: `Hi,

I was looking at local businesses in ${city} and had a look at your website. It's clear you're doing good work — I just wondered whether your site is currently doing justice to that.

I'm Kristian from Claw Labs. We help small businesses refresh their websites so they look the part, load fast on mobile, and make it easy for customers to get in touch.

A refresh doesn't have to mean a full rebuild — sometimes it's targeted improvements to layout, copy, and speed that make a real difference.

If you're open to it, I'm happy to take a look and share a few thoughts. No hard sell, just honest feedback.

Best,
Kristian
Claw Labs
brightfoundry.co.uk

---
If you'd prefer not to hear from me, just reply with "unsubscribe" and I won't be in touch again.
`.trim(),
    };
  },

  /**
   * For businesses with a website but no clear way for customers to enquire.
   */
  weak_enquiry({ businessName, city }) {
    return {
      subject: `One thing I noticed about ${businessName}'s website`,
      body: `Hi,

I was looking at businesses in ${city} and took a quick look at your site. The business looks great — I just noticed it's not immediately obvious how a new customer would get in touch or enquire.

I'm Kristian from Claw Labs. We help small businesses make sure their websites are actually converting visitors into enquiries — whether that's adding a simple contact form, a clearer call-to-action, or a more intuitive layout.

It's often a smaller change than people expect, and it can make a meaningful difference to how many new enquiries you receive.

If you'd find it useful, I'm happy to do a quick review and share a couple of specific suggestions. No charge for the initial look.

Best,
Kristian
Claw Labs
brightfoundry.co.uk

---
If you'd prefer not to hear from me, just reply "unsubscribe" and I'll remove you from my list.
`.trim(),
    };
  },

  /**
   * For businesses with a good website that could benefit from an AI chat assistant.
   */
  ai_opportunity({ businessName, city }) {
    return {
      subject: `A quick idea for ${businessName}`,
      body: `Hi,

I came across ${businessName} and had a quick look at your website.

I'm Kristian from Claw Labs. One thing I've been helping local businesses with recently is adding a simple AI assistant to their site — something that can answer common questions from visitors 24/7, capture enquiries out of hours, and reduce the back-and-forth on basic queries.

It's not a complex chatbot or a big project — more like a knowledgeable assistant that knows your business and is always available.

Might be worth a 15-minute chat to see if it's a good fit. Happy to show you a quick demo.

Best,
Kristian
Claw Labs
brightfoundry.co.uk

---
If you'd prefer not to hear from me, just reply "unsubscribe" and I won't contact you again.
`.trim(),
    };
  },

  /**
   * For businesses that look operationally established and could benefit from automation.
   */
  automation({ businessName, city }) {
    return {
      subject: `Saving time at ${businessName}`,
      body: `Hi,

I was looking at businesses in ${city} and noticed that ${businessName} looks well established — which usually means there's a fair amount going on behind the scenes.

I'm Kristian from Claw Labs. We help small businesses automate the repetitive admin that eats into the working day — things like appointment reminders, follow-up emails, document generation, or connecting tools that don't currently talk to each other.

It's not about replacing people — it's about removing the tasks that shouldn't need a person at all.

If there's a particular process that always feels like a time drain, I'd be happy to have a quick chat and see if there's a straightforward fix.

Best,
Kristian
Claw Labs
brightfoundry.co.uk

---
If you'd prefer not to hear from me, reply "unsubscribe" and I'll remove you from my list.
`.trim(),
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Angle selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Choose the appropriate template angle for a classified prospect.
 *
 * @param {object} prospect  DB row with classification + website_signals
 * @returns {{ angle: string, subject: string, body: string }}
 */
function chooseDraft(prospect) {
  const classification = prospect.classification || "unclassified";
  const signals        = parseSignals(prospect.website_signals);
  const hasWebsite     = Boolean(prospect.website && prospect.website.trim());

  const ctx = {
    businessName: prospect.business_name || "your business",
    city:         prospect.city || "your area",
  };

  let angle;
  let draft;

  if (classification === "Website Launch Sprint" || !hasWebsite) {
    angle = "no_website";
    draft = TEMPLATES.no_website(ctx);
  } else if (classification === "AI Assistant") {
    angle = "ai_opportunity";
    draft = TEMPLATES.ai_opportunity(ctx);
  } else if (classification === "Automation Help") {
    angle = "automation";
    draft = TEMPLATES.automation(ctx);
  } else if (classification === "Website Refresh") {
    // Sub-angle: conversion-focused if enquiry path is the issue
    if (hasWebsite && !signals.has_contact_form) {
      angle = "weak_enquiry";
      draft = TEMPLATES.weak_enquiry(ctx);
    } else {
      angle = "outdated_website";
      draft = TEMPLATES.outdated_website(ctx);
    }
  } else {
    // Fallback
    angle = "outdated_website";
    draft = TEMPLATES.outdated_website(ctx);
  }

  return {
    angle,
    subject: draft.subject,
    body:    draft.body,
  };
}

function parseSignals(raw) {
  if (!raw) return {};
  try {
    return typeof raw === "object" ? raw : JSON.parse(raw);
  } catch {
    return {};
  }
}

module.exports = { chooseDraft, TEMPLATES };
