# BrightFoundry Prospect Research & Outreach Assistant
## Codebase Audit: leadclaw-uk + leadclaw-lead-scraper

---

## Executive Summary

Both LeadClaw repos form a complete B2B prospecting + outreach pipeline, purpose-built for UK beauty/aesthetic clinics. The core infrastructure — scraping, scoring, email sending, compliance, and outreach tracking — is almost entirely generic. Only the templates, retention behaviors, SaaS billing, and enquiry widget are clinic-specific. For an internal BrightFoundry assistant, the heavy lifting is already done.

**Estimated adaptation effort:** 2–3 weeks to strip clinic-specific code, 1–2 weeks to add BrightFoundry-specific targeting and message angle logic.

---

## 1. Lead Scraping / Google Places Logic

**Reusability: 95% — Low effort to adapt**

**Primary files:**
- `leadclaw-lead-scraper/places_run.py` — Core scraper
- `leadclaw-lead-scraper/places_batch.py` — Batch orchestrator

**What the scraper does:**
Calls Google Places Text Search + Details APIs to fetch business name, website, phone, address, Google rating, and review count. Then downloads and parses each website's HTML to extract signals: live chat presence, contact form, CTA type, booking platform links, FAQ section, and site quality.

**Key functions to reuse:**
- `text_search(query)` — Google Places Text Search call
- `place_details(place_id)` — Detailed business data fetch
- `fetch_html(url)` — Website download with timeout
- `scan_website(url)` — Signal extraction from HTML
- `extract_domain(url)` — Domain normalization
- `detect_primary_cta(html)` — CTA type detection (form, phone, WhatsApp, booking)

**What to change for BrightFoundry:**
- Replace `DEFAULT_QUERIES` (currently: beauty salon, nail bar, lash studio, etc.) with BrightFoundry target verticals (e.g. independent consultants, SaaS founders, trades businesses, service firms)
- Replace `DEFAULT_CITIES` with BrightFoundry's target geography
- Replace beauty-specific `BOOKING_PATTERNS` (Fresha, Treatwell, Phorest, Booksy) with B2B equivalents relevant to your sectors
- Scoring weights referencing `has_booking_cta` should be reconfigured or removed

---

## 2. Lead Scoring Logic

**Reusability: 90% — Low effort to adapt**

**Primary files:**
- `leadclaw-lead-scraper/places_run.py` — Scoring functions
- `leadclaw-uk/src/app/api/leads/import/route.ts` — Import-time scoring

**Three scoring layers:**

`score_lead()` — Final 0–100 lead score based on: website presence (+15), email (+20), phone (+10), Google rating, review count, live chat absence (+12), booking CTA absence (+10), contact form presence (+8), website quality.

`website_quality_score()` — 0–100 score measuring site maturity (CTA presence, FAQ, live chat, content depth).

`lead_fit_score()` — 0–100 score measuring how likely the lead is to need LeadClaw's product. Needs to be reconfigured for BrightFoundry's value proposition.

`should_keep_lead()` — Hard filter: rejects leads with no website, rating below 3.5, fewer than 5 reviews, or fit score below 40.

**What to change:** Rewrite `lead_fit_score()` around BrightFoundry's ICP signals. The scoring structure (weighted sum → clamped 0–100 → hard thresholds) is solid and should be kept.

---

## 3. Supabase Schema / Database Structure

**Reusability: 95% — Keep most of it; prune beauty-specific tables**

**Primary file:**
- `leadclaw-uk/supabase/schema.sql`

**Tables to keep as-is:**

`leads` — Central record. Fields: id, niche, company_name, website, contact_email, contact_phone, city, source, score, status (new/queued/contacted/suppressed/duplicate), notes, outreach_angle, outreach_subject, outreach_message, follow_up_stage, last_contacted_at, pecr_classification, pecr_reason, company_number.

`outreach_events` — Full event log per lead: channel, event_type (sent/failed/opened/clicked/replied/skipped), payload JSON, timestamps.

`email_suppressions` — Opt-out registry: email (unique), reason (unsubscribe/unsubscribe_link/list_unsubscribe_post), source, suppressed_at.

`profiles` — User/admin role table (client/admin roles, linked to Supabase auth.users).

**Tables to adapt:**

`subscriptions` — Keep the billing infrastructure if BrightFoundry needs per-seat access control; otherwise remove if this is a fully internal tool.

**Tables to remove entirely:**

`enquiries`, `onboarding_clients`, `onboarding_sites`, `clinics`, `retention_clients`, `retention_tasks`, `retention_events`, `widget_tokens`, `newsletter_subscribers`, `newsletter_issues` — All beauty-clinic SaaS-specific. Not relevant to an internal prospecting assistant.

