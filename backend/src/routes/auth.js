const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query, queryOne } = require("../db/pool");
const authMiddleware = require("../middleware/auth");
const { requireAdmin } = require("../middleware/auth");
const driveService = require("../services/googleDrive");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, is_admin: user.is_admin },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, issuer: "hrl-sync" }
  );
}

function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const user = await queryOne("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);
  const ok = user?.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !ok) return res.status(401).json({ error: "Invalid email or password" });

  res.json({ token: signToken(user), user: publicUser(user) });
});

// ── POST /api/auth/register (admin-only — no public sign-up) ──────────────────
router.post("/register", authMiddleware, requireAdmin, async (req, res) => {
  const { email, password, full_name, company_name, is_admin = false } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const existing = await queryOne("SELECT id FROM users WHERE lower(email) = lower($1)", [email]);
  if (existing) return res.status(409).json({ error: "A user with that email already exists" });

  const hash = await bcrypt.hash(password, 12);
  const { rows: [user] } = await query(
    `INSERT INTO users (email, password_hash, full_name, company_name, is_admin)
     VALUES (lower($1), $2, $3, $4, $5) RETURNING *`,
    [email, hash, full_name || null, company_name || null, !!is_admin]
  );
  res.status(201).json({ user: publicUser(user) });
});

// ── POST /api/auth/logout (stateless — client discards token) ────────────────
router.post("/logout", (req, res) => res.json({ success: true }));

// ── GET /api/auth/google/callback — Google Drive OAuth redirect target ───────
router.get("/google/callback", async (req, res) => {
  const frontend = process.env.FRONTEND_URL || "http://localhost:8080";
  const fail = (reason) => res.redirect(`${frontend}/settings?tab=integrations&drive=error&reason=${reason}`);

  const { code, state, error } = req.query;
  if (error || !code || !state) return fail(error || "missing_code");

  const userId = driveService.verifyState(state);
  if (!userId) return fail("bad_state");

  try {
    const tokens = await driveService.exchangeCode(code);
    await driveService.saveTokens(userId, tokens);
    res.redirect(`${frontend}/settings?tab=integrations&drive=connected`);
  } catch (e) {
    res.redirect(`${frontend}/settings?tab=integrations&drive=error&reason=exchange_failed`);
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", authMiddleware, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ── PATCH /api/auth/me ───────────────────────────────────────────────────────
router.patch("/me", authMiddleware, async (req, res) => {
  const { full_name, company_name, avatar_url } = req.body || {};
  const sets = [], params = [];
  if (full_name !== undefined) { params.push(full_name); sets.push(`full_name=$${params.length}`); }
  if (company_name !== undefined) { params.push(company_name); sets.push(`company_name=$${params.length}`); }
  if (avatar_url !== undefined) { params.push(avatar_url); sets.push(`avatar_url=$${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.userId);
  const { rows: [user] } = await query(
    `UPDATE users SET ${sets.join(",")}, updated_at=now() WHERE id=$${params.length} RETURNING *`,
    params
  );
  res.json({ user: publicUser(user) });
});

// ── POST /api/auth/change-password ──────────────────────────────────────────
router.post("/change-password", authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ error: "current_password + new_password required" });
  if (new_password.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  const user = await queryOne("SELECT password_hash FROM users WHERE id=$1", [req.userId]);
  const ok = user?.password_hash ? await bcrypt.compare(current_password, user.password_hash) : false;
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

  const hash = await bcrypt.hash(new_password, 12);
  await query("UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2", [hash, req.userId]);
  res.json({ success: true });
});

module.exports = router;
