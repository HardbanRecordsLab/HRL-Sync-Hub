// Promotion partners: playlists, radios, curators, blogs and podcasts that play or promote our artists' music,
// a log of what was sent to whom, and a public form where partners can apply to cooperate.
const express = require("express");
const { query, queryOne, queryAll } = require("../db/pool");
const authMiddleware = require("../middleware/auth");
const emailService = require("../services/emailService");
const { logger } = require("../utils/logger");

const KINDS = {
  spotify_playlist: "Spotify playlist", apple_playlist: "Apple Music playlist", youtube_channel: "YouTube channel",
  soundcloud: "SoundCloud", radio_fm: "FM radio", radio_online: "Online radio", radio_show: "Radio show",
  podcast: "Podcast", blog: "Blog / magazine", curator_platform: "Curator platform", tiktok: "TikTok / Reels creator",
  dj: "DJ / club", venue: "Venue / event", other: "Other",
};
const COOPERATION = ["free", "paid", "exchange", "partnership", "unknown"];
const PARTNER_STATUS = ["prospect", "contacted", "partner", "declined"];
const SUB_STATUS = ["planned", "sent", "accepted", "played", "declined", "no_reply"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const url = (v) => {
  const s = str(v, 1000);
  return s && /^https?:\/\//i.test(s) ? s : null;
};
const list = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
  .map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

// Starter list — public platforms and stations; terms change, so everything starts as "prospect" to verify.
const STARTER = [
  ["Spotify for Artists — editorial pitch", "curator_platform", null, "https://artists.spotify.com", "free",
    "Pitch an unreleased song to Spotify's editorial team at least 7 days before release (one song per release)."],
  ["SubmitHub", "curator_platform", null, "https://www.submithub.com", "paid",
    "Paid pitching to playlist curators, blogs and radio; feedback, no guaranteed placement."],
  ["Groover", "curator_platform", null, "https://groover.co", "paid",
    "Pay per contact (about 2 € each); answer guaranteed within 7 days; curators, radios, labels."],
  ["Playlist Push", "curator_platform", null, "https://playlistpush.com", "paid",
    "Managed Spotify playlist campaigns, typically a few hundred USD."],
  ["MusoSoup", "curator_platform", null, "https://musosoup.com", "paid",
    "Free to submit, fee only after acceptance; blogs, radio and press."],
  ["Daily Playlists", "curator_platform", null, "https://www.dailyplaylists.com", "unknown",
    "Submission platform for independent Spotify playlists — check current terms."],
  ["IndieMono", "spotify_playlist", null, "https://indiemono.com", "unknown", "Indie playlist network — check submission terms."],
  ["Radio Airplay (Jango)", "radio_online", null, "https://www.jango.com", "paid", "Paid airplay on Jango internet radio to listeners of similar artists."],
  ["Radio Nowy Świat", "radio_online", "PL", "https://nowyswiat.online", "unknown",
    "Listener-funded station. Send to the music editor of the matching show (link to MP3, no attachments)."],
  ["Radio 357", "radio_online", "PL", "https://radio357.pl", "unknown",
    "Listener-funded station. Send to the music editor of the matching show (link to MP3, no attachments)."],
  ["Czwórka — Polskie Radio", "radio_fm", "PL", "https://www.polskieradio.pl/10", "unknown",
    "Public radio, alternative and new music shows. Pitch the editor of the matching show directly."],
  ["Radio Kampus", "radio_fm", "PL", "https://radiokampus.fm", "unknown",
    "Warsaw student radio, open to emerging artists. Contact the music department."],
];

// ── Public: partner application ──────────────────────────────────────────────
const publicRouter = express.Router();

publicRouter.get("/kinds", (req, res) => res.json(KINDS));

publicRouter.post("/apply", async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 200), link = url(b.url), contact = str(b.contact_name, 200);
  const email = (str(b.contact_email, 254) || "").toLowerCase();
  if (!name || !link || !contact || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Name, a link (https://…), your name and a valid e-mail are required." });
  }
  if (b.consent !== true) return res.status(400).json({ error: "Please accept the privacy policy." });
  const kind = pick(b.kind, Object.keys(KINDS), "other");
  await query(
    `INSERT INTO promo_applications (name, kind, url, country, genres, audience, contact_name, contact_email, message, ip_address)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)`,
    [name, kind, link, str(b.country, 60), JSON.stringify(list(b.genres)), str(b.audience, 200), contact, email,
      str(b.message, 3000), (req.ip || "").slice(0, 64)]
  );
  emailService.send({
    to: process.env.LICENSE_NOTIFY_EMAIL || "licensing@hardbanrecordslab.online", replyTo: email,
    subject: `Nowe zgłoszenie partnera promocji: ${name} (${KINDS[kind]})`,
    text: `${name} — ${KINDS[kind]}\n${link}\nKontakt: ${contact} <${email}>\nZasięg: ${str(b.audience, 200) || "—"}\nGatunki: ${list(b.genres).join(", ") || "—"}\n\n${str(b.message, 3000) || ""}`,
  }).catch((e) => logger.error(`promo apply mail: ${e.message}`));
  res.status(201).json({ ok: true });
});

