// server/server.js
const express = require("express");

const app = express();
const PORT = process.env.PORT || 4000;

// Basic JSON parsing
app.use(express.json());

// Very simple CORS so the portal (running in the browser) can call the API
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Simple root route (so you don't see "Cannot GET /")
app.get("/", (req, res) => {
  res.send("BrightFoundry API is running");
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "BrightFoundry API" });
});

// --- Demo projects data (for now this is our "database") ---
const projects = [
  {
    id: 1,
    name: "Bright Bakery website",
    status: "In progress",
    phase: "Design & build",
    updated: "2 days ago",
  },
  {
    id: 2,
    name: "Coaching landing page",
    status: "Reviewing",
    phase: "Content & copy",
    updated: "5 days ago",
  },
  {
    id: 3,
    name: "Client portal prototype",
    status: "In progress",
    phase: "Development",
    updated: "Today",
  },
  {
    id: 4,
    name: "Brand refresh",
    status: "Completed",
    phase: "Launched",
    updated: "Last week",
  },
];

// --- Demo files data (for now this is our "database" for files) ---
const files = [
  {
    id: "FILE-001",
    name: "homepage-layout-v3.png",
    project: "Bright Bakery website",
    uploaded: "Today",
  },
  {
    id: "FILE-002",
    name: "brand-colours-guide.pdf",
    project: "Brand refresh",
    uploaded: "2 days ago",
  },
  {
    id: "FILE-003",
    name: "portal-wireframes-notes.docx",
    project: "Client portal prototype",
    uploaded: "5 days ago",
  },
  {
    id: "FILE-004",
    name: "coaching-landing-copy-v2.docx",
    project: "Coaching landing page",
    uploaded: "1 week ago",
  },
];

// --- Demo messages data (for now this is our "database" for messages) ---
const messages = [
  {
    id: "MSG-101",
    subject: "Homepage layout feedback",
    preview: "Updated the hero section as discussed – what do you think?",
    updated: "Today",
    project: "Bright Bakery website",
  },
  {
    id: "MSG-102",
    subject: "Colour palette options",
    preview: "Version B feels closer to our brand colours.",
    updated: "Yesterday",
    project: "Brand refresh",
  },
  {
    id: "MSG-103",
    subject: "Launch date confirmation",
    preview: "We’re on track for the launch window we discussed.",
    updated: "3 days ago",
    project: "Client portal prototype",
  },
];

// --- API ROUTES ---

// GET /api/projects  → return the list
app.get("/api/projects", (req, res) => {
  res.json({ projects });
});

// GET /api/files  → return the list of files
app.get("/api/files", (req, res) => {
  res.json({ files });
});

// GET /api/messages → return the list of messages/threads
app.get("/api/messages", (req, res) => {
  res.json({ messages });
});

// Start server
app.listen(PORT, () => {
  console.log(`BrightFoundry API running on http://localhost:${PORT}`);
});
