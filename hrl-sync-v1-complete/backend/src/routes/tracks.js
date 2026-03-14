const express = require("express");
const router = express.Router();
const { query, queryOne, queryAll } = require("../db/pool");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { parseFile } = require("music-metadata");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../../uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, unique + "-" + file.originalname);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// ── Streaming / Download ──────────────────────────────────────────────────
router.get("/stream/:id", async (req, res) => {
  const { shareToken } = req.query;
  const trackId = req.params.id;

  let hasAccess = false;
  if (req.userId) {
    // User is logged in, check if they own the track
    const track = await queryOne("SELECT id FROM tracks WHERE id=$1 AND user_id=$2", [trackId, req.userId]);
    if (track) hasAccess = true;
  }

  if (!hasAccess && shareToken) {
    // Check if track is part of a playlist with this active share token
    const link = await queryOne(
      `SELECT sl.id FROM shareable_links sl 
       JOIN playlist_tracks pt ON pt.playlist_id = sl.playlist_id
       WHERE sl.link_token = $1 AND pt.track_id = $2 AND sl.is_active = true`,
      [shareToken, trackId]
    );
    if (link) hasAccess = true;
  }

  if (!hasAccess) {
    // Check if the track itself is marked as public
    const trackInfo = await queryOne("SELECT is_public FROM tracks WHERE id=$1", [trackId]);
    if (trackInfo?.is_public) hasAccess = true;
  }

  if (!hasAccess) return res.status(401).json({ error: "Unauthorized access to this audio track" });

  const track = await queryOne("SELECT * FROM tracks WHERE id=$1", [trackId]);
  if (!track) return res.status(404).json({ error: "Track not found" });

  if (track.source === "local" && track.local_file_path) {
    const fullPath = path.join(__dirname, "../../uploads", track.local_file_path);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File missing on server" });
    const stat = fs.statSync(fullPath);
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(fullPath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": track.mime_type || "audio/mpeg",
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": track.mime_type || "audio/mpeg",
      });
      fs.createReadStream(fullPath).pipe(res);
    }
  } else if (track.source === "google_drive" && track.google_drive_file_id) {
    // Falls back to Drive streaming
    const drive = require("../services/googleDrive");
    const range = req.headers.range;
    if (range) {
      await drive.streamFileRange(track.user_id, track.google_drive_file_id, range, res);
    } else {
      await drive.streamFile(track.user_id, track.google_drive_file_id, res);
    }
  }
});

// ── POST /api/tracks/upload ──────────────────────────────────────────────
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const fullPath = req.file.path;
  let metadata = {};
  let duration = 0;
  try {
    const meta = await parseFile(fullPath);
    metadata = meta.common;
    duration = Math.round(meta.format.duration || 0);
  } catch (e) {
    console.error("Metatada parse error:", e);
  }

  const title = req.body.title || metadata.title || req.file.originalname.replace(/\.[^/.]+$/, "");
  const artist = req.body.artist || metadata.artist || "Unknown artist";
  const bpm = req.body.bpm || metadata.bpm || null;
  const key = req.body.key || metadata.key || null;

  try {
    const { rows: [track] } = await query(
      `INSERT INTO tracks (user_id, title, artist, file_name, file_size, mime_type,
         local_file_path, source, bpm, key, duration, clearance_status, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'local', $8, $9, $10, 'not_cleared', false)
       RETURNING *`,
      [req.userId, title, artist, req.file.originalname, req.file.size, req.file.mimetype,
      req.file.filename, bpm, key, duration]
    );
    res.status(201).json(track);
  } catch (err) {
    console.error("DB Insert Error:", err);
    res.status(500).json({ error: "Błąd zapisu w bazie danych: " + err.message });
  }
});

// ── GET /api/tracks ────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { search, clearance, bpm_min, bpm_max, key, genre, mood, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [req.userId];
  let where = "t.user_id = $1";

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (t.title ILIKE $${params.length} OR t.artist ILIKE $${params.length} OR t.composer ILIKE $${params.length})`;
  }
  if (clearance) { params.push(clearance); where += ` AND t.clearance_status = $${params.length}::clearance_status`; }
  if (key) { params.push(key); where += ` AND t.key = $${params.length}`; }
  if (bpm_min) { params.push(bpm_min); where += ` AND t.bpm >= $${params.length}`; }
  if (bpm_max) { params.push(bpm_max); where += ` AND t.bpm <= $${params.length}`; }
  if (genre) {
    params.push(genre);
    where += ` AND EXISTS (SELECT 1 FROM track_genres tg WHERE tg.track_id=t.id AND tg.genre=$${params.length})`;
  }
  if (mood) {
    params.push(mood);
    where += ` AND EXISTS (SELECT 1 FROM track_moods tm WHERE tm.track_id=t.id AND tm.mood=$${params.length})`;
  }

  const countParams = [...params];
  const { rows: [{ count }] } = await query(`SELECT COUNT(*) FROM tracks t WHERE ${where}`, countParams);

  params.push(parseInt(limit), offset);
  const rows = await queryAll(
    `SELECT t.*,
       COALESCE(json_agg(DISTINCT jsonb_build_object('genre',tg.genre,'sub_genre',tg.sub_genre)) FILTER (WHERE tg.id IS NOT NULL),'[]') AS track_genres,
       COALESCE(json_agg(DISTINCT tm.mood) FILTER (WHERE tm.id IS NOT NULL),'[]') AS track_moods
     FROM tracks t
     LEFT JOIN track_genres tg ON tg.track_id=t.id
     LEFT JOIN track_moods  tm ON tm.track_id=t.id
     WHERE ${where}
     GROUP BY t.id
     ORDER BY t.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ tracks: rows, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
});