// ── Team (login required) ────────────────────────────────────────────────────
const router = express.Router();
router.use(authMiddleware);

function partnerFields(b) {
  return {
    name: str(b.name, 200), kind: pick(b.kind, Object.keys(KINDS), "other"), country: str(b.country, 60),
    genres: JSON.stringify(list(b.genres)), audience: str(b.audience, 200), url: url(b.url), submission_url: url(b.submission_url),
    contact_name: str(b.contact_name, 200), contact_email: str(b.contact_email, 254),
    cooperation: pick(b.cooperation, COOPERATION, "unknown"), price_note: str(b.price_note, 300),
    status: pick(b.status, PARTNER_STATUS, "prospect"), notes: str(b.notes, 5000),
  };
}

router.get("/", async (req, res) => {
  const partners = await queryAll("SELECT * FROM promo_partners ORDER BY name");
  const counts = await queryAll("SELECT partner_id, status FROM promo_submissions");
  for (const p of partners) {
    const mine = counts.filter((c) => c.partner_id === p.id);
    p.submissions = mine.length;
    p.wins = mine.filter((c) => c.status === "accepted" || c.status === "played").length;
  }
  partners.sort((a, b) => (b.status === "partner") - (a.status === "partner"));
  const submissions = await queryAll(
    `SELECT s.*, p.name AS partner_name, p.kind AS partner_kind FROM promo_submissions s
     JOIN promo_partners p ON p.id = s.partner_id ORDER BY s.created_at DESC LIMIT 300`
  );
  const applications = await queryAll("SELECT * FROM promo_applications WHERE status = 'new' ORDER BY created_at DESC");
  res.json({ partners, submissions, applications, kinds: KINDS, cooperation: COOPERATION, statuses: PARTNER_STATUS, submission_statuses: SUB_STATUS });
});