**New columns to consider adding for BrightFoundry:**
- `company_size_estimate` (micro/small/medium)
- `industry` (standardized vertical)
- `linkedin_url`
- `enrichment_source` (tracks which enrichment pipeline populated the record)
- `research_notes` (for AI-generated prospect summaries)

---

## 4. Outreach Message Generation

**Reusability: 60% — Framework is solid; templates need full replacement**

**Primary files:**
- `leadclaw-lead-scraper/generate_outreach_messages.py` — Template selection + generation
- `leadclaw-uk/src/app/api/outreach/run/route.ts` — NextJS send + fallback generation

**The pattern to reuse:**

1. Detect an "angle" per lead based on website signals (e.g. `contact_form_only`, `weak_booking_flow`, `no_live_chat`)
2. Select the matching template for that angle
3. Render the template with: company_name, city, lead_id (for tracking), contact_email (for unsubscribe)
4. Store: `outreach_angle`, `outreach_subject`, `outreach_message` on the lead record
5. At send time, pull pre-generated message or fall back to inline generation

**The 3-stage follow-up sequencing to reuse:**
- Stage 0: Initial message
- Stage 1: Follow-up after 3 days
- Stage 2: Final follow-up after 4 more days
- Stage 3: No further contact

**What must be replaced:**
- All message templates (currently LeadClaw product pitch for beauty clinics)
- `choose_angle()` logic (currently: contact_form_only, weak_booking_flow, no_live_chat — these should become BrightFoundry-relevant angles)
- Email footer company details (currently: Lead Claw Ltd, Companies House No. 13546017, Whitechapel Road address)

**Opportunity:** The existing code calls OpenAI/Claude to enrich leads. The outreach generation pipeline can be upgraded to use AI for per-lead message personalization using the scraped website signals, rather than static templates.

---

## 5. Outreach Tracking

**Reusability: 100% — No changes needed**

**Primary files:**
- `leadclaw-uk/src/app/api/outreach/run/route.ts`
- `leadclaw-uk/supabase/schema.sql` (`outreach_events` table)

**Tracked events:** sent, failed, skipped (with reason), and webhook-ready for opened/clicked/replied from Resend.

**Payload captured per event:** email address, subject, email_id (Resend message ID), follow_up_stage.

**Deduplication:** Per-batch email deduplication using an in-memory Set — prevents double-sending in the same run.

**Daily cap enforcement:** Configurable via `OUTREACH_DAILY_CAP` env var (default 20). Counts today's `sent` events at run start.

**Follow-up gating:** Enforces minimum day gaps between stages (3 days before stage 1, 4 days before stage 2) by reading `last_contacted_at`.

Nothing here is clinic-specific. Copy it wholesale.

---

## 6. Email Sending / Resend Integration

**Reusability: 100% — No changes needed**

**Primary file:**
- `leadclaw-uk/src/lib/email.ts`

**What's in place:**
- `sendEmail()` — Wraps Resend SDK with consistent error handling and structured return type
- `isSuppressed()` — Checks email against suppression table before any send
- `normalizeEmail()` — Lowercases and trims before comparison
- `renderHtml()` — Converts plain text messages to styled HTML with inline unsubscribe link
- `sendFounderAlertEmail()` — Internal HTML email alerts for system events
- Resend `tags` on every send: lead_id, source, follow_up_stage — enables webhook attribution

