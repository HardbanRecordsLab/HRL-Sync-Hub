// Watermarked previews for public listening.
//
// Anyone without a login (public catalog, pitch links) hears a 128 kbps MP3 with an audible
// chime every 12 s — fine for choosing music, useless as a free copy. The full-quality file only
// leaves through a paid licence download (routes/licenses.js) or for the logged-in team.
//
// Previews live next to the originals in the shared bucket as `preview-v1-<content-hash>.mp3`
// (CMLP never lists the bucket) and are indexed in the local hrl_sync table `track_previews`,
// so the shared CMLP catalogue table is never altered.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pipeline } = require("stream/promises");
const objectStore = require("./storage");
const { query, queryOne, queryAll } = require("../db/pool");
const { logger } = require("../utils/logger");

const VERSION = "v1";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const MAX_PARALLEL = parseInt(process.env.PREVIEW_PARALLEL || "2", 10);

// Two-note chime (C6 + G6 + C7) every 12 s starting at 3 s, ~0.7 s with a fast decay.
const CHIME =
  "0.2*gte(t,3)*lt(mod(t-3,12),0.7)*exp(-4.5*mod(t-3,12))*" +
  "(sin(2*PI*1046.5*t)+0.6*sin(2*PI*1568*t)+0.3*sin(2*PI*2093*t))";

const inflight = new Map(); // trackId -> Promise<key>
let running = 0;
const waiting = [];
async function slot() {
  if (running < MAX_PARALLEL) { running++; return; }
  await new Promise((r) => waiting.push(r));
  running++;
}
function release() {
  running--;
  const next = waiting.shift();
  if (next) next();
}

function previewKey(objectKey) {
  const base = path.basename(objectKey).replace(/\.[^.]+$/, "");
  return `preview-${VERSION}-${base}.mp3`;
}

function runFfmpeg(input, output) {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner", "-loglevel", "error", "-y", "-i", input,
      "-filter_complex",
      `[0:a]aresample=44100,aformat=channel_layouts=stereo[m];` +
      `aevalsrc='${CHIME}|${CHIME}':s=44100:c=stereo[w];` +
      `[m][w]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[out]`,
      "-map", "[out]", "-map_metadata", "-1",
      "-metadata", "comment=Preview - license at hrl-sync.hub.hardbanrecordslab.online",
      "-c:a", "libmp3lame", "-b:a", "128k", output,
    ];
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString().slice(0, 2000); });
    p.on("error", reject); // ffmpeg missing
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.trim().slice(0, 300)}`))));
  });
}

async function build(track) {
  const key = previewKey(track.object_key);
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "hrl-preview-"));
  const src = path.join(tmp, "src" + (path.extname(track.object_key) || ".audio"));
  const out = path.join(tmp, "preview.mp3");
  await slot();
  try {
    await pipeline(await objectStore.getStream(path.basename(track.object_key)), fs.createWriteStream(src));
    await runFfmpeg(src, out);
    await objectStore.putFile(key, out, "audio/mpeg");
    await query(
      `INSERT INTO track_previews (track_id, object_key, version) VALUES ($1, $2, $3)
       ON CONFLICT (track_id) DO UPDATE SET object_key = EXCLUDED.object_key, version = EXCLUDED.version, created_at = now()`,
      [track.id, key, VERSION]
    );
    return key;
  } finally {
    release();
    fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** Returns the object key of a ready preview, building it if needed (deduped per track). */
async function ensurePreview(track) {
  if (!track?.object_key) return null;
  const row = await queryOne("SELECT object_key, version FROM track_previews WHERE track_id = $1", [track.id]);
  if (row && row.version === VERSION && row.object_key === previewKey(track.object_key) && (await objectStore.head(row.object_key))) {
    return row.object_key;
  }
  if (!inflight.has(track.id)) {
    inflight.set(track.id, build(track).finally(() => inflight.delete(track.id)));
  }
  return inflight.get(track.id);
}

/** Background: prepare previews for the whole public catalogue, one at a time. */
async function backfill() {
  const rows = await queryAll(
    `SELECT t.id, t.object_key FROM tracks t
     WHERE t.is_public = true AND t.object_key IS NOT NULL ORDER BY t.id`
  );
  const done = new Set((await queryAll("SELECT track_id FROM track_previews WHERE version = $1", [VERSION])).map((r) => r.track_id));
  const todo = rows.filter((r) => !done.has(r.id));
  if (!todo.length) return;
  logger.info(`Preview backfill: ${todo.length} tracks to prepare`);
  let ok = 0;
  let streak = 0;
  for (const t of todo) {
    for (let attempt = 1; ; attempt++) {
      try {
        await ensurePreview(t);
        ok++;
        streak = 0;
        if (ok % 50 === 0) logger.info(`Preview backfill: ${ok}/${todo.length}`);
        break;
      } catch (e) {
        // Storage/network trouble (e.g. DNS right after a redeploy): wait and retry instead of
        // burning through the whole catalogue with errors. Other errors: skip this track.
        const transient = /EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up/i.test(e.message);
        if (transient && attempt < 6) {
          await new Promise((r) => setTimeout(r, 30_000));
          continue;
        }
        logger.warn(`Preview ${t.id} failed: ${e.message}`);
        if (++streak >= 10) {
          logger.error("Preview backfill stopped after 10 failures in a row — previews will be built on first play.");
          return;
        }
        break;
      }
    }
  }
  logger.info(`Preview backfill finished: ${ok}/${todo.length}`);
}

// ── Licensed cut-downs (30 s / 60 s) ─────────────────────────────────────────
// Clean (no watermark), 320 kbps MP3, leading silence trimmed, 2 s fade-out. Built on first download and kept
// in the bucket as `edit-v1-<content-hash>-<seconds>.mp3`.
const EDIT_LENGTHS = [30, 60];

function editKey(objectKey, seconds) {
  return `edit-v1-${path.basename(objectKey).replace(/\.[^.]+$/, "")}-${seconds}.mp3`;
}

function runEdit(input, output, seconds) {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner", "-loglevel", "error", "-y", "-i", input,
      "-af", `silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:${seconds},afade=t=out:st=${seconds - 2}:d=2`,
      "-map_metadata", "0", "-c:a", "libmp3lame", "-b:a", "320k", output,
    ];
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString().slice(0, 2000); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.trim().slice(0, 300)}`))));
  });
}