// ── GET /api/tracks/public (Public Library) ───────────────────────────────────
router.get("/public", async (req, res) => {
  const rows = await queryAll(
    `SELECT t.id, t.title, t.artist, t.duration, t.bpm, t.key, t.clearance_status
     FROM tracks t
     WHERE t.is_public = true
     ORDER BY t.created_at DESC`
  );
  res.json({ tracks: rows });
});

// ── GET /api/tracks/search (full-text trigram) ─────────────────────────────────
router.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ tracks: [] });

  const rows = await queryAll(
    `SELECT t.id, t.title, t.artist, t.bpm, t.key, t.duration, t.clearance_status, t.google_drive_file_id,
       similarity(t.title, $2) AS title_score,
       similarity(t.artist, $2) AS artist_score
     FROM tracks t
     WHERE t.user_id = $1
       AND (t.title % $2 OR t.artist % $2 OR t.title ILIKE $3 OR t.artist ILIKE $3)
     ORDER BY GREATEST(similarity(t.title,$2), similarity(t.artist,$2)) DESC
     LIMIT 20`,
    [req.userId, q, `%${q}%`]
  );
  res.json({ tracks: rows });
});

// ── GET /api/tracks/:id ────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const track = await queryOne(
    `SELECT t.*,
       COALESCE(json_agg(DISTINCT jsonb_build_object('genre',tg.genre,'sub_genre',tg.sub_genre)) FILTER (WHERE tg.id IS NOT NULL),'[]') AS track_genres,
       COALESCE(json_agg(DISTINCT tm.mood) FILTER (WHERE tm.id IS NOT NULL),'[]') AS track_moods,
       COALESCE(json_agg(DISTINCT ti.instrument) FILTER (WHERE ti.id IS NOT NULL),'[]') AS track_instruments,
       COALESCE(json_agg(DISTINCT tk.keyword) FILTER (WHERE tk.id IS NOT NULL),'[]') AS track_keywords,
       COALESCE(json_agg(DISTINCT row_to_json(tr)) FILTER (WHERE tr.id IS NOT NULL),'[]') AS track_rights,
       COALESCE(json_agg(DISTINCT row_to_json(tv)) FILTER (WHERE tv.id IS NOT NULL),'[]') AS track_versions,
       COALESCE(json_agg(DISTINCT jsonb_build_object('id',l.id,'title',l.title,'status',l.status,'language',l.language)) FILTER (WHERE l.id IS NOT NULL),'[]') AS lyrics
     FROM tracks t
     LEFT JOIN track_genres      tg ON tg.track_id=t.id
     LEFT JOIN track_moods       tm ON tm.track_id=t.id
     LEFT JOIN track_instruments ti ON ti.track_id=t.id
     LEFT JOIN track_keywords    tk ON tk.track_id=t.id
     LEFT JOIN track_rights      tr ON tr.track_id=t.id
     LEFT JOIN track_versions    tv ON tv.track_id=t.id
     LEFT JOIN lyrics            l  ON l.track_id=t.id
     WHERE t.id=$1 AND t.user_id=$2
     GROUP BY t.id`,
    [req.params.id, req.userId]
  );
  if (!track) return res.status(404).json({ error: "Track not found" });
  res.json(track);
});

// ── POST /api/tracks (manual create) ──────────────────────────────────────────
router.post("/", async (req, res) => {
  const {
    title, artist, composer, isrc, iswc, file_name, file_size, mime_type,
    google_drive_file_id, duration, bpm, key, description, rights_type, clearance_status
  } = req.body;
  if (!title || !artist || !file_name) return res.status(400).json({ error: "title, artist, file_name required" });

  const { rows: [t] } = await query(
    `INSERT INTO tracks (user_id,title,artist,composer,isrc,iswc,file_name,file_size,mime_type,
       google_drive_file_id,duration,bpm,key,description,rights_type,clearance_status,source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'google_drive')
     RETURNING *`,
    [req.userId, title, artist, composer ?? null, isrc ?? null, iswc ?? null, file_name,
    file_size ?? null, mime_type ?? 'audio/mpeg', google_drive_file_id ?? null,
    duration ?? null, bpm ?? null, key ?? null, description ?? null,
    rights_type ?? null, clearance_status ?? 'not_cleared']
  );
  res.status(201).json(t);
});

