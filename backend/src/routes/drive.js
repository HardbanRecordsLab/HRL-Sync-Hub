const express  = require("express");
const router   = express.Router();
const drive    = require("../services/googleDrive");
const { query, queryOne, queryAll } = require("../db/pool");
const { parseBuffer } = require("music-metadata");

const AUDIO_MIMES = [
  "audio/mpeg","audio/mp3","audio/wav","audio/x-wav",
  "audio/flac","audio/aac","audio/ogg","audio/x-m4a",
];

// ── GET /api/drive/auth-url ───────────────────────────────────────────────────
router.get("/auth-url", async (req, res) => {
  const url = drive.getAuthUrl(req.userId);
  res.json({ url });
});

// ── GET /api/drive/status ─────────────────────────────────────────────────────
router.get("/status", async (req, res) => {
  const status = await drive.getStatus(req.userId);
  res.json(status);
});

// ── DELETE /api/drive/disconnect ──────────────────────────────────────────────
router.delete("/disconnect", async (req, res) => {
  await drive.disconnect(req.userId);
  res.json({ success: true });
});

// ── GET /api/drive/files ──────────────────────────────────────────────────────
router.get("/files", async (req, res) => {
  const { folderId, search, pageToken, type } = req.query;
  const mimeTypes = type === "audio" ? AUDIO_MIMES : undefined;
  const result = await drive.listFiles(req.userId, { folderId, search, pageToken, mimeTypes });
  res.json(result);
});

// ── GET /api/drive/stream/:fileId ─────────────────────────────────────────────
// Main audio proxy — streams Drive file to browser
router.get("/stream/:fileId", async (req, res) => {
  const range = req.headers.range;
  if (range) {
    await drive.streamFileRange(req.userId, req.params.fileId, range, res);
  } else {
    await drive.streamFile(req.userId, req.params.fileId, res);
  }
});

// ── GET /api/drive/meta/:fileId ───────────────────────────────────────────────
router.get("/meta/:fileId", async (req, res) => {
  const meta = await drive.getFileMeta(req.userId, req.params.fileId);
  res.json(meta);
});

// ── POST /api/drive/import ────────────────────────────────────────────────────
// Registers Drive file as a track (metadata only, no copy)
router.post("/import", async (req, res) => {
  const { fileId } = req.body;
  if (!fileId) return res.status(400).json({ error: "fileId required" });

  const meta = await drive.getFileMeta(req.userId, fileId);

  // Clean title from filename
  const title = meta.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  const existing = await queryOne(
    "SELECT id FROM tracks WHERE user_id = $1 AND google_drive_file_id = $2",
    [req.userId, fileId]
  );
  if (existing) return res.json({ track: existing, imported: false, message: "Already in library" });

  const { rows: [track] } = await query(
    `INSERT INTO tracks (user_id, title, artist, file_name, file_size, mime_type,
       google_drive_file_id, source, clearance_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'google_drive', 'not_cleared')
     RETURNING *`,
    [req.userId, title, "Unknown", meta.name, parseInt(meta.size || "0"), meta.mimeType, fileId]
  );

  res.json({ track, imported: true });
});

// ── POST /api/drive/import-bulk ───────────────────────────────────────────────
router.post("/import-bulk", async (req, res) => {
  const { fileIds } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: "fileIds array required" });
  }

  const results = await Promise.allSettled(
    fileIds.map(async (fileId) => {
      const meta  = await drive.getFileMeta(req.userId, fileId);
      const title = meta.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      const { rows: [track] } = await query(
        `INSERT INTO tracks (user_id, title, artist, file_name, file_size, mime_type,
           google_drive_file_id, source, clearance_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'google_drive','not_cleared')
         ON CONFLICT DO NOTHING RETURNING *`,
        [req.userId, title, "Unknown", meta.name, parseInt(meta.size || "0"), meta.mimeType, fileId]
      );
      return track;
    })
  );

  const imported = results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
  res.json({ imported: imported.length, total: fileIds.length, tracks: imported });
});

// ── POST /api/drive/sync-lyrics ───────────────────────────────────────────────
router.post("/sync-lyrics", async (req, res) => {
  const { docId, lyricsId } = req.body;
  if (!docId) return res.status(400).json({ error: "docId required" });

  const { title, text } = await drive.readGoogleDoc(req.userId, docId);
  const preview = text.substring(0, 200);

  let lyricsRow;
  if (lyricsId) {
    const { rows: [r] } = await query(
      `UPDATE lyrics SET content = $1, preview_text = $2, google_doc_id = $3,
         last_synced_from_drive = now(), updated_at = now()
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [text, preview, docId, lyricsId, req.userId]
    );
    lyricsRow = r;
  } else {
    const { rows: [r] } = await query(
      `INSERT INTO lyrics (user_id, title, content, preview_text, google_doc_id, last_synced_from_drive)
       VALUES ($1,$2,$3,$4,$5,now()) RETURNING *`,
      [req.userId, title, text, preview, docId]
    );
    lyricsRow = r;
  }

  res.json({ success: true, lyrics: lyricsRow });
});

module.exports = router;
