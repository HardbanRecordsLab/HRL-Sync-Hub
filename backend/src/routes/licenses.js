// Sync licence shop: tiers, Stripe checkout, fulfilment (certificate PDF + download link), verification, admin.
// Terms: https://hardbanrecordslab.online/sync-license-terms/ (legal/zrodla/warunki-licencji-sync.html).
const crypto = require("crypto");
const path = require("path");
const express = require("express");
const { query, queryOne, queryAll } = require("../db/pool");
const authMiddleware = require("../middleware/auth");
const { requireAdmin } = require("../middleware/auth");
const objectStore = require("../services/storage");
const emailService = require("../services/emailService");
const stripe = require("../services/stripe");
const { buildCertificate, TERMS_VERSION, TERMS_URL } = require("../services/licensePdf");
const { logger } = require("../utils/logger");

const router = express.Router();
const DOWNLOAD_DAYS = 30;
const MAX_DOWNLOADS = 20;
const NOTIFY = () => process.env.LICENSE_NOTIFY_EMAIL || "licensing@hardbanrecordslab.online";
const FRONTEND = () => (process.env.FRONTEND_URL || "https://hrl-sync.hub.hardbanrecordslab.online").replace(/\/$/, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (g) => `${(g / 100).toFixed(2).replace(".", ",")} zł`;

function newNumber() {
  // HRL-SYNC-2026-7K3QF9 — unambiguous alphabet, ~1e9 combinations per year
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(6);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `HRL-SYNC-${new Date().getFullYear()}-${code}`;
}

function publicOrder(o) {
  const base = FRONTEND();
  const out = {
    number: o.number, status: o.status, track_title: o.track_title, track_artist: o.track_artist,
    tier_name: o.tier_name, price: o.price_grosze / 100, currency: o.currency, project_title: o.project_title,
    paid_at: o.paid_at,
  };
  if (o.status === "paid" && o.download_token) {
    out.download_url = `${base}/api/licenses/download/${o.download_token}`;
    out.certificate_url = `${base}/api/licenses/certificate/${o.download_token}`;
    out.verify_url = `${base}/license/verify/${o.number}`;
  }
  return out;
}

// ── Public: tiers ───────────────────────────────────────────────────────────
router.get("/tiers", async (req, res) => {
  const rows = await queryAll(
    "SELECT code, name, summary, price_grosze, quote_only FROM license_tiers WHERE active = true ORDER BY sort"
  );
  res.json({
    terms_url: TERMS_URL,
    tiers: rows.map((t) => ({ ...t, price: t.price_grosze == null ? null : t.price_grosze / 100 })),
  });
});

// ── Public: checkout ────────────────────────────────────────────────────────
router.post("/checkout", async (req, res) => {
  const b = req.body || {};
  const trackId = parseInt(b.track_id, 10);
  const name = str(b.buyer_name, 200);
  const email = str(b.buyer_email, 254).toLowerCase();
  const company = str(b.buyer_company, 200) || null;
  const project = str(b.project_title, 300);
  const projectDesc = str(b.project_description, 1000) || null;
  if (!trackId || !name || !EMAIL_RE.test(email) || !project) {
    return res.status(400).json({ error: "Name, a valid e-mail and the project title are required." });
  }
  if (b.accept_terms !== true || b.accept_waiver !== true) {
    return res.status(400).json({ error: "Please accept the licence terms and the immediate-delivery consent." });
  }
  const tier = await queryOne("SELECT * FROM license_tiers WHERE code = $1 AND active = true", [str(b.tier, 40)]);
  if (!tier || tier.quote_only || !tier.price_grosze) return res.status(400).json({ error: "This licence tier cannot be bought online." });

  const track = await queryOne("SELECT id, title, artist, clearance_status, is_public FROM tracks WHERE id = $1", [trackId]);
  if (!track || !track.is_public || track.clearance_status !== "cleared_ready") {
    return res.status(409).json({ error: "This track is not available for licensing yet." });
  }
  if (!stripe.configured()) return res.status(503).json({ error: "Payments are temporarily unavailable." });

  const { rows: [order] } = await query(
    `INSERT INTO license_orders (track_id, track_title, track_artist, tier_code, tier_name, price_grosze, buyer_name, buyer_email,
       buyer_company, project_title, project_description, terms_version, waiver_accepted, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13) RETURNING *`,
    [track.id, track.title, track.artist, tier.code, tier.name, tier.price_grosze, name, email, company, project, projectDesc,
      TERMS_VERSION, (req.ip || "").slice(0, 64)]
  );
  try {
    const session = await stripe.createCheckoutSession({
      orderId: order.id,
      title: `Sync licence — ${track.title} (${tier.name})`,
      description: `Project: ${project}`.slice(0, 300),
      amount: tier.price_grosze,
      email,
      successUrl: `${FRONTEND()}/license/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${FRONTEND()}/public-library`,
    });
    await query("UPDATE license_orders SET stripe_session_id = $1 WHERE id = $2", [session.id, order.id]);
    res.json({ url: session.url });
  } catch (e) {
    logger.error(`licence checkout: ${e.message}`);
    await query("UPDATE license_orders SET status = 'failed' WHERE id = $1", [order.id]);
    res.status(502).json({ error: "Could not start the payment. Please try again." });
  }
});

// ── Public: quote request (Extended tier) ───────────────────────────────────
router.post("/inquiry", async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 200);
  const email = str(b.email, 254).toLowerCase();
  const project = str(b.project, 300);
  if (!name || !EMAIL_RE.test(email) || !project) return res.status(400).json({ error: "Name, a valid e-mail and the project are required." });
  const trackId = parseInt(b.track_id, 10) || null;
  const track = trackId ? await queryOne("SELECT id, title FROM tracks WHERE id = $1", [trackId]) : null;
  await query(
    "INSERT INTO license_inquiries (track_id, track_title, name, email, company, project, message) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [track?.id ?? null, track?.title ?? null, name, email, str(b.company, 200) || null, project, str(b.message, 3000) || null]
  );
  emailService.send({
    to: NOTIFY(), replyTo: email,
    subject: `Zapytanie o licencję Extended: ${track?.title || "katalog"} — ${project}`,
    text: `Od: ${name} <${email}>${b.company ? `, ${str(b.company, 200)}` : ""}\nUtwór: ${track ? `${track.title} (ID ${track.id})` : "—"}\nProjekt: ${project}\n\n${str(b.message, 3000)}`,
  }).catch((e) => logger.error(`inquiry mail: ${e.message}`));
  res.status(201).json({ ok: true });
});

