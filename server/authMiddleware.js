// server/authMiddleware.js
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || "brightfoundry";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "brightfoundry-portal";

// Only allow HMAC SHA-256 tokens
const ALLOWED_ALGS = ["HS256"];

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers["authorization"] || "";
    const parts = authHeader.split(" ");
    const scheme = parts[0];
    const token = parts[1];

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ message: "Missing or invalid authorization" });
    }

    if (!JWT_SECRET) {
      // Misconfiguration: don’t proceed (avoid accepting unsigned/invalid tokens)
      return res.status(500).json({ message: "Server auth misconfigured" });
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ALLOWED_ALGS,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      clockTolerance: 5, // seconds of leeway for clock skew
    });

    // We store the user id in sub
    const userId = Number(decoded.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.userId = userId;
    req.userRole = decoded.role || null;

    return next();
  } catch (err) {
    // Don’t leak details (expired vs invalid)
    return res.status(401).json({ message: "Unauthorized" });
  }
}

module.exports = { authenticateToken };
