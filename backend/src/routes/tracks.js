const express = require("express");
const router = express.Router();
const { query, queryOne, queryAll } = require("../db/pool");
const { catalogQuery } = require("../db/catalogPool");
const { logger } = require("../utils/logger");
const objectStore = require("../services/storage");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { parseFile } = require("music-metadata");

const { requireAdmin } = require("../middleware/auth");

// ── Library audio storage (MinIO / S3 via services/storage.js) ───────────────
// Uploads land in a temp dir, then stream into the object store; the DB column
// `local_file_path` holds the object key.
const STAGING_DIR = path.join(__dirname, "../../uploads", ".staging");
const MAX_UPLOAD_BYTES = (parseInt(process.env.MAX_UPLOAD_MB || "300", 10)) * 1024 * 1024;

// ── Rejected-upload quarantine ────────────────────────────────────────────────
// Keeps the last N files that failed the "is this actually audio" check, so a
// false-positive rejection can be inspected/reproduced instead of vanishing.
const QUARANTINE_DIR = path.join(__dirname, "../../uploads", ".rejected");
const QUARANTINE_MAX_FILES = 20;

async function quarantineRejectedUpload(tmpPath, objectKey) {
  try {
    await fs.promises.mkdir(QUARANTINE_DIR, { recursive: true });
    const dest = path.join(QUARANTINE_DIR, `${Date.now()}-${objectKey}`);
    await fs.promises.rename(tmpPath, dest);

    const entries = await fs.promises.readdir(QUARANTINE_DIR);
    if (entries.length > QUARANTINE_MAX_FILES) {
      const withTimes = await Promise.all(
        entries.map(async (name) => {
          const full = path.join(QUARANTINE_DIR, name);
          const stat = await fs.promises.stat(full).catch(() => null);
          return { full, mtime: stat ? stat.mtimeMs : 0 };
        })
      );
      withTimes.sort((a, b) => a.mtime - b.mtime);
      const toRemove = withTimes.slice(0, withTimes.length - QUARANTINE_MAX_FILES);
      await Promise.all(toRemove.map((f) => fs.promises.unlink(f.full).catch(() => {})));
    }
  } catch (e) {
    logger.warn(`Could not quarantine rejected upload ${objectKey}: ${e.message}`);
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
    cb(null, STAGING_DIR);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\- ]+/g, "_").slice(-120);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}`);
  },
});
const upload = multer({
  storage: multerStorage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^audio\//i.test(file.mimetype) || file.mimetype === "application/ogg") return cb(null, true);
    cb(Object.assign(new Error("Only audio files are allowed"), { status: 400 }));
  },
});

// GET /api/tracks/storage — how much of the library store is in use
router.get("/storage", async (req, res) => {
  const row = await queryOne(
    `SELECT COUNT(*) FILTER (WHERE source='local')::int AS local_files,
            COALESCE(SUM(file_size) FILTER (WHERE source='local'),0)::bigint AS local_bytes,
            COUNT(*)::int AS total_tracks
     FROM tracks`
  );
  res.json({
    driver: objectStore.driver,
    bucket: objectStore.bucket,
    localFiles: row.local_files,
    localBytes: Number(row.local_bytes),
    totalTracks: row.total_tracks,
    maxUploadBytes: MAX_UPLOAD_BYTES,
  });
});

// ── Streaming / Download ──────────────────────────────────────────────────
router.get("/stream/:id", async (req, res) => {
  const { shareToken } = req.query;
  const trackId = req.params.id;

  let hasAccess = false;
  if (req.userId) {
    // Shared catalog: any logged-in user has access, not just the uploader
    const track = await queryOne("SELECT id FROM tracks WHERE id=$1", [trackId]);
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

  if (track.source === "local" && track.object_key) {
    const key = path.basename(track.object_key); // defends against any '../'
    const meta = await objectStore.head(key);
    if (!meta) return res.status(404).json({ error: "File missing from storage" });

    const size = meta.size;
    const type = track.mime_type || "audio/mpeg";
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, no-store");

    const m = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        res.setHeader("Content-Range", `bytes */${size}`);
        return res.status(416).end();
      }
      end = Math.min(end, size - 1);
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": end - start + 1,
        "Content-Type": type,
      });
      const partial = await objectStore.getStream(key, { start, end });
      partial.on("error", (e) => { logger.error(`stream ${key}: ${e.message}`); res.destroy(); });
      return partial.pipe(res);
    }

    res.writeHead(200, { "Content-Length": size, "Content-Type": type });
    const full = await objectStore.getStream(key);
    full.on("error", (e) => { logger.error(`stream ${key}: ${e.message}`); res.destroy(); });
    return full.pipe(res);
  }

  return res.status(404).json({ error: "Track has no playable file" });
});

const uploadSingle = (req, res, next) =>
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `File too large (max ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB)` });
    }
    return res.status(err.status || 400).json({ error: err.message || "Upload failed" });
  });

// ── POST /api/tracks/upload — audio into the object store (MinIO/S3) ─────────
router.post("/upload", requireAdmin, uploadSingle, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const tmpPath = req.file.path;
  const stagingLabel = req.file.filename; // multer's random staging name — only used for logs/quarantine
  const size = req.file.size;

  let common = {};
  let format = {};
  let parseFailed = false;
  let parseError = null;
  try {
    const meta = await parseFile(tmpPath);
    common = meta.common || {};
    format = meta.format || {};
  } catch (e) {
    parseFailed = true;
    parseError = e.message;
  }

  // music-metadata does real binary format detection across every audio
  // container we accept (mp3 incl. ID3v2, wav, flac, ogg, m4a/aac...), but
  // it doesn't throw on garbage input — it just returns an empty format
  // object (no `container`, no `codec`). A real audio file always has
  // `format.container` set, so that's the actual signal to check, not
  // whether parseFile() threw. Reject here instead of the previous
  // silent-continue, which let anything through as long as the
  // client-supplied MIME type started with "audio/".
  if (parseFailed || !format.container) {
    // Quarantine instead of delete: a rejection with no surviving evidence is
    // undiagnosable (this bit us — a real WAV was rejected and the file was
    // gone before anyone could inspect it). Keep the last 20 rejects so a
    // real bug can be reproduced from the actual bytes, not guessed at.
    await quarantineRejectedUpload(tmpPath, stagingLabel);
    logger.warn(`Rejected upload ${stagingLabel}: not a recognizable audio file (${parseFailed ? `parseFile threw: ${parseError}` : "empty format.container"})`);
    return res.status(400).json({ error: "File does not look like a valid audio file" });
  }

  const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));
  const title = req.body.title || common.title || req.file.originalname.replace(/\.[^/.]+$/, "");
  const artist = req.body.artist || (common.artists && common.artists[0]) || common.artist || "Unknown artist";
  const composer = req.body.composer || (common.composer && common.composer[0]) || null;
  const bpm = num(req.body.bpm) ?? num(common.bpm);
  const key = req.body.key || common.key || null;
  const catalogNumber = req.body.catalog_number || req.body.catalogNumber || null;
  const duration = num(format.duration);

  // Content-hash object key (not the random staging name) — the same audio
  // uploaded through CMLP resolves to the same key, so the shared bucket
  // (see handbook §9/§12, decided 2026-09-17) naturally dedupes instead of
  // storing the same bytes twice under two different names.
  const fileBuffer = await fs.promises.readFile(tmpPath);
  const contentHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const ext = path.extname(req.file.originalname) || path.extname(stagingLabel);
  const objectKey = `${contentHash}${ext}`;

  // Move the staged temp file into the object store (this also deletes the temp file).
  try {
    await objectStore.putFile(objectKey, tmpPath, req.file.mimetype);
  } catch (e) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    logger.error(`Object store upload failed: ${e.message}`);
    return res.status(502).json({ error: "Storage backend unavailable" });
  }

  try {
    // Straight to cmlp (not the hrl_sync/FDW pool) — see db/catalogPool.js for why.
    const { rows: [track] } = await catalogQuery(
      `INSERT INTO tracks (title, artist, composer, filename, file_size, mime_type,
         object_key, file_hash, source, bpm, musical_key, duration_ms, catalog_number, clearance_status, is_public, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'local',$9,$10,$11,$12,'not_cleared',false,'active')
       RETURNING *, musical_key AS key, filename AS file_name, object_key AS local_file_path, duration_ms/1000 AS duration`,
      [title, artist, composer, req.file.originalname, size,
       req.file.mimetype, objectKey, contentHash, bpm, key, duration ? duration * 1000 : null, catalogNumber]
    );
    logger.info(`Uploaded track ${track.id} → ${objectStore.driver}:${objectKey} (${size} bytes)`);
    res.status(201).json(track);
  } catch (err) {
    await objectStore.remove(objectKey).catch(() => {}); // no orphan object
    logger.error(`Upload DB insert failed: ${err.message}`);
    res.status(500).json({ error: "Could not save track" });
  }
});

// ── GET /api/tracks ────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { search, clearance, bpm_min, bpm_max, key, genre, mood, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let where = "1=1";

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (t.title ILIKE $${params.length} OR t.artist ILIKE $${params.length} OR t.composer ILIKE $${params.length})`;
  }
  if (clearance) { params.push(clearance); where += ` AND t.clearance_status = $${params.length}::clearance_status`; }
  if (key) { params.push(key); where += ` AND t.musical_key = $${params.length}`; }
  if (bpm_min) { params.push(bpm_min); where += ` AND t.bpm >= $${params.length}`; }
  if (bpm_max) { params.push(bpm_max); where += ` AND t.bpm <= $${params.length}`; }
  if (genre) {
    params.push(genre);
    where += ` AND t.genre=$${params.length}`;
  }
  if (mood) {
    params.push(mood);
    where += ` AND t.mood @> to_jsonb($${params.length}::text)`;
  }

  const countParams = [...params];
  const { rows: [{ count }] } = await query(`SELECT COUNT(*) FROM tracks t WHERE ${where}`, countParams);

  params.push(parseInt(limit), offset);
  const rows = await queryAll(
    `SELECT t.*, t.musical_key AS key, t.filename AS file_name, t.object_key AS local_file_path,
       t.duration_ms/1000 AS duration
     FROM tracks t
     WHERE ${where}
     ORDER BY t.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, parseInt(limit), offset]
  );

  res.json({ tracks: rows, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
});

// ── GET /api/tracks/public (Public Library) ───────────────────────────────────
router.get("/public", async (req, res) => {
  const rows = await queryAll(
    `SELECT t.id, t.title, t.artist, t.duration_ms/1000 AS duration, t.bpm, t.musical_key AS key, t.clearance_status
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
    `SELECT t.id, t.title, t.artist, t.bpm, t.musical_key AS key, t.duration_ms/1000 AS duration, t.clearance_status,
       similarity(t.title, $1) AS title_score,
       similarity(t.artist, $1) AS artist_score
     FROM tracks t
     WHERE (t.title % $1 OR t.artist % $1 OR t.title ILIKE $2 OR t.artist ILIKE $2)
     ORDER BY GREATEST(similarity(t.title,$1), similarity(t.artist,$1)) DESC
     LIMIT 20`,
    [q, `%${q}%`]
  );
  res.json({ tracks: rows });
});

