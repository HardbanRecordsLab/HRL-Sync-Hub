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
    assert.strictEqual(r.body.allow_downloads, false, "share links never allow free downloads");
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



  // ── Track metadata (CMLP catalogue shape: text genre, mood object, analysis jsonb) ──
  let metaTrackId;
  await check("track page loads a CMLP-shaped track (text genre, mood object, analysis)", async () => {
    const { rows: [t] } = await pool.query(
      `INSERT INTO tracks (title, artist, filename, genre, mood, metadata, bpm, musical_key)
       VALUES ('Korona Szosy','CMLP','korona.mp3','Cinematic Neo-Soul',$1::jsonb,$2::jsonb,144,'G#') RETURNING id`,
      [JSON.stringify({ tags: ["melancholic", "driving"], vibe: "Night drive", energyLevel: "Medium" }),
       JSON.stringify({ keywords: ["urban"], useCases: ["car ad"], instrumentation: ["piano"], publisher: "HardbanRecords Lab" })]);
    metaTrackId = t.id;
    const r = await request(app).get(`/api/tracks/${metaTrackId}`).set("Authorization", `Bearer ${adminToken}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.genre, "Cinematic Neo-Soul");
    assert.deepStrictEqual(r.body.track_moods, ["melancholic", "driving"]);
    assert.strictEqual(r.body.mood_vibe, "Night drive");
    assert.deepStrictEqual(r.body.metadata.useCases, ["car ad"]);
  });

  await check("editing metadata: empty BPM clears it, analysis + moods merge, nothing else lost", async () => {
    const r = await request(app).patch(`/api/tracks/${metaTrackId}`).set("Authorization", `Bearer ${adminToken}`).send({
      title: "Korona Szosy", artist: "CMLP", bpm: "", key: "A", album: "Nocne trasy", year: "2026", composer: "",
      moods: ["calm", "hopeful"], keywords: ["night", "city"], useCases: ["travel vlog"], genre: "Neo-Soul",
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const g = await request(app).get(`/api/tracks/${metaTrackId}`).set("Authorization", `Bearer ${adminToken}`);
    assert.strictEqual(g.body.bpm, null);
    assert.strictEqual(g.body.key, "A");
    assert.strictEqual(g.body.album, "Nocne trasy");
    assert.strictEqual(g.body.year, 2026);
    assert.deepStrictEqual(g.body.track_moods, ["calm", "hopeful"]);
    assert.strictEqual(g.body.mood_vibe, "Night drive", "vibe kept");
    assert.deepStrictEqual(g.body.metadata.keywords, ["night", "city"]);
    assert.deepStrictEqual(g.body.metadata.instrumentation, ["piano"], "untouched analysis keys kept");
    assert.strictEqual(g.body.metadata.publisher, "HardbanRecords Lab");
  });

  await check("invalid edits are rejected with a clear 400", async () => {
    const h = { Authorization: `Bearer ${adminToken}` };
    assert.strictEqual((await request(app).patch(`/api/tracks/${metaTrackId}`).set(h).send({ bpm: "fast" })).status, 400);
    assert.strictEqual((await request(app).patch(`/api/tracks/${metaTrackId}`).set(h).send({ title: "  " })).status, 400);
    assert.strictEqual((await request(app).patch(`/api/tracks/${metaTrackId}`).set(h).send({ clearance_status: "maybe" })).status, 400);
  });

  await check("mood chips keep CMLP's mood object", async () => {
    const r = await request(app).post(`/api/tracks/${metaTrackId}/moods`).set("Authorization", `Bearer ${adminToken}`).send({ moods: ["epic"] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const { rows: [t] } = await pool.query("SELECT mood FROM tracks WHERE id = $1", [metaTrackId]);
    assert.deepStrictEqual(t.mood.tags, ["epic"]);
    assert.strictEqual(t.mood.vibe, "Night drive");
  });



  await check("public catalogue exposes analysis tags; 'more like this' ranks the closest track first", async () => {
    await pool.query("UPDATE tracks SET is_public = true WHERE id = $1", [metaTrackId]);
    const mk = async (title, genre, tags, bpm) => (await pool.query(
      `INSERT INTO tracks (title, artist, filename, genre, mood, metadata, bpm, is_public)
       VALUES ($1,'CMLP','x.mp3',$2,$3::jsonb,$4::jsonb,$5,true) RETURNING id`,
      [title, genre, JSON.stringify({ tags, energyLevel: "Medium" }), JSON.stringify({ keywords: tags, hasVocals: true }), bpm])).rows[0].id;
    const near = await mk("Nocny Spacer", "Neo-Soul", ["calm", "hopeful", "night", "city"], 140);
    await mk("Rave Storm", "Hard Techno", ["aggressive", "dark"], 150);
    require("../src/services/catalog").invalidate();
    const cat = await request(app).get("/api/tracks/public");
    const me = cat.body.tracks.find((t) => t.id === metaTrackId);
    assert(me && me.moods.includes("epic") && me.keywords.includes("night") && me.vibe === "Night drive", JSON.stringify(me));
    const sim = await request(app).get(`/api/tracks/public/similar/${metaTrackId}`);
    assert.strictEqual(sim.status, 200, JSON.stringify(sim.body));
    assert.strictEqual(sim.body.tracks[0].id, near, "closest first");
    assert.strictEqual((await request(app).get("/api/tracks/public/similar/999999")).status, 404);
  });

  // ── Promotion partners ────────────────────────────────────────────────────
  let partnerId;
  await check("promo: team only; starter list seeds once", async () => {
    assert.strictEqual((await request(app).get("/api/promo")).status, 401);
    const h = { Authorization: `Bearer ${adminToken}` };
    const a = await request(app).post("/api/promo/seed").set(h);
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert(a.body.added >= 10, `added ${a.body.added}`);
    assert.strictEqual((await request(app).post("/api/promo/seed").set(h)).body.added, 0, "idempotent");
    const r = await request(app).get("/api/promo").set(h);
    assert(r.body.partners.every((p) => p.status === "prospect" && p.source === "seed"));
  });

  await check("promo: add partner, log a submission, success promotes the partner", async () => {
    const h = { Authorization: `Bearer ${adminToken}` };
    const p = await request(app).post("/api/promo/partners").set(h).send({
      name: "Late Night Neo-Soul", kind: "spotify_playlist", genres: "neo-soul, jazz", audience: "18k followers",
      url: "https://open.spotify.com/playlist/x", cooperation: "free", contact_email: "curator@example.com" });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    partnerId = p.body.id;
    assert.deepStrictEqual(p.body.genres, ["neo-soul", "jazz"]);
    const s = await request(app).post("/api/promo/submissions").set(h).send({ partner_id: partnerId, track_id: metaTrackId });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    let list = (await request(app).get("/api/promo").set(h)).body;
    assert.strictEqual(list.partners.find((x) => x.id === partnerId).status, "contacted");
    await request(app).patch(`/api/promo/submissions/${s.body.id}`).set(h).send({ status: "played", result_url: "https://open.spotify.com/playlist/x" });
    list = (await request(app).get("/api/promo").set(h)).body;
    const me = list.partners.find((x) => x.id === partnerId);
    assert.strictEqual(me.status, "partner");
    assert.strictEqual(me.wins, 1);
  });

  await check("promo: pitch e-mail draft with a tracked share link (template when AI is off)", async () => {
    const h = { Authorization: `Bearer ${adminToken}` };
    const r = await request(app).post("/api/promo/pitch").set(h).send({ partner_id: partnerId, track_ids: [metaTrackId] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert(/\/share\/[a-f0-9]{32}$/.test(r.body.share_url), r.body.share_url);
    assert(r.body.body.includes(r.body.share_url) && !r.body.body.includes("{{"), r.body.body);
    assert.strictEqual(r.body.to, "curator@example.com");
    const token = r.body.share_url.split("/share/")[1];
    const shared = await request(app).get(`/api/playlists/share/${token}`);
    assert.strictEqual(shared.status, 200);
    assert.strictEqual(shared.body.playlist.tracks[0].id, metaTrackId);
    assert.strictEqual((await request(app).post("/api/promo/pitch").set(h).send({ partner_id: partnerId, track_ids: [] })).status, 400);
  });

  await check("promo: public application form → accept creates a partner", async () => {
    const bad = await request(app).post("/api/promo/public/apply").send({ name: "Radio X", url: "radio.example", contact_name: "Ola", contact_email: "ola@radio.example", consent: true });
    assert.strictEqual(bad.status, 400, "link must be https");
    const r = await request(app).post("/api/promo/public/apply").send({
      name: "Radio X", kind: "radio_online", url: "https://radio.example", contact_name: "Ola", contact_email: "ola@radio.example",
      genres: ["soul"], audience: "5k daily listeners", consent: true });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const h = { Authorization: `Bearer ${adminToken}` };
    const app1 = (await request(app).get("/api/promo").set(h)).body.applications[0];
    assert.strictEqual(app1.name, "Radio X");
    await request(app).post(`/api/promo/applications/${app1.id}/accept`).set(h);
    const after = (await request(app).get("/api/promo").set(h)).body;
    assert.strictEqual(after.applications.length, 0);
    assert(after.partners.some((p) => p.name === "Radio X" && p.source === "application"));
  });

  // ── Sync licence shop ─────────────────────────────────────────────────────
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_e2e_secret";
  let licTrackId, paidOrder;

  await check("GET /api/licenses/tiers → Online 79 zł, Commercial 429 zł, Extended on quote", async () => {
    const r = await request(app).get("/api/licenses/tiers");
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const byCode = Object.fromEntries(r.body.tiers.map((t) => [t.code, t]));
    assert.strictEqual(byCode.online.price, 79);
    assert.strictEqual(byCode.commercial.price, 429);
    assert.strictEqual(byCode.extended.quote_only, true);
  });

  await check("checkout refuses a track that is not cleared → 409", async () => {
    const up = await request(app).post("/api/tracks/upload").set("Authorization", `Bearer ${adminToken}`)
      .field("title", "Licence Me").field("artist", "CMLP")
      .attach("file", fakeAudio, { filename: "licence me.wav", contentType: "audio/wav" });
    assert.strictEqual(up.status, 201, JSON.stringify(up.body));
    licTrackId = up.body.id;
    await pool.query("UPDATE tracks SET is_public = true WHERE id = $1", [licTrackId]);
    const r = await request(app).post("/api/licenses/checkout").send({
      track_id: licTrackId, tier: "online", buyer_name: "Ann", buyer_email: "ann@example.com",
      project_title: "Vlog", accept_terms: true, accept_waiver: true });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  });

  const binary = (res, cb) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); };

  await check("anonymous listeners get a watermarked MP3 preview, the team gets the original", async () => {
    const anon = await request(app).get(`/api/tracks/stream/${licTrackId}`).buffer(true).parse(binary);
    assert.strictEqual(anon.status, 200, `got ${anon.status} ${anon.body}`);
    assert.strictEqual(anon.headers["x-audio-quality"], "preview");
    assert.strictEqual(anon.headers["content-type"], "audio/mpeg");
    assert(anon.body.length > 0 && !anon.body.equals(fakeAudio), "preview is not the original file");
    const again = await request(app).get(`/api/tracks/stream/${licTrackId}`).set("Range", "bytes=0-9");
    assert.strictEqual(again.status, 206, "cached preview supports Range");
    const team = await request(app).get(`/api/tracks/stream/${licTrackId}?token=${adminToken}`).buffer(true).parse(binary);
    assert.strictEqual(team.headers["x-audio-quality"], "original");
    assert(team.body.equals(fakeAudio), "team hears the original");
  });

  await check("checkout requires both consents → 400", async () => {
    await pool.query("UPDATE tracks SET clearance_status = 'cleared_ready' WHERE id = $1", [licTrackId]);
    const r = await request(app).post("/api/licenses/checkout").send({
      track_id: licTrackId, tier: "online", buyer_name: "Ann", buyer_email: "ann@example.com", project_title: "Vlog", accept_terms: true });
    assert.strictEqual(r.status, 400);
  });

  await check("checkout without Stripe configured → 503 (no silent free licence)", async () => {
    const r = await request(app).post("/api/licenses/checkout").send({
      track_id: licTrackId, tier: "online", buyer_name: "Ann", buyer_email: "ann@example.com",
      project_title: "Vlog", accept_terms: true, accept_waiver: true });
    assert.strictEqual(r.status, 503, JSON.stringify(r.body));
  });

  async function pendingOrder() {
    const { rows: [o] } = await pool.query(
      `INSERT INTO license_orders (track_id, track_title, track_artist, tier_code, tier_name, price_grosze, buyer_name, buyer_email,
         project_title, terms_version, waiver_accepted, stripe_session_id)
       VALUES ($1,'Licence Me','CMLP','commercial','Commercial',42900,'Ann','ann@example.com','Spot','2026-10-11',true,$2) RETURNING *`,
      [licTrackId, "cs_test_" + crypto.randomBytes(4).toString("hex")]);
    return o;
  }
  function signed(payload, secret = "whsec_e2e_secret") {
    const body = JSON.stringify(payload);
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    return { body, header: `t=${t},v1=${sig}` };
  }
  const paidEvent = (id) => ({ type: "checkout.session.completed", data: { object: { payment_status: "paid", metadata: { app: "hrl-sync", order_id: id } } } });

  await check("webhook with a forged signature → 400, order stays unpaid", async () => {
    const o = await pendingOrder();
    const { body, header } = signed(paidEvent(o.id), "whsec_wrong");
    const r = await request(app).post("/api/licenses/stripe/webhook").set("Content-Type", "application/json").set("Stripe-Signature", header).send(body);
    assert.strictEqual(r.status, 400);
    const { rows } = await pool.query("SELECT status FROM license_orders WHERE id = $1", [o.id]);
    assert.strictEqual(rows[0].status, "pending");
  });

  await check("signed webhook fulfils: number, token; replay is idempotent", async () => {
    const o = await pendingOrder();
    let first;
    for (let i = 0; i < 2; i++) {
      const { body, header } = signed(paidEvent(o.id));
      const r = await request(app).post("/api/licenses/stripe/webhook").set("Content-Type", "application/json").set("Stripe-Signature", header).send(body);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const { rows } = await pool.query("SELECT * FROM license_orders WHERE id = $1", [o.id]);
      if (i === 0) first = rows[0]; else assert.strictEqual(rows[0].number, first.number, "number unchanged on replay");
    }
    paidOrder = first;
    assert.strictEqual(paidOrder.status, "paid");
    assert(/^HRL-SYNC-\d{4}-[2-9A-Z]{6}$/.test(paidOrder.number), paidOrder.number);
    assert(/^[a-f0-9]{48}$/.test(paidOrder.download_token));
  });

  await check("status by session id returns download + certificate links", async () => {
    const r = await request(app).get(`/api/licenses/session/${paidOrder.stripe_session_id}`);
    assert.strictEqual(r.status, 200);
    assert(r.body.download_url.endsWith(paidOrder.download_token));
    assert.strictEqual(r.body.number, paidOrder.number);
  });

  await check("paid licence downloads the full file; unknown token → 404", async () => {
    const r = await request(app).get(`/api/licenses/download/${paidOrder.download_token}`).buffer(true).parse(binary);
    assert.strictEqual(r.status, 200, `got ${r.status}`);
    assert(r.body.equals(fakeAudio), "buyer gets the original, not the preview");
    assert(/attachment/.test(r.headers["content-disposition"]), "attachment");
    assert(r.headers["content-disposition"].includes(paidOrder.number), "number in filename");
    const bad = await request(app).get(`/api/licenses/download/${"0".repeat(48)}`);
    assert.strictEqual(bad.status, 404);
  });

  await check("licence includes clean 30 s / 60 s edits; other lengths rejected", async () => {
    const r = await request(app).get(`/api/licenses/download/${paidOrder.download_token}?edit=30`).buffer(true).parse(binary);
    assert.strictEqual(r.status, 200, `got ${r.status} ${r.body}`);
    assert.strictEqual(r.headers["content-type"], "audio/mpeg");
    assert(r.headers["content-disposition"].includes("30s edit"), r.headers["content-disposition"]);
    assert.strictEqual((await request(app).get(`/api/licenses/download/${paidOrder.download_token}?edit=15`)).status, 400);
    const st = await request(app).get(`/api/licenses/session/${paidOrder.stripe_session_id}`);
    assert(st.body.edit_urls && st.body.edit_urls["60"].endsWith("edit=60"));
  });

  await check("promo video renders a vertical MP4 for the team; anonymous → 401", async () => {
    assert.strictEqual((await request(app).get(`/api/tracks/${licTrackId}/promo-video`)).status, 401);
    const r = await request(app).get(`/api/tracks/${licTrackId}/promo-video?token=${adminToken}`).buffer(true).parse(binary);
    assert.strictEqual(r.status, 200, `got ${r.status} ${r.body}`);
    assert.strictEqual(r.headers["content-type"], "video/mp4");
    assert.strictEqual(r.body.slice(4, 8).toString(), "ftyp", "MP4 container");
  });

  await check("certificate is a real PDF", async () => {
    const r = await request(app).get(`/api/licenses/certificate/${paidOrder.download_token}`).buffer(true)
      .parse((res, cb) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers["content-type"], "application/pdf");
    assert.strictEqual(r.body.slice(0, 4).toString(), "%PDF");
  });

  await check("public verification by licence number", async () => {
    const r = await request(app).get(`/api/licenses/verify/${paidOrder.number.toLowerCase()}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.valid, true);
    assert.strictEqual(r.body.buyer_email, undefined, "no e-mail leaked");
    const no = await request(app).get("/api/licenses/verify/HRL-SYNC-2026-NOPE22");
    assert.strictEqual(no.status, 404);
  });

  await check("quote request for Extended → 201", async () => {
    const r = await request(app).post("/api/licenses/inquiry").send({ track_id: licTrackId, name: "Bob", email: "bob@tv.example", project: "TV spot" });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  });

  await check("admin sees sales; non-admin cannot change prices", async () => {
    const r = await request(app).get("/api/licenses/admin/orders").set("Authorization", `Bearer ${adminToken}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.totals.sold, 1);
    assert.strictEqual(r.body.totals.revenue, 42900);
    assert.strictEqual(r.body.inquiries.length, 1);
    const anon = await request(app).get("/api/licenses/admin/orders");
    assert.strictEqual(anon.status, 401);
    const u = await request(app).patch("/api/licenses/admin/tiers/online").set("Authorization", `Bearer ${userToken}`).send({ price: 1 });
    assert.strictEqual(u.status, 403);
    const a = await request(app).patch("/api/licenses/admin/tiers/online").set("Authorization", `Bearer ${adminToken}`).send({ price: 69 });
    assert.strictEqual(a.body.price_grosze, 6900);
  });

  console.log(`\n${failed === 0 ? "✅" : "❌"}  ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
