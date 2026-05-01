// dev-static.js
// Simple rewrite-capable static server for BrightFoundry (multi-page + portal pretty URLs)

const express = require("express");
const path = require("path");

const app = express();
const ROOT = path.join(__dirname, "public-site");
const PORT = process.env.PORT || 5055;

// Pretty URL rewrites for portal
const rewrites = new Map([
  ["/portal/login", "/portal/login.html"],
  ["/portal/register", "/portal/register.html"],
  ["/portal/dashboard", "/portal/dashboard.html"],
  ["/portal/projects", "/portal/projects.html"],
  ["/portal/messages", "/portal/messages.html"],
  ["/portal/files", "/portal/files.html"],
  ["/portal/support", "/portal/support.html"],
  ["/portal/invoices", "/portal/invoices.html"],
  ["/portal/timeline", "/portal/timeline.html"],
  ["/portal/settings", "/portal/settings.html"]
]);

app.use((req, res, next) => {
  const url = req.path.replace(/\/+$/, ""); // trim trailing slash
  const target = rewrites.get(url);
  if (target) return res.sendFile(path.join(ROOT, target));
  next();
});

app.use(express.static(ROOT, { extensions: ["html"] }));

app.listen(PORT, () => {
  console.log(`Static site running on http://127.0.0.1:${PORT}`);
});