// ── Metadata Engine integration ───────────────────────────────────────────────
// Both services run on the same VPS and share the `hbrl-db` Docker network, so
// this stays entirely internal — no public domain, no API key (Metadata Engine's
// /tag/file endpoint currently has none; see handbook note on that).
const METADATA_ENGINE_API_URL = process.env.METADATA_ENGINE_API_URL || "http://metadata-backend:7860/api";
const TAGGABLE_EXTENSIONS = new Set([".mp3", ".wav", ".flac"]);

// ── POST /api/tracks/:id/tag-via-metadata-engine — embed ID3/Vorbis tags ─────
// using Metadata Engine's DSP-driven tagger, then overwrite the stored file.
router.post("/:id/tag-via-metadata-engine", requireAdmin, async (req, res) => {
  const track = await queryOne(
    `SELECT t.*, t.musical_key AS key, t.filename AS file_name, t.object_key AS local_file_path,
       t.duration_ms/1000 AS duration,
       COALESCE(t.genre::jsonb, '[]') AS genres,
       COALESCE(t.mood, '[]') AS moods,
       COALESCE(t.metadata->'instruments', '[]') AS instruments,
       COALESCE(t.metadata->'keywords', '[]') AS keywords
     FROM tracks t
     WHERE t.id = $1`,
    [req.params.id]
  );
  if (!track) return res.status(404).json({ error: "Track not found" });
  if (track.source !== "local" || !track.local_file_path) {
    return res.status(400).json({ error: "Track has no stored audio file to tag" });
  }

  const objectKey = path.basename(track.local_file_path);
  const ext = path.extname(track.file_name || "").toLowerCase();
  if (!TAGGABLE_EXTENSIONS.has(ext)) {
    return res.status(400).json({ error: "Metadata Engine can only tag MP3, WAV or FLAC files" });
  }

  let sourceBuffer;
  try {
    const stream = await objectStore.getStream(objectKey);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    sourceBuffer = Buffer.concat(chunks);
  } catch (e) {
    logger.error(`tag-via-metadata-engine: could not read stored audio for track ${track.id}: ${e.message}`);
    return res.status(502).json({ error: "Could not read stored audio file" });
  }

  const meta = {
    title: track.title,
    artist: track.artist,
    composer: track.composer || undefined,
    bpm: track.bpm || undefined,
    key: track.key || undefined,
    trackDescription: track.description || undefined,
    moods: track.moods || [],
    keywords: track.keywords || [],
    instrumentation: track.instruments || [],
    catalogNumber: track.catalog_number || undefined,
    mainGenre: track.genre || undefined,
    additionalGenres: [],
  };

  const form = new FormData();
  form.append("file", new Blob([sourceBuffer]), track.file_name || objectKey);
  form.append("metadata", JSON.stringify(meta));

  let taggedBuffer;
  try {
    const upstream = await fetch(`${METADATA_ENGINE_API_URL}/tag/file`, { method: "POST", body: form });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      logger.error(`tag-via-metadata-engine: Metadata Engine returned ${upstream.status} for track ${track.id}: ${detail.slice(0, 300)}`);
      return res.status(502).json({ error: "Metadata Engine could not tag this file" });
    }
    taggedBuffer = Buffer.from(await upstream.arrayBuffer());
  } catch (e) {
    logger.error(`tag-via-metadata-engine: request to Metadata Engine failed: ${e.message}`);
    return res.status(502).json({ error: "Metadata Engine is unreachable" });
  }

  // Re-validate before overwriting the stored file — never trust an upstream
  // response blindly, same bar as a direct user upload (see /upload above).
  fs.mkdirSync(STAGING_DIR, { recursive: true });
  const tmpPath = path.join(STAGING_DIR, `${Date.now()}-${Math.round(Math.random() * 1e9)}-tagged-${objectKey}`);
  await fs.promises.writeFile(tmpPath, taggedBuffer);

  let format = {};
  let parseFailed = false;
  try {
    const parsed = await parseFile(tmpPath);
    format = parsed.format || {};
  } catch (e) {
    parseFailed = true;
  }
  if (parseFailed || !format.container) {
    await quarantineRejectedUpload(tmpPath, `tagged-${objectKey}`);
    logger.error(`tag-via-metadata-engine: Metadata Engine returned an unparseable file for track ${track.id}`);
    return res.status(502).json({ error: "Metadata Engine returned an invalid audio file — original left untouched" });
  }

  try {
    const stored = await objectStore.putFile(objectKey, tmpPath, track.mime_type);
    const newSize = stored?.size ?? taggedBuffer.length;
    await query("UPDATE tracks SET file_size=$1, updated_at=now() WHERE id=$2", [newSize, track.id]);
    logger.info(`Tagged track ${track.id} via Metadata Engine (${newSize} bytes)`);
    res.json({ success: true, fileSize: newSize });
  } catch (e) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    logger.error(`tag-via-metadata-engine: could not store tagged file for track ${track.id}: ${e.message}`);
    res.status(500).json({ error: "Could not save tagged file" });
  }
});

