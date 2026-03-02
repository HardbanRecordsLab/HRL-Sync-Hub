const jwt = require("jsonwebtoken");
const { queryOne } = require("../db/pool");

const USE_SUPABASE = process.env.USE_SUPABASE_AUTH !== "false";

let supabase;
if (USE_SUPABASE) {
  const { createClient } = require("@supabase/supabase-js");
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const authMiddleware = async (req, res, next) => {
  const header = req.headers.authorization;
  let token = null;
  if (header?.startsWith("Bearer ")) {
    token = header.slice(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization" });
  }

  try {
    if (USE_SUPABASE) {
      // Verify via Supabase (returns Supabase user)
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: "Invalid token" });

      // Look up / upsert in our own users table
      let dbUser = await queryOne("SELECT * FROM users WHERE id = $1", [user.id]);
      if (!dbUser) {
        dbUser = await queryOne(
          `INSERT INTO users (id, email, full_name) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email RETURNING *`,
          [user.id, user.email, user.user_metadata?.full_name ?? null]
        );
      }
      req.user = dbUser;
      req.userId = dbUser.id;
    } else {
      // Pure JWT mode
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const dbUser = await queryOne("SELECT * FROM users WHERE id = $1", [payload.sub]);
      if (!dbUser) return res.status(401).json({ error: "User not found" });
      req.user = dbUser;
      req.userId = dbUser.id;
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Authentication failed" });
  }
};

// Optional — doesn't 401, just populates req.user if valid
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const token = header.slice(7);
      if (USE_SUPABASE && supabase) {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          req.user = await queryOne("SELECT * FROM users WHERE id = $1", [user.id]);
          req.userId = user.id;
        }
      } else {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await queryOne("SELECT * FROM users WHERE id = $1", [payload.sub]);
        if (req.user) req.userId = req.user.id;
      }
    }
  } catch { }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.is_admin) return res.status(403).json({ error: "Admin required" });
  next();
};

module.exports = authMiddleware;
module.exports.optionalAuth = optionalAuth;
module.exports.requireAdmin = requireAdmin;