**Only change required:** Update `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, and `FOUNDER_ALERT_EMAIL` env vars to BrightFoundry's domain and email address.

---

## 7. Compliance Safeguards

**Reusability: 95% — UK PECR framework is directly applicable**

**Primary files:**
- `leadclaw-lead-scraper/auto_pipeline.py` — PECR classification via Companies House
- `leadclaw-uk/src/app/api/unsubscribe/route.ts` — Opt-out handling
- `leadclaw-uk/src/lib/email.ts` — `isSuppressed()` pre-send check

**The full compliance stack:**

Companies House classification — Queries the UK Companies House API by business name, matches against the registry using 80% name similarity, classifies as: `corporate` (active Ltd, LLP, PLC — safe to contact under PECR), `individual` (sole trader / no registry match — requires consent), or `unknown` (manual review). Only `corporate` leads are queued for outreach.

Suppression list — `email_suppressions` table with reasons (unsubscribe, unsubscribe_link, list_unsubscribe_post). Checked pre-send via `isSuppressed()`. Updated automatically on unsubscribe link click or List-Unsubscribe-Post (RFC 8058).

Email validation blocklist — `is_bad_email()` rejects: noreply/postmaster prefixes, platform domains (Wix, WordPress, Shopify, Google, Facebook, Stripe, etc.), encoded characters, and file extension patterns. Prevents spam traps and wasted sends.

Rate limiting — Upstash Redis sliding window (20 req/min admin, 10 req/min outreach runner, 60 req/min widget). Redis implementation is fully generic.

**What to update:** Email footer must list BrightFoundry's company registration number, registered address, and privacy policy URL.

---

## 8. What Is Too SaaS-Specific or Beauty-Clinic-Specific to Reuse

**Remove these entirely:**

The **enquiry capture widget** (`/api/widget/*`, `widget_tokens` table, `onboarding_sites` table) is a JavaScript snippet installed on clinic websites to capture treatment enquiries. Irrelevant to B2B prospecting.

The **clinic onboarding workflow** (`/api/onboarding/run`, `onboarding_clients`, `onboarding_tasks`) tracks clinic signup → widget install → validation → handover. Built for a multi-tenant SaaS; not applicable to an internal tool.

The **retention automation system** (`/lib/retention.ts`, `/api/retention/run`) fires post-treatment follow-up emails to clinic clients (rebooking nudges, aftercare check-ins, treatment interval logic). Hardcoded for beauty treatments: Botox intervals at 90 days, lash fill at 21 days, spray tan at 14 days.

**The newsletter system** (`newsletter_subscribers`, `newsletter_issues`, `/api/newsletter/send`) was built to email LeadClaw's own clinic client base. Not relevant unless BrightFoundry wants a newsletter feature.

**Stripe subscription lifecycle** (`/lib/subscriptions.ts`, `/api/stripe/webhook`) handles clinic plan billing (Growth/Pro tiers). Remove if BrightFoundry is fully internal with no per-seat billing.

**All message templates** in `generate_outreach_messages.py` and `outreach/run/route.ts` pitch LeadClaw's product to beauty clinics. Every template must be rewritten.

---

## Reusability Matrix

| Component | Reusable | Effort | Notes |
|-----------|----------|--------|-------|
| Google Places scraping | 95% | Low | Change queries, cities, booking patterns |
| Lead scoring framework | 90% | Low | Reconfigure weights and fit score signals |
| Supabase leads + events schema | 95% | Low | Remove beauty-specific columns and tables |
| Outreach event tracking | 100% | None | Fully generic |
| Email sending (Resend) | 100% | None | Update env vars only |
| Rate limiting (Upstash Redis) | 100% | None | Generic |
| PECR / Companies House compliance | 95% | Low | Update footer company details |
| Unsubscribe / suppression | 100% | None | Fully generic |
| Follow-up sequencing (3 stages) | 100% | None | Generic workflow |
| HTML email renderer | 100% | None | Generic |
| Outreach message templates | 0% | High | Full rewrite required |
| Enquiry capture widget | 5% | Very High | Rebuild from scratch |
| Retention automation | 20% | High | Framework reusable; behaviors must be redesigned |
| Clinic onboarding workflow | 10% | Very High | Rebuild for B2B sales context |
| Stripe subscription billing | 50% | Medium | Keep if billing needed; remove if internal tool |
| Newsletter system | 50% | Medium | Reusable for general mailing |

---

## Suggested Folder Structure: BrightFoundry Internal Tool

```
brightfoundry-prospector/
├── scraper/
│   ├── places_scraper.py          # Adapted from places_run.py
│   ├── batch_runner.py            # Adapted from places_batch.py
│   ├── email_enricher.py          # Adapted from enrich_emails.py
│   └── targets/
│       └── brightfoundry_targets.py  # BrightFoundry-specific queries + cities
│
├── pipeline/
│   ├── auto_pipeline.py           # Adapted from auto_pipeline.py
│   ├── compliance_classifier.py   # Adapted PECR / Companies House logic
│   ├── suppression_check.py       # Adapted from suppression logic
│   └── outreach_generator.py      # NEW: BrightFoundry message templates + AI generation
│
├── app/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── email.ts           # Copied from leadclaw-uk (update env vars)
│   │   │   ├── rate-limit.ts      # Copied from leadclaw-uk (no changes)
│   │   │   └── supabase.ts        # Copied from leadclaw-uk (no changes)
│   │   └── app/
│   │       └── api/
│   │           ├── outreach/
│   │           │   └── run/       # Adapted from outreach/run/route.ts
│   │           ├── unsubscribe/   # Copied from leadclaw-uk (no changes)
│   │           └── leads/
│   │               └── import/    # Adapted from leads/import/route.ts
│   └── package.json
│
├── supabase/
│   └── schema.sql                 # Trimmed schema: leads, outreach_events, email_suppressions, profiles
│
└── .env.example
    # GOOGLE_PLACES_API_KEY
    # SUPABASE_URL
    # SUPABASE_SERVICE_ROLE_KEY
    # RESEND_API_KEY
    # RESEND_FROM_EMAIL
    # COMPANIES_HOUSE_API_KEY
    # UPSTASH_REDIS_REST_URL
    # UPSTASH_REDIS_REST_TOKEN
    # OUTREACH_DAILY_CAP
    # FOUNDER_ALERT_EMAIL
```

---

## Minimal Implementation Plan

**Phase 1 — Database (Days 1–2)**

Create a new Supabase project. Run the trimmed `schema.sql` with: `leads`, `outreach_events`, `email_suppressions`, and `profiles` tables. Remove all beauty-clinic tables. Add BrightFoundry-specific columns to `leads`: `industry`, `company_size_estimate`, `linkedin_url`, `research_notes`.

**Phase 2 — Scraper Adaptation (Days 3–5)**

Copy `places_run.py` to `brightfoundry-prospector/scraper/places_scraper.py`. Replace `DEFAULT_QUERIES` with BrightFoundry target verticals. Replace `BOOKING_PATTERNS` with relevant B2B signals. Rewrite `lead_fit_score()` around BrightFoundry's ideal prospect profile. Test against a single city and 2–3 query types.

**Phase 3 — Compliance Pipeline (Days 6–7)**

Copy and adapt `auto_pipeline.py`: keep Companies House classification, suppression check, and email validation blocklist. Configure `COMPLIANCE_ENABLED=1`. Run classification on any existing leads before importing.

**Phase 4 — Email Infrastructure (Days 8–9)**

Copy `src/lib/email.ts` and `src/lib/rate-limit.ts` verbatim. Update `RESEND_FROM_EMAIL` to BrightFoundry's sending domain. Verify domain in Resend dashboard. Test suppression check with a known suppressed address.

**Phase 5 — Outreach Message Generation (Days 10–12)**

Write BrightFoundry-specific outreach angles (minimum 3: e.g. `no_digital_presence`, `weak_website`, `growth_signal_detected`). Write matching subject + body templates for each angle. Wire into `choose_angle()` logic. Update email footer with BrightFoundry's company details and privacy policy URL.

**Phase 6 — Outreach Runner (Days 13–14)**

Adapt `outreach/run/route.ts`: keep all tracking, rate limiting, deduplication, and follow-up stage logic. Update lead query filters for BrightFoundry's scoring thresholds and target `niche` values. Test with `OUTREACH_DAILY_CAP=3` and verify events are written to `outreach_events`.

**Phase 7 — Testing + Hardening (Days 15–17)**

End-to-end test: scrape → score → classify → generate message → send to internal test email → verify event log. Confirm unsubscribe link works and writes to `email_suppressions`. Confirm suppressed emails are skipped in subsequent runs. Review follow-up stage gating (3-day and 4-day gaps).

---

## Migration Risks

**Supabase RLS policies** — The existing schema has RLS configured for a multi-tenant SaaS. For an internal tool, simplify: grant service-role full access, restrict anon/authenticated as needed. Audit all policies before go-live.

**Resend sender verification** — The outreach runner has a special error path that halts the batch if the sending domain is not verified. Verify BrightFoundry's domain in Resend before any live send.

**Companies House API rate limits** — The free tier allows ~600 requests/day. For large scrape batches, batch the classification step separately from the scrape step, or add a delay between requests.

**Email blocklist currency** — The `BLOCKED_SUBSTRINGS` list in `auto_pipeline.py` was last maintained for beauty clinic contexts. Review and extend it for B2B domains you expect to encounter (e.g. accounting software platforms, CRM vendors, etc.).

**Google Places API costs** — Text Search costs ~$32 per 1,000 queries; Details costs ~$17 per 1,000 calls. At typical scrape volumes (50 queries × 20 cities = 1,000 searches + details), expect $50–$80 per full scrape run. Budget accordingly.

**Follow-up stage drift** — If leads are imported with a non-zero `follow_up_stage` or `last_contacted_at` value (e.g. migrated from LeadClaw), the gating logic will behave unexpectedly. Normalize these fields to `0` and `null` on import for any fresh BrightFoundry leads.

---

*Audit generated: May 2026. Based on full source review of leadclaw-uk and leadclaw-lead-scraper. No files were modified.*
