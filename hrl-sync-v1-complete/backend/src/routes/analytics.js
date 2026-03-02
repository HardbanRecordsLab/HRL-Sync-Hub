const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const { optionalAuth } = require("../middleware/auth");
const { query, queryOne, queryAll } = require("../db/pool");

// ── POST /api/analytics/event (public — called from shared player) ─────────────
router.post("/event", async (req, res) => {
  const { link_token, event_type, track_id } = req.body;
  if (!link_token || !event_type) return res.status(400).json({ error: "link_token and event_type required" });

  const link = await queryOne("SELECT id FROM shareable_links WHERE link_token=$1 AND is_active=true", [link_token]);
  if (!link) return res.status(404).json({ error: "Invalid link" });

  await query(
    "INSERT INTO tracking_events (shareable_link_id,event_type,track_id,ip_address,user_agent) VALUES ($1,$2,$3,$4,$5)",
    [link.id, event_type, track_id??null, req.ip, req.headers["user-agent"]]
  );
  res.json({ success: true });
});

// All routes below require auth
router.use(auth);

// ── GET /api/analytics/overview ────────────────────────────────────────────────
// Total counts, top playlists, top tracks
router.get("/overview", async (req, res) => {
  const [totals, topPlaylists, topTracks, recentEvents] = await Promise.all([
    // Total events
    queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE te.event_type='playlist_opened')::int AS total_opens,
         COUNT(*) FILTER (WHERE te.event_type='track_played')::int    AS total_plays,
         COUNT(*) FILTER (WHERE te.event_type='track_downloaded')::int AS total_downloads,
         COUNT(DISTINCT te.ip_address)::int AS unique_visitors
       FROM tracking_events te
       JOIN shareable_links sl ON sl.id=te.shareable_link_id
       JOIN playlists p ON p.id=sl.playlist_id
       WHERE p.user_id=$1`,
      [req.userId]
    ),

    // Top playlists by opens
    queryAll(
      `SELECT p.id, p.name,
         COUNT(*) FILTER (WHERE te.event_type='playlist_opened')::int AS opens,
         COUNT(*) FILTER (WHERE te.event_type='track_played')::int    AS plays
       FROM playlists p
       JOIN shareable_links sl ON sl.playlist_id=p.id
       JOIN tracking_events te ON te.shareable_link_id=sl.id
       WHERE p.user_id=$1
       GROUP BY p.id ORDER BY opens DESC LIMIT 5`,
      [req.userId]
    ),

    // Top tracks by plays
    queryAll(
      `SELECT t.id, t.title, t.artist,
         COUNT(te.id)::int AS play_count
       FROM tracks t
       JOIN tracking_events te ON te.track_id=t.id
       JOIN shareable_links sl ON sl.id=te.shareable_link_id
       JOIN playlists p ON p.id=sl.playlist_id
       WHERE p.user_id=$1 AND te.event_type='track_played'
       GROUP BY t.id ORDER BY play_count DESC LIMIT 10`,
      [req.userId]
    ),

    // Last 20 events
    queryAll(
      `SELECT te.event_type, te.created_at, te.ip_address,
         t.title AS track_title, t.artist AS track_artist,
         p.name AS playlist_name
       FROM tracking_events te
       JOIN shareable_links sl ON sl.id=te.shareable_link_id
       JOIN playlists p ON p.id=sl.playlist_id
       LEFT JOIN tracks t ON t.id=te.track_id
       WHERE p.user_id=$1
       ORDER BY te.created_at DESC LIMIT 20`,
      [req.userId]
    ),
  ]);

  res.json({ totals, topPlaylists, topTracks, recentEvents });
});

// ── GET /api/analytics/timeseries?days=30 ──────────────────────────────────────
// Daily play counts for sparkline / chart
router.get("/timeseries", async (req, res) => {
  const days = Math.min(parseInt(req.query.days || "30"), 365);

  const rows = await queryAll(
    `SELECT
       DATE(te.created_at) AS date,
       COUNT(*) FILTER (WHERE te.event_type='playlist_opened')::int AS opens,
       COUNT(*) FILTER (WHERE te.event_type='track_played')::int    AS plays,
       COUNT(*) FILTER (WHERE te.event_type='track_downloaded')::int AS downloads
     FROM tracking_events te
     JOIN shareable_links sl ON sl.id=te.shareable_link_id
     JOIN playlists p ON p.id=sl.playlist_id
     WHERE p.user_id=$1
       AND te.created_at >= NOW() - INTERVAL '${days} days'
     GROUP BY DATE(te.created_at)
     ORDER BY date ASC`,
    [req.userId]
  );

  // Fill missing days with zeros
  const map = new Map(rows.map(r => [r.date.toISOString().split("T")[0], r]));
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    result.push(map.get(key) ?? { date: key, opens: 0, plays: 0, downloads: 0 });
  }

  res.json(result);
});

// ── GET /api/analytics/playlist/:id ────────────────────────────────────────────
router.get("/playlist/:id", async (req, res) => {
  const pl = await queryOne("SELECT id FROM playlists WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!pl) return res.status(404).json({ error: "Not found" });

  const [stats, trackStats, timeline] = await Promise.all([
    queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE te.event_type='playlist_opened')::int AS total_opens,
         COUNT(*) FILTER (WHERE te.event_type='track_played')::int    AS total_plays,
         COUNT(DISTINCT te.ip_address)::int AS unique_visitors,
         MIN(te.created_at) AS first_open, MAX(te.created_at) AS last_open
       FROM tracking_events te
       JOIN shareable_links sl ON sl.id=te.shareable_link_id
       WHERE sl.playlist_id=$1`,
      [req.params.id]
    ),
    queryAll(
      `SELECT t.id, t.title, t.artist, COUNT(te.id)::int AS play_count
       FROM tracking_events te
       JOIN tracks t ON t.id=te.track_id
       JOIN shareable_links sl ON sl.id=te.shareable_link_id
       WHERE sl.playlist_id=$1 AND te.event_type='track_played'
       GROUP BY t.id ORDER BY play_count DESC`,
      [req.params.id]
    ),
    queryAll(
      `SELECT DATE(te.created_at) AS date, COUNT(*)::int AS events
       FROM tracking_events te
       JOIN shareable_links sl ON sl.id=te.shareable_link_id
       WHERE sl.playlist_id=$1 AND te.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(te.created_at) ORDER BY date`,
      [req.params.id]
    ),
  ]);

  res.json({ stats, trackStats, timeline });
});

module.exports = router;
