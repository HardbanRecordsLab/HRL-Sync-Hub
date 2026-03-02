const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const { optionalAuth } = require("../middleware/auth");
const { query, queryOne, queryAll } = require("../db/pool");
const crypto  = require("crypto");

// PUBLIC — shared playlist
router.get("/share/:token", optionalAuth, async (req, res) => {
  const link = await queryOne(
    `SELECT sl.*, p.id AS playlist_id, p.name, p.description, p.user_id
     FROM shareable_links sl JOIN playlists p ON p.id = sl.playlist_id
     WHERE sl.link_token = $1 AND sl.is_active = true`,
    [req.params.token]
  );
  if (!link) return res.status(404).json({ error: "Not found" });
  if (link.expires_at && new Date(link.expires_at) < new Date())
    return res.status(410).json({ error: "Link expired" });

  const tracks = await queryAll(
    `SELECT t.id, t.title, t.artist, t.duration, t.bpm, t.key,
            t.file_name, t.google_drive_file_id, t.mime_type,
            pt.id AS pt_id, pt.position, pt.track_comment
     FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = $1 ORDER BY pt.position`,
    [link.playlist_id]
  );

  await query(
    "INSERT INTO tracking_events (shareable_link_id, event_type, ip_address, user_agent) VALUES ($1,'playlist_opened',$2,$3)",
    [link.id, req.ip, req.headers["user-agent"]]
  ).catch(() => {});

  res.json({
    playlist: { id: link.playlist_id, name: link.name, description: link.description, tracks },
    link: { token: req.params.token, allow_downloads: link.allow_downloads, require_email: link.require_email, expires_at: link.expires_at },
  });
});

// AUTHENTICATED
router.use(auth);

// GET /api/playlists
router.get("/", async (req, res) => {
  const rows = await queryAll(
    `SELECT p.*, COUNT(pt.id)::int AS track_count,
       COALESCE(json_agg(jsonb_build_object('id',sl.id,'token',sl.link_token,'is_active',sl.is_active,'allow_downloads',sl.allow_downloads,'expires_at',sl.expires_at))
         FILTER (WHERE sl.id IS NOT NULL), '[]') AS share_links
     FROM playlists p
     LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
     LEFT JOIN shareable_links sl ON sl.playlist_id = p.id
     WHERE p.user_id = $1 GROUP BY p.id ORDER BY p.updated_at DESC`,
    [req.userId]
  );
  res.json(rows);
});