// ── Fulfilment (idempotent) ─────────────────────────────────────────────────
async function fulfil(orderId) {
  const { rows } = await query(
    `UPDATE license_orders SET status = 'paid', paid_at = now(), number = $2, download_token = $3
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [orderId, newNumber(), crypto.randomBytes(24).toString("hex")]
  );
  const order = rows[0];
  if (!order) return null; // already fulfilled or unknown
  const verifyUrl = `${FRONTEND()}/license/verify/${order.number}`;
  const links = publicOrder(order);
  try {
    const pdf = await buildCertificate(order, verifyUrl);
    await emailService.send({
      to: order.buyer_email,
      replyTo: NOTIFY(),
      subject: `Your sync licence ${order.number} — ${order.track_title}`,
      text:
        `Hi ${order.buyer_name},\n\nthank you for licensing "${order.track_title}" (${order.track_artist}) for "${order.project_title}".\n\n` +
        `Licence no.: ${order.number}\nTier: ${order.tier_name} (${money(order.price_grosze)})\n\n` +
        `Download the full-quality file (link valid ${DOWNLOAD_DAYS} days):\n${links.download_url}\n\n` +
        `Your licence certificate is attached (also here: ${links.certificate_url}).\n` +
        `Verification page: ${verifyUrl}\nTerms: ${TERMS_URL}\n\n` +
        `You agreed to immediate delivery of digital content and acknowledged the loss of the right of withdrawal (art. 38(1)(13) of the Polish Consumer Rights Act).\n\n` +
        `If YouTube or another platform raises a claim on your video, reply to this e-mail with your licence number.\n\n— HardbanRecords Lab · HRL Sync Hub`,
      attachments: [{ filename: `${order.number}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
  } catch (e) {
    logger.error(`licence ${order.number}: buyer e-mail failed: ${e.message}`);
  }
  emailService.send({
    to: NOTIFY(),
    subject: `Sprzedana licencja ${order.number}: ${order.track_title} — ${order.tier_name} ${money(order.price_grosze)}`,
    text: `Kupujący: ${order.buyer_name} <${order.buyer_email}>${order.buyer_company ? `, ${order.buyer_company}` : ""}\nProjekt: ${order.project_title}\n${order.project_description || ""}`,
  }).catch((e) => logger.error(`licence notify: ${e.message}`));
  logger.info(`Licence sold: ${order.number} (${order.track_title}, ${order.tier_code})`);
  return order;
}

