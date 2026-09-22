/**
 * End-to-end smoke test — runs the real Express app against an in-memory
 * Postgres (pg-mem). No external services needed:  `npm run test:e2e`
 *
 * Covers the critical path that was broken before the hardening pass:
 *   auth (JWT issue/verify, bcrypt, admin gate) → track create → playlist
 *   create (previously a missing endpoint) → add track → share link →
 *   public playback via share token.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-not-for-production";
process.env.JWT_EXPIRES_IN = "1h";
process.env.DATABASE_URL = "postgres://test/test";
process.env.LOG_LEVEL = "error";
process.env.FRONTEND_URL = "http://localhost:8080";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// Local-dir storage driver pointed at a throwaway temp dir.
const STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "hrl-e2e-store-"));
process.env.STORAGE_DRIVER = "fs";
process.env.STORAGE_FS_DIR = STORE_DIR;
process.on("exit", () => fs.rmSync(STORE_DIR, { recursive: true, force: true }));
const assert = require("assert");
const bcrypt = require("bcryptjs");
const { newDb, DataType } = require("pg-mem");

// ── Build an in-memory Postgres from the real schema (minus PG-only bits) ────
function loadSchema(db) {
  let sql = fs.readFileSync(path.join(__dirname, "../src/db/schema.sql"), "utf8");
  sql = sql
    .replace(/CREATE EXTENSION[^;]*;/gi, "")
    .replace(/DO \$\$[\s\S]*?\$\$;/gi, "")                 // enum + trigger DO-blocks
    .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, "")
    .replace(/CREATE INDEX[^;]*USING gin[^;]*;/gi, "")
    // enum column types → text (column name stays, only the 2nd token changes)
    .replace(/clearance_status\s+clearance_status/gi, "clearance_status text")
    .replace(/rights_type\s+rights_type/gi, "rights_type text")
    .replace(/\bstatus\s+lyrics_status/gi, "status text")
    .replace(/\bstatus\s+project_status/gi, "status text")
    .replace(/\bINET\b/gi, "text")
    .replace(/\b(decimal|numeric|varchar|char)\s*\([^)]*\)/gi, "$1")
    // idempotency ALTERs / DROPs — no-ops on a fresh in-memory DB
    .replace(/ALTER TABLE [\s\S]*?;/gi, "")
    .replace(/DROP TABLE IF EXISTS[^;]*;/gi, "");
  db.public.none(sql);
}

const db = newDb({ autoCreateForeignKeyIndices: true });
db.public.registerFunction({
  name: "gen_random_uuid",
  returns: DataType.uuid,
  impure: true,
  implementation: () => crypto.randomUUID(),
});
db.public.registerFunction({
  name: "now",
  returns: DataType.timestamptz,
  impure: true,
  implementation: () => new Date(),
});
loadSchema(db);

// Inject pg-mem's pg-compatible client before the app wires its pool.
const pgMem = db.adapters.createPg();
require.cache[require.resolve("pg")] = {
  id: require.resolve("pg"),
  filename: require.resolve("pg"),
  loaded: true,
  exports: pgMem,
};

const request = require("supertest");
const { app } = require("../src/app");

// ── Helpers ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n      ${e.message}`);
  }
}

(async () => {
  console.log("HRL Sync — E2E smoke test\n");

  // Seed an admin directly via the same pool the app uses.
  const { pool } = require("../src/db/pool");
  const adminPass = "admin-pass-123";
  const hash = await bcrypt.hash(adminPass, 10);
  const { rows: [admin] } = await pool.query(
    "INSERT INTO users (email, password_hash, full_name, is_admin) VALUES ($1,$2,$3,true) RETURNING *",
    ["admin@hrl.test", hash, "Admin"]
  );
  assert(admin && admin.id, "admin seeded");

  let adminToken, userToken, trackId, playlistId, shareToken;

  await check("GET /health → 200", async () => {
    const r = await request(app).get("/health");
    assert.strictEqual(r.status, 200, `got ${r.status}`);
    assert.strictEqual(r.body.db, "connected");
  });

  await check("login with wrong password → 401", async () => {
    const r = await request(app).post("/api/auth/login").send({ email: "admin@hrl.test", password: "nope" });
    assert.strictEqual(r.status, 401);
  });

  await check("login with correct password → token + admin flag", async () => {
    const r = await request(app).post("/api/auth/login").send({ email: "admin@hrl.test", password: adminPass });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert(r.body.token, "token present");
    assert.strictEqual(r.body.user.is_admin, true);
    adminToken = r.body.token;
  });

  await check("GET /api/auth/me without token → 401", async () => {
    const r = await request(app).get("/api/auth/me");
    assert.strictEqual(r.status, 401);
  });

  await check("GET /api/auth/me with token → user", async () => {
    const r = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.user.email, "admin@hrl.test");
    assert.strictEqual(r.body.user.password_hash, undefined, "password_hash not leaked");
  });

  await check("admin registers a non-admin user → 201", async () => {
    const r = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "user@hrl.test", password: "user-pass-123", full_name: "User" });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  });

  await check("new user can log in", async () => {
    const r = await request(app).post("/api/auth/login").send({ email: "user@hrl.test", password: "user-pass-123" });
    assert.strictEqual(r.status, 200);
    userToken = r.body.token;
  });

  await check("non-admin blocked from admin-only POST /api/tracks → 403", async () => {
    const r = await request(app)
      .post("/api/tracks")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ title: "x", artist: "y", file_name: "x.mp3" });
    assert.strictEqual(r.status, 403);
  });

  await check("admin creates a track → 201", async () => {
    const r = await request(app)
      .post("/api/tracks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Midnight Drive", artist: "HRL", file_name: "midnight.mp3", google_drive_file_id: "drive-abc" });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    trackId = r.body.id;
    assert(trackId, "track id");
  });

  let localTrackId;
  // A real (if minimal) WAV: magic-byte content detection (music-metadata) needs an
  // actual container, not just a plausible-looking header — a hand-rolled fake ID3
  // prefix used to pass here, but doesn't any more: parseFile() no longer throws on
  // it, it just returns format:{} (no .container), same as the "reject" path below
  // was designed to catch. This one produces a real format.container = 'WAVE'.
  function minimalWav(dataBytes) {
    const buf = Buffer.alloc(44 + dataBytes);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + dataBytes, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);          // fmt chunk size
    buf.writeUInt16LE(1, 20);           // PCM
    buf.writeUInt16LE(1, 22);           // channels
    buf.writeUInt32LE(44100, 24);       // sample rate
    buf.writeUInt32LE(44100 * 2, 28);   // byte rate
    buf.writeUInt16LE(2, 32);           // block align
    buf.writeUInt16LE(16, 34);          // bits per sample
    buf.write("data", 36);
    buf.writeUInt32LE(dataBytes, 40);
    return buf;
  }
  const fakeAudio = minimalWav(4096);

  await check("upload rejects a non-audio file → 400", async () => {
    const r = await request(app)
      .post("/api/tracks/upload")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from("hello"), { filename: "notes.txt", contentType: "text/plain" });
    assert.strictEqual(r.status, 400);
  });

  await check("admin uploads audio to the VPS library → 201, source=local", async () => {
    const r = await request(app)
      .post("/api/tracks/upload")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("title", "VPS Master")
      .field("artist", "HRL")
      // music-metadata's parseFile() (unlike parseBuffer()) uses the file extension as
      // a format hint and does NOT reliably fall back to content-sniffing on a mismatch
      // — a real gotcha (a user renaming a real .wav to .mp3 would get wrongly rejected
      // in production too), independent of this test. Extension must match content.
      .attach("file", fakeAudio, { filename: "vps master.wav", contentType: "audio/wav" });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.source, "local");
    assert(r.body.local_file_path, "local_file_path stored");
    localTrackId = r.body.id;
  });

  await check("real audio with a MISMATCHED extension is still accepted (regression, 2026-09-22)", async () => {
    // Real .wav bytes named .mp3 — must be accepted on content, not the filename.
    // This exact case (parseFile()'s extension hint, not real content-sniffing)
    // wrongly rejected a real upload in production once already (see the "this bit
    // us" comment on the upload handler) and was masked in this test suite by a
    // fake buffer that never triggered this path at all.
    const r = await request(app)
      .post("/api/tracks/upload")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("title", "Mislabeled File")
      .field("artist", "HRL")
      .attach("file", fakeAudio, { filename: "renamed-by-mistake.mp3", contentType: "audio/mpeg" });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await request(app).delete(`/api/tracks/${r.body.id}`).set("Authorization", `Bearer ${adminToken}`);
  });

  await check("owner streams the local file → 200 + bytes", async () => {
    const r = await request(app)
      .get(`/api/tracks/stream/${localTrackId}?token=${adminToken}`);
    assert.strictEqual(r.status, 200, `got ${r.status}`);
    assert(r.headers["accept-ranges"] === "bytes");
    assert(r.body.length > 0 || r.text.length > 0, "streamed a body");
  });

  await check("local stream honours Range → 206", async () => {
    const r = await request(app)
      .get(`/api/tracks/stream/${localTrackId}?token=${adminToken}`)
      .set("Range", "bytes=0-99");
    assert.strictEqual(r.status, 206);
    assert.strictEqual(r.headers["content-range"], `bytes 0-99/${fakeAudio.length}`);
  });

  await check("GET /api/tracks/storage reports driver + uploaded bytes", async () => {
    const r = await request(app).get("/api/tracks/storage").set("Authorization", `Bearer ${adminToken}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.driver, "fs");
    assert(r.body.localFiles >= 1, "counts the file");
    assert(r.body.localBytes > 0, "sums the bytes");
  });

  await check("uploaded object landed in the store, not the staging dir", async () => {
    const { rows } = await pool.query("SELECT object_key FROM tracks WHERE id=$1", [localTrackId]);
    const key = rows[0].object_key;
    assert(fs.existsSync(path.join(STORE_DIR, key)), "object in store");
    assert(!fs.existsSync(path.join(__dirname, "../uploads/.staging", key)), "staging temp cleaned up");
  });

  await check("deleting a local track removes its object", async () => {
    const { rows } = await pool.query("SELECT object_key FROM tracks WHERE id=$1", [localTrackId]);
    const objectPath = path.join(STORE_DIR, rows[0].object_key);
    assert(fs.existsSync(objectPath), "object exists before delete");
    const r = await request(app).delete(`/api/tracks/${localTrackId}`).set("Authorization", `Bearer ${adminToken}`);
    assert.strictEqual(r.status, 200);
    await new Promise((res) => setTimeout(res, 50)); // remove() is fire-and-forget
    assert(!fs.existsSync(objectPath), "object gone after delete");
  });

  await check("POST /api/playlists (was a missing endpoint) → 201", async () => {
    const r = await request(app)
      .post("/api/playlists")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Q1 Sync Pitch", description: "for the agency" });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    playlistId = r.body.id;
    assert(playlistId, "playlist id");
  });

  await check("add track to playlist → 201", async () => {
    const r = await request(app)
      .post(`/api/playlists/${playlistId}/tracks`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ track_id: trackId });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  });

  await check("create share link → token", async () => {
    const r = await request(app)
      .post(`/api/playlists/${playlistId}/share-link`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ allow_downloads: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    shareToken = r.body.link_token;
    assert(shareToken, "share token");
  });

  await check("PUBLIC GET /api/playlists/share/:token → playlist + track, no auth", async () => {
    const r = await request(app).get(`/api/playlists/share/${shareToken}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.playlist.tracks.length, 1);
    assert.strictEqual(r.body.playlist.tracks[0].id, trackId);
  });

  await check("stream with valid shareToken passes the auth gate (not 401)", async () => {
    const r = await request(app).get(`/api/tracks/stream/${trackId}?shareToken=${shareToken}`);
    assert.notStrictEqual(r.status, 401, "share token should grant access");
  });

  await check("stream without any token → 401", async () => {
    const r = await request(app).get(`/api/tracks/stream/${trackId}`);
    assert.strictEqual(r.status, 401);
  });

  await check("stream with a bogus shareToken → 401", async () => {
    const r = await request(app).get(`/api/tracks/stream/${trackId}?shareToken=deadbeef`);
    assert.strictEqual(r.status, 401);
  });

  console.log(`\n${failed === 0 ? "✅" : "❌"}  ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
