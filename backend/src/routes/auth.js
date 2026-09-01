const express  = require("express");
const router   = express.Router();
const bcrypt   = require("bcryptjs");
const { query, queryOne } = require("../db/pool");
const driveService = require("../services/googleDrive");
const authMiddleware = require("../middleware/auth");

// ── AUTH PROFILE ROUTES ──────────────────────────────────────────────────────
// WordPress login redirects are disabled in the apps. This router now only
// serves profile/account endpoints used after the frontend creates local access.

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

// ── ZMIANA HASŁA ─────────────────────────────────────────────────────────────

// ── POST /api/auth/forgot-password [DEPRECATED] ──────────────────────────────
router.post("/forgot-password", async (req, res) => {
  return res.status(404).json({ 
    error: "Deprecated endpoint",
    message: "Password reset is not available in local app access mode"
  });
});

// ── POST /api/auth/reset-password [DEPRECATED] ────────────────────────────────
router.post("/reset-password", async (req, res) => {
  return res.status(404).json({
    error: "Deprecated endpoint",
    message: "Password reset is not available in local app access mode"
  });
});

// ── DELETE /api/auth/account [DEPRECATED] ──────────────────────────────────────
// Usunięcie konta nie jest dostępne w lokalnym trybie aplikacji

module.exports = router;