/** Mounted in app.js with express.raw() BEFORE the JSON body parser. */
async function stripeWebhook(req, res) {
  const event = stripe.verifyWebhook(req.body, req.headers["stripe-signature"]);
  if (!event) return res.status(400).json({ error: "Invalid signature" });
  const obj = event.data?.object || {};
  if (event.type === "checkout.session.completed" && obj.payment_status === "paid" && obj.metadata?.app === "hrl-sync") {
    await fulfil(obj.metadata.order_id);
  } else if (event.type === "checkout.session.expired" && obj.metadata?.order_id) {
    await query("UPDATE license_orders SET status = 'expired' WHERE id = $1 AND status = 'pending'", [obj.metadata.order_id]);
  }
  res.json({ received: true });
}

// ── Public: order status after redirect (also fulfils if the webhook is late) ─
router.get("/session/:sid", async (req, res) => {
  let order = await queryOne("SELECT * FROM license_orders WHERE stripe_session_id = $1", [str(req.params.sid, 200)]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "pending" && stripe.configured()) {
    try {
      const s = await stripe.retrieveSession(order.stripe_session_id);
      if (s.payment_status === "paid") order = (await fulfil(order.id)) || (await queryOne("SELECT * FROM license_orders WHERE id = $1", [order.id]));
    } catch (e) {
      logger.warn(`session check ${order.id}: ${e.message}`);
    }
  }
  res.json(publicOrder(order));
});

async function paidByToken(token) {
  if (!/^[a-f0-9]{48}$/.test(token || "")) return null;
  return queryOne("SELECT * FROM license_orders WHERE download_token = $1 AND status = 'paid'", [token]);
}

// ── Public: full-quality file for a paid licence ────────────────────────────
router.get("/download/:token", async (req, res) => {
  const order = await paidByToken(req.params.token);
  if (!order) return res.status(404).json({ error: "Download link not found" });
  const ageDays = (Date.now() - new Date(order.paid_at).getTime()) / 86400000;
  if (ageDays > DOWNLOAD_DAYS || order.download_count >= MAX_DOWNLOADS) {
    return res.status(410).json({ error: "This download link has expired. Write to licensing@hardbanrecordslab.online and we will send the file again." });
  }
  const track = await queryOne("SELECT object_key, mime_type, filename FROM tracks WHERE id = $1", [order.track_id]);
  if (!track?.object_key) return res.status(404).json({ error: "File not available" });
  const key = path.basename(track.object_key);
  const meta = await objectStore.head(key);
  if (!meta) return res.status(404).json({ error: "File not available" });
  await query("UPDATE license_orders SET download_count = download_count + 1 WHERE id = $1", [order.id]);
  const ext = path.extname(track.filename || key) || ".mp3";
  const name = `${order.track_artist} - ${order.track_title} (${order.number})${ext}`.replace(/[\\/:*?"<>|]/g, "");
  const ascii = name.normalize("NFKD").replace(/[^\x20-\x7E]/g, "");
  res.writeHead(200, {
    "Content-Type": track.mime_type || "audio/mpeg",
    "Content-Length": meta.size,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "private, no-store",
  });
  const stream = await objectStore.getStream(key);
  stream.on("error", (e) => { logger.error(`licence download ${order.number}: ${e.message}`); res.destroy(); });
  stream.pipe(res);
});

// ── Public: certificate PDF ─────────────────────────────────────────────────
router.get("/certificate/:token", async (req, res) => {
  const order = await paidByToken(req.params.token);
  if (!order) return res.status(404).json({ error: "Certificate not found" });
  const pdf = await buildCertificate(order, `${FRONTEND()}/license/verify/${order.number}`);
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Length": pdf.length,
    "Content-Disposition": `inline; filename="${order.number}.pdf"`,
    "Cache-Control": "private, no-store",
  });
  res.end(pdf);
});