// ── GET /api/tracks/:id ────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const track = await queryOne(
    `SELECT t.*, t.musical_key AS key, t.filename AS file_name, t.object_key AS local_file_path,
       t.duration_ms/1000 AS duration,
       COALESCE(t.genre::jsonb, '[]') AS track_genres,
       COALESCE(t.mood, '[]') AS track_moods,
       COALESCE(t.metadata->'instruments', '[]') AS track_instruments,
       COALESCE(t.metadata->'keywords', '[]') AS track_keywords,
       COALESCE(json_agg(DISTINCT jsonb_build_object('id',l.id,'title',l.title,'status',l.status,'language',l.language)) FILTER (WHERE l.id IS NOT NULL),'[]') AS lyrics
     FROM tracks t
     LEFT JOIN lyrics l ON l.track_id=t.id
     WHERE t.id=$1
     GROUP BY t.id`,
    [req.params.id]
  );
  if (!track) return res.status(404).json({ error: "Track not found" });
  res.json(track);
});

// ── POST /api/tracks — metadata-only row (no file; e.g. bulk import / tests) ──
router.post("/", requireAdmin, async (req, res) => {
  const {
    title, artist, composer, isrc, iswc, catalog_number, file_name, file_size, mime_type,
    duration, bpm, key, description, rights_type, clearance_status
  } = req.body;
  if (!title || !artist || !file_name) return res.status(400).json({ error: "title, artist, file_name required" });

  // Straight to cmlp (not the hrl_sync/FDW pool) — see db/catalogPool.js for why.
  const { rows: [t] } = await catalogQuery(
    `INSERT INTO tracks (title,artist,composer,isrc,iswc,catalog_number,filename,file_size,mime_type,
       duration_ms,bpm,musical_key,description,clearance_status,source,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'local','active')
     RETURNING *, musical_key AS key, filename AS file_name, duration_ms/1000 AS duration`,
    [title, artist, composer ?? null, isrc ?? null, iswc ?? null, catalog_number ?? null, file_name,
    file_size ?? null, mime_type ?? 'audio/mpeg',
    duration ? duration * 1000 : null, bpm ?? null, key ?? null, description ?? null,
    clearance_status ?? 'not_cleared']
  );
  res.status(201).json(t);
});