// GET /api/playlists/:id
router.get("/:id", async (req, res) => {
  const pl = await queryOne("SELECT * FROM playlists WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!pl) return res.status(404).json({ error: "Not found" });

  const tracks = await queryAll(
    `SELECT t.id,t.title,t.artist,t.duration,t.bpm,t.key,t.clearance_status,
            t.google_drive_file_id,t.file_name,
            pt.id AS pt_id,pt.position,pt.track_comment,
            COALESCE(json_agg(DISTINCT jsonb_build_object('genre',tg.genre)) FILTER (WHERE tg.id IS NOT NULL),'[]') AS track_genres
     FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id
     LEFT JOIN track_genres tg ON tg.track_id=t.id
     WHERE pt.playlist_id=$1 GROUP BY t.id,pt.id ORDER BY pt.position`,
    [pl.id]
  );

  const links = await queryAll(
    `SELECT *, $1||'/share/'||link_token AS share_url FROM shareable_links WHERE playlist_id=$2 ORDER BY created_at DESC`,
    [process.env.FRONTEND_URL || "https://hrlsync.vercel.app", pl.id]
  );

  res.json({ ...pl, tracks, share_links: links });
});

// PUT /api/playlists/:id
router.put("/:id", async (req, res) => {
  const { name, description } = req.body;
  const { rows: [p] } = await query(
    `UPDATE playlists SET name=COALESCE($1,name),description=COALESCE($2,description),updated_at=now()
     WHERE id=$3 AND user_id=$4 RETURNING *`,
    [name ?? null, description ?? null, req.params.id, req.userId]
  );
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

// DELETE /api/playlists/:id
router.delete("/:id", async (req, res) => {
  const { rowCount } = await query("DELETE FROM playlists WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!rowCount) return res.status(404).json({ error: "Not found" });
  res.json({ success: true });
});

// POST /api/playlists/:id/tracks
router.post("/:id/tracks", async (req, res) => {
  const { track_id, track_comment, position } = req.body;
  if (!track_id) return res.status(400).json({ error: "track_id required" });

  const pl = await queryOne("SELECT id FROM playlists WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!pl) return res.status(404).json({ error: "Playlist not found" });

  const track = await queryOne("SELECT id FROM tracks WHERE id=$1 AND user_id=$2", [track_id, req.userId]);
  if (!track) return res.status(404).json({ error: "Track not found" });

  const exists = await queryOne("SELECT id FROM playlist_tracks WHERE playlist_id=$1 AND track_id=$2", [req.params.id, track_id]);
  if (exists) return res.status(409).json({ error: "Track already in playlist" });

  let pos = position;
  if (!pos) {
    const last = await queryOne("SELECT MAX(position) AS m FROM playlist_tracks WHERE playlist_id=$1", [req.params.id]);
    pos = (last?.m ?? 0) + 1;
  }

  const { rows: [pt] } = await query(
    "INSERT INTO playlist_tracks (playlist_id,track_id,position,track_comment) VALUES ($1,$2,$3,$4) RETURNING *",
    [req.params.id, track_id, pos, track_comment ?? null]
  );
  await query("UPDATE playlists SET updated_at=now() WHERE id=$1", [req.params.id]);
  res.status(201).json(pt);
});

// DELETE /api/playlists/:id/tracks/:trackId
router.delete("/:id/tracks/:trackId", async (req, res) => {
  const pl = await queryOne("SELECT id FROM playlists WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!pl) return res.status(404).json({ error: "Not found" });
  await query("DELETE FROM playlist_tracks WHERE playlist_id=$1 AND track_id=$2", [req.params.id, req.params.trackId]);
  await query("UPDATE playlists SET updated_at=now() WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// PATCH /api/playlists/:id/tracks/:trackId
router.patch("/:id/tracks/:trackId", async (req, res) => {
  const pl = await queryOne("SELECT id FROM playlists WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!pl) return res.status(404).json({ error: "Not found" });
  const { track_comment, position } = req.body;
  const sets = [], params = [];
  if (track_comment !== undefined) { params.push(track_comment); sets.push(`track_comment=$${params.length}`); }
  if (position      !== undefined) { params.push(position);      sets.push(`position=$${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id, req.params.trackId);
  const { rows: [pt] } = await query(
    `UPDATE playlist_tracks SET ${sets.join(",")} WHERE playlist_id=$${params.length-1} AND track_id=$${params.length} RETURNING *`,
    params
  );
  res.json(pt);
});

// POST /api/playlists/:id/reorder
router.post("/:id/reorder", async (req, res) => {
  const { order } = req.body; // array of track IDs in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: "order[] required" });
  const pl = await queryOne("SELECT id FROM playlists WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!pl) return res.status(404).json({ error: "Not found" });

  const { pool } = require("../db/pool");
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    for (let i = 0; i < order.length; i++) {
      await conn.query("UPDATE playlist_tracks SET position=$1 WHERE playlist_id=$2 AND track_id=$3", [i+1, req.params.id, order[i]]);
    }
    await conn.query("UPDATE playlists SET updated_at=now() WHERE id=$1", [req.params.id]);
    await conn.query("COMMIT");
  } catch (e) { await conn.query("ROLLBACK"); throw e; }
  finally { conn.release(); }

  res.json({ success: true });
});

// POST /api/playlists/:id/share-link
router.post("/:id/share-link", async (req, res) => {
  const pl = await queryOne("SELECT id FROM playlists WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!pl) return res.status(404).json({ error: "Not found" });
  const { allow_downloads, require_email, expires_in_days } = req.body;
  const token = crypto.randomBytes(16).toString("hex");
  const expires_at = expires_in_days ? new Date(Date.now() + parseInt(expires_in_days)*86400000).toISOString() : null;
  const { rows: [sl] } = await query(
    "INSERT INTO shareable_links (playlist_id,link_token,allow_downloads,require_email,expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [req.params.id, token, !!allow_downloads, !!require_email, expires_at]
  );
  const base = process.env.FRONTEND_URL || "https://hrlsync.vercel.app";
  res.json({ ...sl, share_url: `${base}/share/${token}` });
});

// PATCH /api/playlists/links/:linkId
router.patch("/links/:linkId", async (req, res) => {
  const link = await queryOne(
    "SELECT sl.id FROM shareable_links sl JOIN playlists p ON p.id=sl.playlist_id WHERE sl.id=$1 AND p.user_id=$2",
    [req.params.linkId, req.userId]
  );
  if (!link) return res.status(404).json({ error: "Not found" });
  const { is_active, allow_downloads } = req.body;
  const sets = [], params = [];
  if (is_active       !== undefined) { params.push(is_active);       sets.push(`is_active=$${params.length}`); }
  if (allow_downloads !== undefined) { params.push(allow_downloads); sets.push(`allow_downloads=$${params.length}`); }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.linkId);
  const { rows: [sl] } = await query(`UPDATE shareable_links SET ${sets.join(",")} WHERE id=$${params.length} RETURNING *`, params);
  res.json(sl);
});

// DELETE /api/playlists/links/:linkId
router.delete("/links/:linkId", async (req, res) => {
  const link = await queryOne(
    "SELECT sl.id FROM shareable_links sl JOIN playlists p ON p.id=sl.playlist_id WHERE sl.id=$1 AND p.user_id=$2",
    [req.params.linkId, req.userId]
  );
  if (!link) return res.status(404).json({ error: "Not found" });
  await query("UPDATE shareable_links SET is_active=false WHERE id=$1", [req.params.linkId]);
  res.json({ success: true });
});

module.exports = router;
