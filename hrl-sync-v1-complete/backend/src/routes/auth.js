const express  = require("express");
const router   = express.Router();
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const crypto   = require("crypto");
const { query, queryOne } = require("../db/pool");
const driveService = require("../services/googleDrive");
const authMiddleware = require("../middleware/auth");

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const { email, password, full_name, company_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email + password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const existing = await queryOne("SELECT id FROM users WHERE email=$1", [email.toLowerCase()]);
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const hash = await bcrypt.hash(password, 12);
  const { rows: [user] } = await query(
    "INSERT INTO users (email,password_hash,full_name,company_name) VALUES ($1,$2,$3,$4) RETURNING id,email,full_name,company_name,created_at",
    [email.toLowerCase(), hash, full_name??null, company_name??null]
  );

  const token = signToken(user.id);
  res.status(201).json({ user, token });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email + password required" });

  const user = await queryOne("SELECT * FROM users WHERE email=$1", [email.toLowerCase()]);
  if (!user || !user.password_hash) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user.id);
  res.json({
    user: { id: user.id, email: user.email, full_name: user.full_name, company_name: user.company_name },
    token,
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", authMiddleware, async (req, res) => {
  const { password_hash, ...user } = req.user;
  res.json({ user });
});

// ── PATCH /api/auth/me ────────────────────────────────────────────────────────
router.patch("/me", authMiddleware, async (req, res) => {
  const { full_name, company_name, avatar_url } = req.body;
  const sets = [], params = [];
  if (full_name    !== undefined) { params.push(full_name);    sets.push(`full_name=$${params.length}`); }
  if (company_name !== undefined) { params.push(company_name); sets.push(`company_name=$${params.length}`); }
  if (avatar_url   !== undefined) { params.push(avatar_url);   sets.push(`avatar_url=$${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.userId);
  const { rows: [user] } = await query(
    `UPDATE users SET ${sets.join(",")},updated_at=now() WHERE id=$${params.length} RETURNING id,email,full_name,company_name,avatar_url`,
    params
  );
  res.json({ user });
});

// ── POST /api/auth/change-password ───────────────────────────────────────────
router.post("/change-password", authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: "current_password + new_password required" });
  if (new_password.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  const user = await queryOne("SELECT password_hash FROM users WHERE id=$1", [req.userId]);
  const ok = await bcrypt.compare(current_password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

  const hash = await bcrypt.hash(new_password, 12);
  await query("UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2", [hash, req.userId]);
  res.json({ success: true });
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });

  const user = await queryOne("SELECT id FROM users WHERE email=$1", [email.toLowerCase()]);
  // Always return 200 to prevent email enumeration
  if (!user) return res.json({ success: true, message: "If the email exists, a reset link was sent" });

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 3600_000).toISOString(); // 1 hour

  // Store token (reuse a simple approach — add column if needed, or use a separate table)
  await query(
    `UPDATE users SET password_hash = password_hash
     WHERE id=$1`,
    [user.id]
  ); // placeholder — in production store reset_token + reset_expires in users table

  // TODO: send email via emailService
  // await emailService.sendPasswordReset(email, token);

  res.json({ success: true, message: "If the email exists, a reset link was sent" });
});

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) return res.status(400).json({ error: "token + new_password required" });
  if (new_password.length < 8) return res.status(400).json({ error: "Password too short" });

  // TODO: look up token in DB, check expiry, update password
  // For now: if using Supabase auth, delegate to Supabase
  res.status(501).json({ error: "Reset via app link — check your email for Supabase reset link" });
});

// ── GET /api/auth/google/callback ─────────────────────────────────────────────
router.get("/google/callback", async (req, res) => {
  const { code, state: userId } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "https://hrlsync.vercel.app";
  try {
    if (!code || !userId) throw new Error("Missing params");
    const tokens = await driveService.exchangeCode(code);
    await driveService.saveTokens(userId, tokens);
    res.redirect(`${frontendUrl}/settings?tab=integrations&drive=connected`);
  } catch (e) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&drive=error&msg=${encodeURIComponent(e.message)}`);
  }
});

// ── DELETE /api/auth/account ──────────────────────────────────────────────────
router.delete("/account", authMiddleware, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "password required to confirm deletion" });

  const user = await queryOne("SELECT password_hash FROM users WHERE id=$1", [req.userId]);
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Incorrect password" });

  await query("DELETE FROM users WHERE id=$1", [req.userId]);
  res.json({ success: true });
});

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
}

module.exports = router;
