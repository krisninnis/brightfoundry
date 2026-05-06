"use strict";

const { buildSendQueue } = require("../lib/queue");

function main() {
  console.log("BrightFoundry Prospecting - Build Send Queue");
  console.log("-".repeat(48));
  console.log("Queueing only approved/safe, non-suppressed prospects with drafts.\n");

  const { stats, queued } = buildSendQueue();

  for (const item of queued) {
    console.log(`  queued: ${item.business_name} <${item.contact_email}> | ${item.classification} | score ${item.score}`);
  }

  if (queued.length === 0) {
    console.log("  No new queue rows created.");
  }

  console.log("\n" + "-".repeat(48));
  console.log("Queue build complete:");
  console.log(`  Considered:              ${stats.considered}`);
  console.log(`  Newly queued:            ${stats.queued}`);
  console.log(`  Already queued:          ${stats.already_queued}`);
  console.log(`  Skipped low score:       ${stats.skipped_low_score}`);
  console.log(`  Skipped not fit:         ${stats.skipped_not_fit}`);
  console.log(`  Skipped no draft:        ${stats.skipped_no_draft}`);
  console.log(`  Skipped compliance:      ${stats.skipped_compliance}`);
  console.log(`  Skipped suppressed:      ${stats.skipped_suppressed}`);
  console.log(`  Skipped already sent:    ${stats.skipped_sent}`);
}

main();
