"use strict";

const axios = require("axios");

function boolEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  return String(value).toLowerCase() === "true";
}

function intEnv(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : defaultValue;
}

function getSendConfig() {
  const requestedLimit = intEnv("DAILY_SEND_LIMIT", 10);
  return {
    autoSend: boolEnv("AUTO_SEND", false),
    requireManualApproval: boolEnv("REQUIRE_MANUAL_APPROVAL", true),
    dailySendLimit: Math.min(10, requestedLimit),
    resendApiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.RESEND_FROM_EMAIL || ""
  };
}

async function sendEmail({ to, subject, text }, config = getSendConfig()) {
  if (!config.autoSend) {
    return {
      sent: false,
      dryRun: true,
      message: "AUTO_SEND=false; no email sent."
    };
  }

  if (!config.resendApiKey || !config.fromEmail) {
    throw new Error("AUTO_SEND=true requires RESEND_API_KEY and RESEND_FROM_EMAIL.");
  }

  const response = await axios.post(
    "https://api.resend.com/emails",
    {
      from: config.fromEmail,
      to: [to],
      subject,
      text
    },
    {
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  return {
    sent: true,
    dryRun: false,
    providerId: response.data?.id || null
  };
}

module.exports = {
  getSendConfig,
  sendEmail
};