// ── PATCH /api/tracks/:id ──────────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  // Sync-Hub field name -> real CMLP column name (and any value transform, e.g. seconds -> ms)
  const COLMAP = {
    title: "title", artist: "artist", composer: "composer", isrc: "isrc", iswc: "iswc",
    catalog_number: "catalog_number", bpm: "bpm", key: "musical_key", description: "description",
    clearance_status: "clearance_status", mime_type: "mime_type", file_name: "filename",
    duration: ["duration_ms", (v) => v * 1000],
  };
  const sets = [], params = [];
  Object.keys(COLMAP).forEach(k => {
    if (req.body[k] === undefined) return;
    const m = COLMAP[k];
    const [col, xform] = Array.isArray(m) ? m : [m, (v) => v];
    params.push(xform(req.body[k]));
    sets.push(`${col}=$${params.length}`);
  });
  if (!sets.length) return res.status(400).json({ error: "No valid fields" });
  params.push(req.params.id);
  const { rows: [t] } = await query(
    `UPDATE tracks SET ${sets.join(",")},updated_at=now() WHERE id=$${params.length}
     RETURNING *, musical_key AS key, filename AS file_name, duration_ms/1000 AS duration`,
    params
  );
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json(t);
});

// ── DELETE /api/tracks/:id (also removes the stored object) ─────────────────
router.delete("/:id", async (req, res) => {
  const { rows: [track] } = await query(
    "DELETE FROM tracks WHERE id=$1 RETURNING source, object_key",
    [req.params.id]
  );
  if (track?.source === "local" && track.object_key) {
    objectStore
      .remove(path.basename(track.object_key))
      .catch((e) => logger.warn(`Could not delete object ${track.object_key}: ${e.message}`));
  }
  res.json({ success: true });
});

