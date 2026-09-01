const jwt = require("jsonwebtoken");
const { queryOne } = require("../db/pool");

// index.js validates JWT_SECRET at boot; read lazily so tooling that only needs
// other exports (migrations, seeds) can still require this file.
const JWT_SECRET = process.env.JWT_SECRET;

/** Pull a bearer token from the Authorization header or ?token= (used by <audio> streaming). */
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  if (req.query && typeof req.query.token === "string") return req.query.token;
  return null;
}

async function loadUser(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  const userId = payload.sub || payload.userId;
  if (!userId) return null;
  return queryOne("SELECT * FROM users WHERE id = $1", [userId]);
}

/** Hard auth — 401 if no valid token / unknown user. */
const authMiddleware = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Missing Authorization" });

  try {
    const user = await loadUser(token);
    if (!user) return res.status(401).json({ error: "Invalid token" });
    req.user = user;
    req.userId = user.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Authentication failed" });
  }
};

/** Soft auth — never 401, just populates req.user when a valid token is present. */
const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      const user = await loadUser(token);
      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    } catch {
      /* ignore — anonymous request */
    }
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.is_admin) return res.status(403).json({ error: "Admin required" });
  next();
};

module.exports = authMiddleware;
module.exports.optionalAuth = optionalAuth;
module.exports.requireAdmin = requireAdmin;
