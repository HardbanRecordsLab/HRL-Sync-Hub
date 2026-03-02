const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const { optionalAuth } = require("../middleware/auth");
const { query, queryOne, queryAll } = require("../db/pool");
const driveService = require("../services/googleDrive");

// ── GET /api/lyrics ────────────────────────────────────────────────────────────
router.get("/", optionalAuth, async (req, res) => {
  const { search, language, status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conds = [];

  // Public or own
  if (req.userId) {
    params.push(req.userId);
    conds.push(`(l.is_public = true OR l.user_id = $${params.length})`);
  } else {
    conds.push("l.is_public = true");
  }

  if (search)   { params.push(`%${search}%`); conds.push(`(l.title ILIKE $${params.length} OR l.artist ILIKE $${params.length})`); }
  if (language) { params.push(language); conds.push(`l.language = $${params.length}`); }
  if (status)   { params.push(status);   conds.push(`l.status = $${params.length}::lyrics_status`); }

  const where = conds.join(" AND ");
  const count = await queryOne(`SELECT COUNT(*) FROM lyrics l WHERE ${where}`, params);
  params.push(parseInt(limit), offset);

  const rows = await queryAll(
    `SELECT l.id,l.title,l.artist,l.language,l.is_explicit,l.is_public,l.status,
       l.preview_text,l.google_doc_id,l.last_synced_from_drive,l.created_at,l.updated_at,
       t.title AS track_title, t.artist AS track_artist
     FROM lyrics l
     LEFT JOIN tracks t ON t.id = l.track_id
     WHERE ${where}
     ORDER BY l.updated_at DESC
     LIMIT $${params.length-1} OFFSET $${params.length}`,
    params
  );

  res.json({
    lyrics: rows,
    pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(count.count) },
  });
});

// ── GET /api/lyrics/:id ────────────────────────────────────────────────────────
router.get("/:id", optionalAuth, async (req, res) => {
  const row = await queryOne(
    `SELECT l.*, t.title AS track_title, t.artist AS track_artist,
       t.bpm, t.key, t.duration
     FROM lyrics l
     LEFT JOIN tracks t ON t.id = l.track_id
     WHERE l.id = $1 AND (l.is_public = true OR l.user_id = $2)`,
    [req.params.id, req.userId ?? "00000000-0000-0000-0000-000000000000"]
  );
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// ── POST /api/lyrics ───────────────────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  const { title, artist, content="", language="en", is_explicit=false, is_public=false,
    status="draft", google_doc_id, track_id, copyright_notice, notes } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });

  const preview = content.replace(/<[^>]*>/g, "").substring(0, 200);
  const { rows: [row] } = await query(
    `INSERT INTO lyrics (user_id, title, artist, content, preview_text, language, is_explicit,
       is_public, status, google_doc_id, track_id, copyright_notice, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.userId, title, artist||null, content, preview, language, is_explicit,
     is_public, status, google_doc_id||null, track_id||null, copyright_notice||null, notes||null]
  );
  res.status(201).json(row);
});

// ── PUT /api/lyrics/:id ────────────────────────────────────────────────────────
router.put("/:id", auth, async (req, res) => {
  const existing = await queryOne("SELECT user_id FROM lyrics WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

  const allowed = ["title","artist","content","language","is_explicit","is_public",
    "status","google_doc_id","track_id","copyright_notice","notes","timecodes"];
  const sets = [], params = [];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) { params.push(req.body[k]); sets.push(`${k} = $${params.length}`); }
  });
  if (req.body.content !== undefined) {
    const prev = req.body.content.replace(/<[^>]*>/g, "").substring(0, 200);
    params.push(prev); sets.push(`preview_text = $${params.length}`);
  }
  params.push(req.params.id);
  const { rows: [row] } = await query(
    `UPDATE lyrics SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params
  );
  res.json(row);
});

// ── DELETE /api/lyrics/:id ─────────────────────────────────────────────────────
router.delete("/:id", auth, async (req, res) => {
  const existing = await queryOne("SELECT user_id FROM lyrics WHERE id = $1", [req.params.id]);
  if (!existing || existing.user_id !== req.userId) return res.status(404).json({ error: "Not found" });
  await query("DELETE FROM lyrics WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

// ── POST /api/lyrics/:id/sync-with-drive ──────────────────────────────────────
router.post("/:id/sync-with-drive", auth, async (req, res) => {
  const row = await queryOne(
    "SELECT * FROM lyrics WHERE id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );
  if (!row) return res.status(404).json({ error: "Not found" });
  if (!row.google_doc_id) return res.status(400).json({ error: "No Google Doc linked" });

  const { title, text } = await driveService.readGoogleDoc(req.userId, row.google_doc_id);
  const preview = text.substring(0, 200);

  const { rows: [updated] } = await query(
    `UPDATE lyrics SET content=$1, preview_text=$2, last_synced_from_drive=now(), updated_at=now()
     WHERE id=$3 RETURNING *`,
    [text, preview, row.id]
  );
  res.json({ success: true, lyrics: updated });
});

// ── GET /api/lyrics/track/:trackId ────────────────────────────────────────────
router.get("/track/:trackId", optionalAuth, async (req, res) => {
  const row = await queryOne(
    `SELECT * FROM lyrics WHERE track_id = $1 AND (is_public = true OR user_id = $2) LIMIT 1`,
    [req.params.trackId, req.userId ?? "00000000-0000-0000-0000-000000000000"]
  );
  if (!row) return res.status(404).json({ error: "No lyrics for this track" });
  res.json(row);
});

module.exports = router;