// ── POST /api/tracks/:id/genres — writes tracks.genre directly (shared catalog uses
// CMLP's single-genre column). track_genres (multi-genre) is retired: it had zero rows
// in production, see tracks_legacy_2026_09_22, 2026-09-22.
router.post("/:id/genres", async (req, res) => {
  const { genres } = req.body; // [{ genre, sub_genre? }]
  const primary = (genres || [])[0]?.genre ?? null;
  const { rows: [t] } = await query("UPDATE tracks SET genre=$1,updated_at=now() WHERE id=$2 RETURNING id,genre", [primary, req.params.id]);
  if (!t) return res.status(404).json({ error: "Track not found" });
  res.json({ success: true });
});

// ── POST /api/tracks/:id/moods — writes tracks.mood (jsonb array) directly ──────
router.post("/:id/moods", async (req, res) => {
  const { moods } = req.body; // string[]
  const { rows: [t] } = await query(
    "UPDATE tracks SET mood=$1::jsonb,updated_at=now() WHERE id=$2 RETURNING id",
    [JSON.stringify(moods || []), req.params.id]
  );
  if (!t) return res.status(404).json({ error: "Track not found" });
  res.json({ success: true });
});

// ── POST /api/tracks/:id/instruments — folded into tracks.metadata->'instruments' ──
router.post("/:id/instruments", async (req, res) => {
  const { instruments } = req.body; // string[]
  const { rows: [t] } = await query(
    "UPDATE tracks SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('instruments',$1::jsonb),updated_at=now() WHERE id=$2 RETURNING id",
    [JSON.stringify(instruments || []), req.params.id]
  );
  if (!t) return res.status(404).json({ error: "Track not found" });
  res.json({ success: true });
});

// ── POST /api/tracks/:id/keywords — folded into tracks.metadata->'keywords' ────────
router.post("/:id/keywords", async (req, res) => {
  const { keywords } = req.body; // string[]
  const { rows: [t] } = await query(
    "UPDATE tracks SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('keywords',$1::jsonb),updated_at=now() WHERE id=$2 RETURNING id",
    [JSON.stringify(keywords || []), req.params.id]
  );
  if (!t) return res.status(404).json({ error: "Track not found" });
  res.json({ success: true });
});

// track_rights (per-writer royalty splits) and track_versions (alternate file versions)
// are retired as of 2026-09-22: every track in the shared catalog is 100% HRL/CMLP-owned
// (no splits to track — Kamil, 2026-09-22) and track_versions had zero rows in production.
// See track_rights_legacy_2026_09_22 / track_versions_legacy_2026_09_22 if ever needed again.

module.exports = router;
