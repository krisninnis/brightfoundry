/**
 * lib/db.js
 * Database connection and schema management.
 * Uses better-sqlite3 — synchronous, no server process required.
 */

"use strict";

const path    = require("path");
const fs      = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH
  ? path.resolve(__dirname, "..", process.env.DB_PATH)
  : path.resolve(__dirname, "../data/prospects.db");

// Ensure the data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db = null;

/**
 * Returns a singleton database connection.
 * Tables are created on first connect.
 */
function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);

  // Performance pragmas (safe for local use)
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  applySchema(_db);

  return _db;
}

/**
 * Creates all tables if they don't exist.
 * Safe to call repeatedly — uses IF NOT EXISTS.
 */
function applySchema(db) {
  db.exec(`
    -- ─────────────────────────────────────────────────────────────────
    -- prospects
    -- Central table. One row per business.
    -- ─────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS prospects (
      id                   TEXT PRIMARY KEY,

      -- Core business data (from Google Places or manual import)
      business_name        TEXT NOT NULL,
      website              TEXT,
      contact_email        TEXT,
      contact_phone        TEXT,
      city                 TEXT,
      source               TEXT NOT NULL DEFAULT 'manual',

      -- Why this business was selected (required)
      selection_reason     TEXT NOT NULL DEFAULT 'manual-import',

      -- Google Places signals (may be null for manual imports)
      google_rating        REAL,
      review_count         INTEGER,
      place_id             TEXT,

      -- Website signal analysis (populated by scraper or score pass)
      has_contact_form     INTEGER DEFAULT 0,   -- 0/1 boolean
      primary_cta          TEXT,                -- form|phone|booking|whatsapp|none
      website_signals      TEXT,                -- JSON blob of detected signals
      website_quality      INTEGER,             -- 0-100

      -- Scoring + classification
      score                INTEGER DEFAULT 0,
      classification       TEXT DEFAULT 'unclassified',
      -- Valid values: Website Launch Sprint | Website Refresh |
      --               AI Assistant | Automation Help | Not Fit | unclassified
      classification_reason TEXT,

      -- Outreach draft (generated, never auto-sent)
      outreach_angle       TEXT,
      draft_subject        TEXT,
      draft_body           TEXT,
      draft_generated_at   TEXT,

      -- Workflow status
      status               TEXT NOT NULL DEFAULT 'new',
      -- Valid values: new | scored | draft-ready | approved | suppressed | contacted

      notes                TEXT,

      -- Deduplication hash: lower(trim(business_name)) + '|' + lower(trim(city))
      dedup_hash           TEXT UNIQUE,

      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ─────────────────────────────────────────────────────────────────
    -- suppressions
    -- Email addresses that must never be drafted for.
    -- ─────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS suppressions (
      id         TEXT PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      reason     TEXT NOT NULL DEFAULT 'manual',
      added_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ─────────────────────────────────────────────────────────────────
    -- scrape_runs
    -- Audit log of every scrape invocation.
    -- ─────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS scrape_runs (
      id             TEXT PRIMARY KEY,
      query          TEXT NOT NULL,
      city           TEXT NOT NULL,
      results_found  INTEGER DEFAULT 0,
      results_kept   INTEGER DEFAULT 0,
      run_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS send_queue (
      id                       TEXT PRIMARY KEY,
      prospect_id              TEXT UNIQUE NOT NULL,
      status                   TEXT NOT NULL DEFAULT 'queued',
      compliance_status        TEXT,
      requires_manual_approval INTEGER DEFAULT 1,
      queued_at                TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at                  TEXT,
      last_error               TEXT,
      created_at               TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS outreach_events (
      id          TEXT PRIMARY KEY,
      prospect_id TEXT,
      queue_id    TEXT,
      event_type  TEXT NOT NULL,
      status      TEXT NOT NULL,
      detail      TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE SET NULL,
      FOREIGN KEY (queue_id) REFERENCES send_queue(id) ON DELETE SET NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_prospects_status         ON prospects(status);
    CREATE INDEX IF NOT EXISTS idx_prospects_classification  ON prospects(classification);
    CREATE INDEX IF NOT EXISTS idx_prospects_score          ON prospects(score);
    CREATE INDEX IF NOT EXISTS idx_suppressions_email       ON suppressions(email);
    CREATE INDEX IF NOT EXISTS idx_send_queue_status        ON send_queue(status);
    CREATE INDEX IF NOT EXISTS idx_outreach_events_type     ON outreach_events(event_type);
  `);

  ensureColumn(db, "prospects", "website_audit", "TEXT");
  ensureColumn(db, "prospects", "website_audited_at", "TEXT");
  ensureColumn(db, "prospects", "bot_fit_score", "INTEGER DEFAULT 0");
  ensureColumn(db, "prospects", "bot_fit_signals", "TEXT");
  ensureColumn(db, "prospects", "compliance_status", "TEXT");
  ensureColumn(db, "prospects", "requires_manual_approval", "INTEGER DEFAULT 1");
  ensureColumn(db, "prospects", "manual_approved", "INTEGER DEFAULT 0");
  ensureColumn(db, "prospects", "queued_at", "TEXT");
  ensureColumn(db, "prospects", "sent_at", "TEXT");
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Build the deduplication hash for a prospect.
 * Two prospects with the same name+city are treated as duplicates.
 */
function dedupHash(businessName, city) {
  const name = String(businessName || "").toLowerCase().trim().replace(/\s+/g, " ");
  const c    = String(city || "").toLowerCase().trim();
  return `${name}|${c}`;
}

module.exports = { getDb, dedupHash };
