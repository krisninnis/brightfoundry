/**
 * lib/scraper.js
 * Google Places API adapter for BrightFoundry prospect discovery.
 *
 * Uses the official Google Places API (Text Search + Place Details).
 * No CAPTCHA bypassing. No scraping of private data.
 * Only fetches publicly listed business information.
 *
 * Rate: one API call per SCRAPE_DELAY_MS (default 1 second).
 * Volume: capped by SCRAPE_RUN_CAP (default 30 total results).
 */

"use strict";

const axios    = require("axios");
const path     = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const PLACES_TEXT_SEARCH_URL =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACES_DETAILS_URL =
  "https://maps.googleapis.com/maps/api/place/details/json";

const API_KEY      = process.env.GOOGLE_PLACES_API_KEY || "";
const DELAY_MS     = Number(process.env.SCRAPE_DELAY_MS) || 1000;
const PAGE_SIZE    = Math.min(Number(process.env.SCRAPE_PAGE_SIZE) || 20, 20);

const DETAILS_FIELDS = [
  "name",
  "website",
  "formatted_phone_number",
  "formatted_address",
  "rating",
  "user_ratings_total",
  "place_id",
].join(",");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDomain(url) {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : "https://" + url).hostname
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Patterns that indicate the "website" is really a social or directory link
const SOCIAL_DOMAINS = [
  "facebook.com", "instagram.com", "linktr.ee", "linktree.com",
  "twitter.com", "tiktok.com", "youtube.com", "yelp.com",
  "yell.com", "google.com", "tripadvisor.com",
];

function isSocialOrDirectoryUrl(url) {
  if (!url) return false;
  const domain = extractDomain(url) || "";
  return SOCIAL_DOMAINS.some(s => domain.includes(s));
}

/**
 * Attempt to fetch a business website's HTML.
 * Returns null on failure — never throws.
 */
async function fetchHtml(url) {
  if (!url) return null;
  try {
    const resp = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BrightFoundryBot/1.0; +https://brightfoundry.co.uk)",
        Accept: "text/html",
      },
      validateStatus: s => s < 400,
    });
    if (typeof resp.data === "string") return resp.data;
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a Google Places Text Search query.
 *
 * @param {string} query  e.g. "plumber London"
 * @returns {Promise<Array>}  raw place results
 */
async function textSearch(query) {
  if (!API_KEY) throw new Error("GOOGLE_PLACES_API_KEY is not set in .env");

  const resp = await axios.get(PLACES_TEXT_SEARCH_URL, {
    params: { query, key: API_KEY },
    timeout: 15000,
  });

  if (resp.data.status !== "OK" && resp.data.status !== "ZERO_RESULTS") {
    throw new Error(`Places Text Search error: ${resp.data.status} — ${resp.data.error_message || ""}`);
  }

  return resp.data.results || [];
}

/**
 * Fetch detailed information for a single Place ID.
 *
 * @param {string} placeId
 * @returns {Promise<object>}
 */
async function placeDetails(placeId) {
  if (!API_KEY) throw new Error("GOOGLE_PLACES_API_KEY is not set in .env");

  const resp = await axios.get(PLACES_DETAILS_URL, {
    params: { place_id: placeId, fields: DETAILS_FIELDS, key: API_KEY },
    timeout: 15000,
  });

  if (resp.data.status !== "OK") {
    throw new Error(`Places Details error: ${resp.data.status}`);
  }

  return resp.data.result || {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scrape function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scrape prospects for a single query + city combination.
 *
 * @param {object} opts
 * @param {string} opts.query          e.g. "independent café"
 * @param {string} opts.city           e.g. "Manchester"
 * @param {string} opts.selectionReason  Why we're targeting this type of business
 * @param {number} opts.cap            Max results to return
 * @param {function} [opts.onProgress]  Called with a status string after each business
 *
 * @returns {Promise<Array>} Normalised prospect objects ready to insert into DB
 */
async function scrapeQuery({ query, city, selectionReason, cap = 20, onProgress }) {
  const fullQuery = `${query} ${city}`;
  const results   = [];

  onProgress?.(`Searching: "${fullQuery}"`);

  let raw;
  try {
    raw = await textSearch(fullQuery);
  } catch (err) {
    onProgress?.(`  ✗ Search failed: ${err.message}`);
    return [];
  }

  onProgress?.(`  Found ${raw.length} results from Places API`);

  for (const place of raw.slice(0, cap)) {
    await sleep(DELAY_MS);

    const placeId = place.place_id;
    if (!placeId) continue;

    let details = {};
    try {
      details = await placeDetails(placeId);
    } catch (err) {
      onProgress?.(`  ✗ Details failed for ${place.name}: ${err.message}`);
      continue;
    }

    const website     = details.website || null;
    const phone       = details.formatted_phone_number || null;
    const address     = details.formatted_address || "";
    const rating      = details.rating || null;
    const reviewCount = details.user_ratings_total || 0;
    const name        = details.name || place.name || "Unknown";

    // Attempt to fetch website HTML for signal scanning
    const effectiveUrl = (website && !isSocialOrDirectoryUrl(website)) ? website : null;
    let html = null;

    if (effectiveUrl) {
      await sleep(Math.round(DELAY_MS / 2)); // shorter delay for HTML fetch
      html = await fetchHtml(effectiveUrl);
    }

    // Determine the selection reason context
    const resolvedReason = selectionReason ||
      `Matched query "${query}" in ${city} — Google Places public listing`;

    const prospect = {
      name,
      website:     website || null,
      phone,
      address,
      city,
      rating,
      reviewCount,
      placeId,
      html,           // raw HTML for signal scanning (not stored directly)
      selectionReason: resolvedReason,
      source:       "google_places",
      query,
    };

    results.push(prospect);
    onProgress?.(`  ✓ ${name} (rating: ${rating ?? "n/a"}, reviews: ${reviewCount})`);
  }

  return results;
}

module.exports = {
  scrapeQuery,
  fetchHtml,
  extractDomain,
  isSocialOrDirectoryUrl,
};
