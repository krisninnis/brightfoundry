# BrightFoundry Prospecting Tool

Internal prospect research, website auditing, queueing, and safe outreach assistant.

Live email sending is disabled by default. `AUTO_SEND=false` and `REQUIRE_MANUAL_APPROVAL=true` are the safe defaults. Nothing sends unless `.env` is deliberately configured for live sending, and live sending is blocked unless manual approval remains required.

## What It Does

1. Imports or scrapes public business prospects.
2. Audits each website with one polite page request.
3. Scores website opportunity and AI assistant fit.
4. Classifies prospects into Website Launch Sprint, Website Refresh, AI Assistant, Automation Help, or Not Fit.
5. Generates draft outreach with opt-out wording.
6. Checks compliance risk and suppression status.
7. Builds a send queue only for high-score, non-suppressed prospects with drafts.
8. Runs a daily sender in dry-run mode by default, capped at 10/day.
9. Logs every send attempt or dry-run attempt to `outreach_events`.

## Setup

```bash
cd tools/prospecting
npm install
cp .env.example .env
npm run init
```

Add `GOOGLE_PLACES_API_KEY` only if you plan to use the scraper.

## Audit Flow

Import a CSV:

```bash
npm run import -- --file ./real-prospects.csv
```

Audit websites:

```bash
npm run audit
```

Use `--all` to re-audit existing rows:

```bash
npm run audit -- --all
```

The audit detects website presence, load status, HTTPS, title/meta, mobile viewport, contact/quote/booking language, forms, phone links, booking links, testimonials/reviews wording, copyright year, and weak-site notes.

## Draft And Queue Flow

Generate drafts:

```bash
npm run drafts
```

Regenerate drafts after a re-audit:

```bash
npm run drafts -- --regen
```

Build the send queue:

```bash
npm run queue
```

Queue rules:

- `score >= 70`
- classification is not `Not Fit`
- email is not suppressed
- draft subject and body exist
- compliance is safe, or the row is manually approved
- prospect has not already been sent

Queued does not mean approved. The queue is a holding area for eligible prospects; live sending still requires the prospect to be explicitly approved with `status='approved'` or `manual_approved=1`.

## Dry-Run Send Flow

Default daily send:

```bash
npm run send-daily
```

With the default `.env`, this prints what would be sent and logs a dry-run event. It does not send live emails.

Daily sending is hard capped at 10/day even if `DAILY_SEND_LIMIT` is set higher.

## Live Sending Safety Switches

Live sending requires all of the following:

```env
AUTO_SEND=true
REQUIRE_MANUAL_APPROVAL=true
RESEND_API_KEY=...
RESEND_FROM_EMAIL=hello@yourdomain.com
```

`AUTO_SEND=true` is blocked if `REQUIRE_MANUAL_APPROVAL=false`. This is a hard safety guard, not just a recommendation.

When `REQUIRE_MANUAL_APPROVAL=true`, `send-daily` only sends prospects marked as approved (`status='approved'` or `manual_approved=1`).

The mailer uses Resend text emails only. It does not add tracking pixels.

## Daily Report

```bash
npm run report
```

Shows prospects found, audited, actionable, queued, sent today, dry-run sends today, suppressed contacts, manual approval status, replies if manually logged, and classification/compliance breakdowns.

## Suppression

Suppress a contact:

```bash
npm run suppress -- --email someone@example.com --reason "asked not to be contacted"
```

List suppressions:

```bash
npm run suppress -- --list
```

Suppressed emails are never queued or sent.

## Compliance Reminders

- No mass emailing.
- No live email by default.
- Maximum 10/day.
- Store why each business was contacted via `selection_reason`.
- Use public business data only.
- Do not bypass CAPTCHAs.
- Do not scrape aggressively.
- Always keep opt-out wording in drafts.
- Manual review is required for personal/free email domains.

## Useful Commands

```bash
npm run init
npm run import -- --file ./real-prospects.csv
npm run audit -- --all
npm run drafts -- --regen
npm run queue
npm run send-daily
npm run report
npm run export
```