router.post("/partners", async (req, res) => {
  const f = partnerFields(req.body || {});
  if (!f.name) return res.status(400).json({ error: "Name is required" });
  const p = await queryOne(
    `INSERT INTO promo_partners (name, kind, country, genres, audience, url, submission_url, contact_name, contact_email,
       cooperation, price_note, status, notes, created_by)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [f.name, f.kind, f.country, f.genres, f.audience, f.url, f.submission_url, f.contact_name, f.contact_email,
      f.cooperation, f.price_note, f.status, f.notes, req.userId]
  );
  res.status(201).json(p);
});

router.put("/partners/:id", async (req, res) => {
  const f = partnerFields(req.body || {});
  if (!f.name) return res.status(400).json({ error: "Name is required" });
  const p = await queryOne(
    `UPDATE promo_partners SET name=$1, kind=$2, country=$3, genres=$4::jsonb, audience=$5, url=$6, submission_url=$7,
       contact_name=$8, contact_email=$9, cooperation=$10, price_note=$11, status=$12, notes=$13, updated_at=now()
     WHERE id=$14 RETURNING *`,
    [f.name, f.kind, f.country, f.genres, f.audience, f.url, f.submission_url, f.contact_name, f.contact_email,
      f.cooperation, f.price_note, f.status, f.notes, req.params.id]
  );
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

router.delete("/partners/:id", async (req, res) => {
  await query("DELETE FROM promo_submissions WHERE partner_id = $1", [req.params.id]);
  await query("DELETE FROM promo_partners WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

router.post("/seed", async (req, res) => {
  const existing = new Set((await queryAll("SELECT lower(name) AS n FROM promo_partners")).map((r) => r.n));
  let added = 0;
  for (const [name, kind, country, link, coop, notes] of STARTER) {
    if (existing.has(name.toLowerCase())) continue;
    await query(
      `INSERT INTO promo_partners (name, kind, country, url, cooperation, notes, status, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'prospect','seed',$7)`,
      [name, kind, country, link, coop, `${notes} — verify current terms on the website.`, req.userId]
    );
    added++;
  }
  res.json({ added });
});

router.post("/submissions", async (req, res) => {
  const b = req.body || {};
  const partner = await queryOne("SELECT id FROM promo_partners WHERE id = $1", [b.partner_id]);
  const track = await queryOne("SELECT id, title FROM tracks WHERE id = $1", [parseInt(b.track_id, 10) || 0]);
  if (!partner || !track) return res.status(400).json({ error: "Choose a partner and a track" });
  const s = await queryOne(
    `INSERT INTO promo_submissions (partner_id, track_id, track_title, status, sent_at, result_url, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [partner.id, track.id, track.title, pick(b.status, SUB_STATUS, "sent"), str(b.sent_at, 10) || new Date().toISOString().slice(0, 10),
      url(b.result_url), str(b.notes, 2000), req.userId]
  );
  if (s.status !== "planned") await query("UPDATE promo_partners SET status='contacted', updated_at=now() WHERE id=$1 AND status='prospect'", [partner.id]);
  res.status(201).json(s);
});

router.patch("/submissions/:id", async (req, res) => {
  const b = req.body || {};
  const s = await queryOne(
    `UPDATE promo_submissions SET status = COALESCE($1, status), result_url = COALESCE($2, result_url),
       notes = COALESCE($3, notes), updated_at = now() WHERE id = $4 RETURNING *`,
    [b.status ? pick(b.status, SUB_STATUS, null) : null, url(b.result_url), str(b.notes, 2000), req.params.id]
  );
  if (!s) return res.status(404).json({ error: "Not found" });
  if (["accepted", "played"].includes(s.status)) {
    await query("UPDATE promo_partners SET status='partner', updated_at=now() WHERE id=$1 AND status IN ('prospect','contacted')", [s.partner_id]);
  }
  res.json(s);
});

router.delete("/submissions/:id", async (req, res) => {
  await query("DELETE FROM promo_submissions WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

/** Accept an application → becomes a partner (status: contacted). Reject just hides it. */
router.post("/applications/:id/:action", async (req, res) => {
  const a = await queryOne("SELECT * FROM promo_applications WHERE id = $1 AND status = 'new'", [req.params.id]);
  if (!a) return res.status(404).json({ error: "Not found" });
  if (req.params.action === "accept") {
    await query(
      `INSERT INTO promo_partners (name, kind, country, genres, audience, url, contact_name, contact_email, notes, status, source, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,'contacted','application',$10)`,
      [a.name, a.kind, a.country, JSON.stringify(a.genres || []), a.audience, a.url, a.contact_name, a.contact_email, a.message, req.userId]
    );
    await query("UPDATE promo_applications SET status='accepted' WHERE id=$1", [a.id]);
  } else if (req.params.action === "reject") {
    await query("UPDATE promo_applications SET status='rejected' WHERE id=$1", [a.id]);
  } else {
    return res.status(400).json({ error: "Unknown action" });
  }
  res.json({ ok: true });
});

// ── Pitch e-mail: a share link (watermarked previews, opens/plays tracked) + an AI draft ──────────────
// Only outlet and catalogue data go to the model — never the contact's name or e-mail (privacy policy, AI section).
const crypto = require("crypto");
const aiService = require("../services/aiService");

const PL_COUNTRIES = ["pl", "polska", "poland"];

function fallbackPitch(pl, partner, tracks, link) {
  const list = tracks.map((t) => `• ${t.title}${t.genre ? ` (${t.genre})` : ""}`).join("\n");
  return pl
    ? { subject: `Muzyka do ${partner.name} — ${tracks.length === 1 ? tracks[0].title : "propozycje od HardbanRecords Lab"}`,
        body: `{{GREETING}}\n\npiszę z HardbanRecords Lab. Słuchając ${partner.name}, pomyślałem, że te utwory mogą do Was pasować:\n\n${list}\n\nOdsłuch: ${link}\n\nJeśli coś się spodoba, chętnie prześlę pliki w pełnej jakości i informacje o artyście.\n\nPozdrawiam,\nKamil Skomra\nHardbanRecords Lab` }
    : { subject: `Music for ${partner.name} — ${tracks.length === 1 ? tracks[0].title : "picks from HardbanRecords Lab"}`,
        body: `{{GREETING}}\n\nI'm reaching out from HardbanRecords Lab. Listening to ${partner.name}, I think these could be a good fit:\n\n${list}\n\nListen here: ${link}\n\nIf anything works for you, I'm happy to send full-quality files and artist info.\n\nBest,\nKamil Skomra\nHardbanRecords Lab` };
}

router.post("/pitch", async (req, res) => {
  const b = req.body || {};
  const partner = await queryOne("SELECT * FROM promo_partners WHERE id = $1", [b.partner_id]);
  const ids = (Array.isArray(b.track_ids) ? b.track_ids : []).map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 10);
  if (!partner || !ids.length) return res.status(400).json({ error: "Choose a partner and 1–10 tracks" });
  const tracks = [];
  for (const id of ids) {
    const t = await queryOne("SELECT id, title, artist, genre, bpm, mood, metadata FROM tracks WHERE id = $1", [id]);
    if (t) tracks.push(t);
  }
  if (!tracks.length) return res.status(400).json({ error: "Tracks not found" });

  // Share link — reuses playlists + shareable_links, so opens and plays show up in Analytics.
  const pl = await queryOne(
    "INSERT INTO playlists (user_id, name, description) VALUES ($1, $2, $3) RETURNING id",
    [req.userId, `Pitch — ${partner.name} — ${new Date().toISOString().slice(0, 10)}`.slice(0, 200), `Promotion pitch for ${partner.name}`]
  );
  for (const [i, t] of tracks.entries()) {
    await query("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, $3)", [pl.id, t.id, i + 1]);
  }
  const token = crypto.randomBytes(16).toString("hex");
  await query("INSERT INTO shareable_links (playlist_id, link_token, allow_downloads, require_email) VALUES ($1, $2, false, false)", [pl.id, token]);
  const shareUrl = `${(process.env.FRONTEND_URL || "https://hrl-sync.hub.hardbanrecordslab.online").replace(/\/$/, "")}/share/${token}`;

  const polish = PL_COUNTRIES.includes((partner.country || "").trim().toLowerCase()) || b.language === "pl";
  let draft = null;
  if (aiService.available) {
    const describe = tracks.map((t) => {
      const mood = t.mood && typeof t.mood === "object" && !Array.isArray(t.mood) ? t.mood : {};
      const meta = t.metadata || {};
      return `- "${t.title}" — ${t.genre || "n/a"}, ${t.bpm || "?"} BPM; moods: ${(mood.tags || []).join(", ") || "n/a"}; vibe: ${mood.vibe || "n/a"}; fits: ${(meta.useCases || []).slice(0, 2).join("; ") || "n/a"}`;
    }).join("\n");
    const prompt =
      `Write a short, warm, non-pushy pitch e-mail ${polish ? "in Polish" : "in English"} from Kamil Skomra (HardbanRecords Lab, independent label) ` +
      `to the curator of "${partner.name}" (${KINDS[partner.kind] || partner.kind}; plays: ${(partner.genres || []).join(", ") || "various"}; reach: ${partner.audience || "n/a"}).\n` +
      `Tracks:\n${describe}\n\n` +
      `Rules: max 140 words in the body; say briefly why these tracks fit THIS outlet; no invented facts (no streams, awards, press, ` +
      `release dates); start the body with the exact placeholder {{GREETING}} on its own line; put the exact placeholder {{LINK}} where the ` +
      `listening link goes; sign off as Kamil Skomra, HardbanRecords Lab. Reply ONLY with JSON: {"subject": "...", "body": "..."}`;
    try {
      const raw = await aiService.chat(prompt, "You are an experienced music PR who writes concise, personal pitches to playlist curators and radio editors.", 0.6);
      const json = JSON.parse((raw.match(/\{[\s\S]*\}/) || [raw])[0]);
      if (json.subject && json.body && json.body.includes("{{LINK}}")) draft = { subject: String(json.subject).slice(0, 200), body: String(json.body).slice(0, 4000) };
    } catch (e) {
      logger.warn(`pitch draft AI failed: ${e.message}`);
    }
  }
  const out = draft || fallbackPitch(polish, partner, tracks, "{{LINK}}");
  const greeting = partner.contact_name ? (polish ? `Dzień dobry ${partner.contact_name},` : `Hi ${partner.contact_name},`) : (polish ? "Dzień dobry," : "Hi,");
  res.json({
    subject: out.subject,
    body: out.body.replace("{{GREETING}}", greeting).split("{{LINK}}").join(shareUrl),
    share_url: shareUrl,
    playlist_id: pl.id,
    ai: !!draft,
    to: partner.contact_email || null,
  });
});

module.exports = { router, publicRouter, KINDS };
