require("express-async-errors");

// ── Error tracking (optional — only active when SENTRY_DSN is set) ───────────
let Sentry = null;
if (process.env.SENTRY_DSN) {
  Sentry = require("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0,
    release: require("../package.json").version,
  });
}

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const compression = require("compression");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");

const { logger } = require("./utils/logger");
const { pool } = require("./db/pool");
const objectStore = require("./services/storage");
const errorHandler = require("./middleware/errorHandler");
const authMiddleware = require("./middleware/auth");
const { getHelmetConfig, RateLimitManager } = require("./middleware/security");

const authRoutes = require("./routes/auth");
const tracksRoutes = require("./routes/tracks");
const lyricsRoutes = require("./routes/lyrics");
const playlistsRoutes = require("./routes/playlists");
const analyticsRoutes = require("./routes/analytics");
const embedRoutes = require("./routes/embed");
const contactsRoutes = require("./routes/contacts");
const projectsRoutes = require("./routes/projects");
const businessRoutes = require("./routes/business");
const aiService = require("./services/aiService");

const DEFAULT_ORIGINS = ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"];
const allowedOrigins = [
  ...new Set([
    ...DEFAULT_ORIGINS,
    ...(process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ]),
];

const app = express();
app.set("trust proxy", 1);

app.use(helmet(getHelmetConfig()));
app.use(compression());
app.use(morgan("combined", { stream: { write: (m) => logger.info(m.trim()) } }));

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  })
);

app.use("/api/", RateLimitManager.getGlobalLimiter());
app.use("/api/auth/login", RateLimitManager.getAuthLimiter());
app.use("/api/auth/register", RateLimitManager.getAuthLimiter());
app.use("/api/tracks/upload", RateLimitManager.getUploadLimiter());

// Stripe needs the raw body to verify the signature — mounted before the JSON parser.
const licenses = require("./routes/licenses");
app.post("/api/licenses/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }), licenses.stripeWebhook);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Uploaded audio is NEVER served statically — it only leaves through the
// auth/share-gated /api/tracks/stream/:id route.
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const publicDir = path.join(__dirname, "../public");
if (fs.existsSync(publicDir)) app.use("/public", express.static(publicDir));

// ── Health ───────────────────────────────────────────────────────────────────
// Storage is checked too (cached 30 s): on 2026-10-12 a redeploy left the API without a route
// to MinIO and every stream failed while /health still said "ok".
let storageCheck = { at: 0, ok: false };
async function storageOk() {
  if (Date.now() - storageCheck.at < 30_000) return storageCheck.ok;
  let ok = false;
  try {
    await Promise.race([objectStore.ensureReady(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))]);
    ok = true;
  } catch {
    ok = false;
  }
  storageCheck = { at: Date.now(), ok };
  return ok;
}

app.get(["/health", "/api/health"], async (req, res) => {
  let dbOk = false;
  try {
    await pool.query("SELECT 1");
    dbOk = true;
  } catch {
    /* reported below */
  }
  const stOk = await storageOk();
  res.status(dbOk && stOk ? 200 : 503).json({
    status: dbOk && stOk ? "ok" : "degraded",
    storage_ok: stOk,
    app: "HRL Sync API",
    version: require("../package.json").version,
    db: dbOk ? "connected" : "error",
    storage: process.env.STORAGE_DRIVER || "s3",
    ai: !!process.env.OPENROUTER_API_KEY,
    ts: new Date().toISOString(),
  });
});

// ── API routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/licenses/admin", licenses.admin); // auth inside
app.use("/api/licenses", licenses.router);       // public shop endpoints
const promo = require("./routes/promo");
app.use("/api/promo/public", promo.publicRouter); // partner application form (no login)
app.use("/api/promo", promo.router);               // team: partners, submissions, applications
app.use("/api/business", businessRoutes);

// /stream/:id and /public are reachable without a login (the route checks the
// ownership token / share token / is_public); everything else needs auth.
const { optionalAuth } = authMiddleware;
app.use(
  "/api/tracks",
  (req, res, next) => {
    if (req.path.startsWith("/stream/") || req.path === "/public") return optionalAuth(req, res, next);
    return authMiddleware(req, res, next);
  },
  tracksRoutes
);

app.use("/api/lyrics", lyricsRoutes); // route-level optionalAuth / auth
app.use("/api/playlists", playlistsRoutes); // public share route + router.use(auth)
app.use("/api/analytics", analyticsRoutes); // public event route + router.use(auth)
app.use("/api/embed", embedRoutes);
app.use("/api/contacts", authMiddleware, contactsRoutes);
app.use("/api/projects", authMiddleware, projectsRoutes);

app.post("/api/ai/analyze-track/:id", authMiddleware, async (req, res) => {
  // Shared catalog: any logged-in user can request this, not just the uploader.
  const { rows } = await pool.query("SELECT *, musical_key AS key FROM tracks WHERE id=$1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Track not found" });
  res.json(await aiService.detectMoodAndGenre(rows[0]));
});

app.use("*", (req, res) => res.status(404).json({ error: "Not found" }));

if (Sentry) Sentry.setupExpressErrorHandler(app); // reports 5xx before our handler responds
app.use(errorHandler);

module.exports = { app, allowedOrigins };
