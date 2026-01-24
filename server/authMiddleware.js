// authMiddleware.js
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}


// Read + verify JWT, attach user info to req.user
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (!token || scheme !== "Bearer") {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const id = Number(payload?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = {
      id,
      email: typeof payload?.email === "string" ? payload.email : null,
      role: typeof payload?.role === "string" ? payload.role : "client",
    };

    // Back-compat with older handlers
    req.userId = id;
    req.userRole = req.user.role;

    next();
  } catch (err) {
    // Do not log the token; keep logs minimal by default
    console.warn("JWT verify failed:", err?.message || err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { authenticateToken };