async function ensureEdit(track, seconds) {
  if (!EDIT_LENGTHS.includes(seconds) || !track?.object_key) return null;
  const key = editKey(track.object_key, seconds);
  if (await objectStore.head(key)) return key;
  const flightKey = `${track.id}:${seconds}`;
  if (!inflight.has(flightKey)) {
    inflight.set(flightKey, (async () => {
      const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "hrl-edit-"));
      const src = path.join(tmp, "src" + (path.extname(track.object_key) || ".audio"));
      const out = path.join(tmp, "edit.mp3");
      await slot();
      try {
        await pipeline(await objectStore.getStream(path.basename(track.object_key)), fs.createWriteStream(src));
        await runEdit(src, out, seconds);
        await objectStore.putFile(key, out, "audio/mpeg");
        return key;
      } finally {
        release();
        fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
      }
    })().finally(() => inflight.delete(flightKey)));
  }
  return inflight.get(flightKey);
}


// ── Promo video for socials (TikTok / Reels / Shorts) ─────────────────────────
// 1080×1920, 20 s from the strongest part (30 s in, or the start for short tracks): animated waveform,
// title, artist and a licensing line. Clean audio — it is our own promotion. Cached as `promo-v1-<hash>.mp4`.
const FONT_BOLD = path.join(__dirname, "../assets/fonts/DejaVuSans-Bold.ttf");
const FONT = path.join(__dirname, "../assets/fonts/DejaVuSans.ttf");

function promoKey(objectKey) {
  return `promo-v1-${path.basename(objectKey).replace(/\.[^.]+$/, "")}.mp4`;
}

function runPromo(input, output, textDir, startAt) {
  // Text goes through textfile= so titles with quotes/colons never break the filtergraph.
  const esc = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
  const filter =
    `color=c=0x0B0B12:s=1080x1920:r=30[bg];` +
    `[0:a]aformat=channel_layouts=mono,volume=2.5,showwaves=s=1000x560:mode=cline:rate=30:colors=0xA78BFA:scale=cbrt:draw=full,format=rgba[w];` +
    `[bg][w]overlay=40:740:format=auto[v1];` +
    `[v1]drawtext=fontfile='${esc(FONT_BOLD)}':textfile='${esc(path.join(textDir, "title.txt"))}':fontsize=70:fontcolor=white:x=(w-text_w)/2:y=470,` +
    `drawtext=fontfile='${esc(FONT)}':textfile='${esc(path.join(textDir, "artist.txt"))}':fontsize=44:fontcolor=0xC4B5FD:x=(w-text_w)/2:y=580,` +
    `drawtext=fontfile='${esc(FONT_BOLD)}':textfile='${esc(path.join(textDir, "cta.txt"))}':fontsize=46:fontcolor=white:x=(w-text_w)/2:y=1480,` +
    `drawtext=fontfile='${esc(FONT)}':text='hrl-sync.hub.hardbanrecordslab.online':fontsize=32:fontcolor=0xC4B5FD:x=(w-text_w)/2:y=1560[v]`;
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner", "-loglevel", "error", "-y", "-ss", String(startAt), "-t", "20", "-i", input,
      "-filter_complex", filter, "-map", "[v]", "-map", "0:a",
      "-af", "afade=t=in:d=1,afade=t=out:st=18.5:d=1.5",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-c:a", "aac", "-b:a", "160k", "-shortest", output,
    ];
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString().slice(0, 2000); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.trim().slice(0, 400)}`))));
  });
}

async function ensurePromoVideo(track) {
  if (!track?.object_key) return null;
  const key = promoKey(track.object_key);
  if (await objectStore.head(key)) return key;
  const flightKey = `promo:${track.id}`;
  if (!inflight.has(flightKey)) {
    inflight.set(flightKey, (async () => {
      const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "hrl-promo-"));
      const src = path.join(tmp, "src" + (path.extname(track.object_key) || ".audio"));
      const out = path.join(tmp, "promo.mp4");
      await fs.promises.writeFile(path.join(tmp, "title.txt"), String(track.title || "").slice(0, 40));
      await fs.promises.writeFile(path.join(tmp, "artist.txt"), String(track.artist || "").slice(0, 40));
      await fs.promises.writeFile(path.join(tmp, "cta.txt"), "License this track for your video");
      await slot();
      try {
        await pipeline(await objectStore.getStream(path.basename(track.object_key)), fs.createWriteStream(src));
        const seconds = (track.duration_ms || 0) / 1000;
        await runPromo(src, out, tmp, seconds >= 55 ? 30 : 0);
        await objectStore.putFile(key, out, "video/mp4");
        return key;
      } finally {
        release();
        fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
      }
    })().finally(() => inflight.delete(flightKey)));
  }
  return inflight.get(flightKey);
}

module.exports = { ensurePreview, backfill, previewKey, VERSION, ensureEdit, EDIT_LENGTHS, ensurePromoVideo, _runPromo: runPromo };