// ── PATCH /api/tracks/:id ──────────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  const allowed = ["title", "artist", "composer", "isrc", "iswc", "bpm", "key", "description",
    "rights_type", "clearance_status", "duration", "mime_type", "file_name"];
  const sets = [], params = [];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) { params.push(req.body[k]); sets.push(`${k}=$${params.length}`); }
  });
  if (!sets.length) return res.status(400).json({ error: "No valid fields" });
  params.push(req.params.id, req.userId);
  const { rows: [t] } = await query(
    `UPDATE tracks SET ${sets.join(",")},updated_at=now() WHERE id=$${params.length - 1} AND user_id=$${params.length} RETURNING *`,
    params
  );
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json(t);
});

// ── DELETE /api/tracks/:id ─────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  await query("DELETE FROM tracks WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  res.json({ success: true });
});

// ── POST /api/tracks/:id/genres ────────────────────────────────────────────────
router.post("/:id/genres", async (req, res) => {
  const { genres } = req.body; // [{ genre, sub_genre? }]
  await query("DELETE FROM track_genres WHERE track_id=$1", [req.params.id]);
  for (const g of (genres || [])) {
    await query(
      "INSERT INTO track_genres (track_id,genre,sub_genre) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [req.params.id, g.genre, g.sub_genre ?? null]
    );
  }
  res.json({ success: true });
});

// ── POST /api/tracks/:id/moods ─────────────────────────────────────────────────
router.post("/:id/moods", async (req, res) => {
  const { moods } = req.body; // string[]
  await query("DELETE FROM track_moods WHERE track_id=$1", [req.params.id]);
  for (const m of (moods || [])) {
    await query("INSERT INTO track_moods (track_id,mood) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.params.id, m]);
  }
  res.json({ success: true });
});

// ── POST /api/tracks/:id/instruments ──────────────────────────────────────────
router.post("/:id/instruments", async (req, res) => {
  const { instruments } = req.body; // string[]
  await query("DELETE FROM track_instruments WHERE track_id=$1", [req.params.id]);
  for (const i of (instruments || [])) {
    await query("INSERT INTO track_instruments (track_id,instrument) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.params.id, i]);
  }
  res.json({ success: true });
});

// ── POST /api/tracks/:id/keywords ─────────────────────────────────────────────
router.post("/:id/keywords", async (req, res) => {
  const { keywords } = req.body; // string[]
  await query("DELETE FROM track_keywords WHERE track_id=$1", [req.params.id]);
  for (const k of (keywords || [])) {
    await query("INSERT INTO track_keywords (track_id,keyword) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.params.id, k]);
  }
  res.json({ success: true });
});

// ── POST /api/tracks/:id/rights ────────────────────────────────────────────────
router.post("/:id/rights", async (req, res) => {
  const { rights } = req.body; // [{ name, role, percentage, pro_organization? }]
  if (!Array.isArray(rights)) return res.status(400).json({ error: "rights[] required" });

  // validate percentages add up to 100 per role type
  await query("DELETE FROM track_rights WHERE track_id=$1", [req.params.id]);
  for (const r of rights) {
    await query(
      "INSERT INTO track_rights (track_id,name,role,percentage,pro_organization) VALUES ($1,$2,$3,$4,$5)",
      [req.params.id, r.name, r.role, r.percentage, r.pro_organization ?? null]
    );
  }
  res.json({ success: true });
});

// ── POST /api/tracks/:id/versions ─────────────────────────────────────────────
router.post("/:id/versions", async (req, res) => {
  const { version_type, google_drive_file_id, file_name, file_size } = req.body;
  if (!version_type || !file_name) return res.status(400).json({ error: "version_type and file_name required" });

  const { rows: [v] } = await query(
    "INSERT INTO track_versions (track_id,version_type,google_drive_file_id,file_name,file_size) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [req.params.id, version_type, google_drive_file_id ?? null, file_name, file_size ?? null]
  );
  res.status(201).json(v);
});

// ── DELETE /api/tracks/:id/versions/:versionId ────────────────────────────────
router.delete("/:id/versions/:versionId", async (req, res) => {
  await query("DELETE FROM track_versions WHERE id=$1 AND track_id=$2", [req.params.versionId, req.params.id]);
  res.json({ success: true });
});

module.exports = router;