// ── Public: verify a licence number (e.g. for a platform dispute) ───────────
router.get("/verify/:number", async (req, res) => {
  const number = str(req.params.number, 40).toUpperCase();
  const o = await queryOne("SELECT * FROM license_orders WHERE number = $1 AND status = 'paid'", [number]);
  if (!o) return res.status(404).json({ valid: false });
  res.json({
    valid: true, number: o.number, track_title: o.track_title, track_artist: o.track_artist, tier_name: o.tier_name,
    project_title: o.project_title, licensee: o.buyer_company || o.buyer_name, granted_at: o.paid_at, terms_url: TERMS_URL,
  });
});

// ── Admin ───────────────────────────────────────────────────────────────────
const admin = express.Router();
admin.use(authMiddleware);

admin.get("/orders", async (req, res) => {
  const orders = await queryAll(
    `SELECT id, number, status, track_id, track_title, tier_name, price_grosze, buyer_name, buyer_email, buyer_company,
       project_title, download_count, paid_at, created_at
     FROM license_orders WHERE status <> 'failed' ORDER BY created_at DESC LIMIT 300`
  );
  const totals = await queryOne(
    "SELECT COUNT(*)::int AS sold, COALESCE(SUM(price_grosze), 0)::int AS revenue FROM license_orders WHERE status = 'paid'"
  );
  const inquiries = await queryAll("SELECT * FROM license_inquiries ORDER BY created_at DESC LIMIT 100");
  const tiers = await queryAll("SELECT * FROM license_tiers ORDER BY sort");
  res.json({ orders, totals, inquiries, tiers, stripe: stripe.configured() });
});

admin.patch("/tiers/:code", requireAdmin, async (req, res) => {
  const b = req.body || {};
  const price = b.price === null || b.price === "" ? null : Math.round(Number(b.price) * 100);
  if (price !== null && (!Number.isFinite(price) || price < 100 || price > 10_000_000)) return res.status(400).json({ error: "Invalid price" });
  const t = await queryOne(
    `UPDATE license_tiers SET price_grosze = COALESCE($2, price_grosze), active = COALESCE($3, active),
       summary = COALESCE($4, summary) WHERE code = $1 RETURNING *`,
    [req.params.code, price, typeof b.active === "boolean" ? b.active : null, typeof b.summary === "string" ? b.summary.slice(0, 500) : null]
  );
  if (!t) return res.status(404).json({ error: "Tier not found" });
  res.json(t);
});

/** Mark the whole catalogue (or one artist) as cleared for licensing. Writes to the shared CMLP catalogue. */
admin.post("/clear-catalog", requireAdmin, async (req, res) => {
  const artist = str((req.body || {}).artist, 200);
  if (!artist) return res.status(400).json({ error: "artist required" });
  const { rowCount } = await query(
    "UPDATE tracks SET clearance_status = 'cleared_ready' WHERE artist = $1 AND clearance_status <> 'cleared_ready'",
    [artist]
  );
  res.json({ updated: rowCount });
});

module.exports = { router, admin, stripeWebhook, fulfil };
