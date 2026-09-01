require("express-async-errors");

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const compression = require("compression");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");

const { logger } = require("./utils/logger");
const { pool } = require("./db/pool");
const errorHandler = require("./middleware/errorHandler");
const authMiddleware = require("./middleware/auth");
const { getHelmetConfig, RateLimitManager } = require("./middleware/security");

const authRoutes = require("./routes/auth");
const tracksRoutes = require("./routes/tracks");
const lyricsRoutes = require("./routes/lyrics");
const driveRoutes = require("./routes/drive");
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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Uploaded audio is NEVER served statically — it only leaves through the
// auth/share-gated /api/tracks/stream/:id route.
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const publicDir = path.join(__dirname, "../public");
if (fs.existsSync(publicDir)) app.use("/public", express.static(publicDir));

// ── Health ───────────────────────────────────────────────────────────────────
app.get(["/health", "/api/health"], async (req, res) => {
  let dbOk = false;
  try {
    await pool.query("SELECT 1");
    dbOk = true;
  } catch {
    /* reported below */
  }
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "ok" : "degraded",
    app: "HRL Sync API",
    version: require("../package.json").version,
    db: dbOk ? "connected" : "error",
    drive: !!process.env.GOOGLE_CLIENT_ID,
    ts: new Date().toISOString(),
  });
});

// ── API routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
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
app.use("/api/drive", authMiddleware, driveRoutes);
app.use("/api/playlists", playlistsRoutes); // public share route + router.use(auth)
app.use("/api/analytics", analyticsRoutes); // public event route + router.use(auth)
app.use("/api/embed", embedRoutes);
app.use("/api/contacts", authMiddleware, contactsRoutes);
app.use("/api/projects", authMiddleware, projectsRoutes);

app.post("/api/ai/analyze-track/:id", authMiddleware, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM tracks WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!rows[0]) return res.status(404).json({ error: "Track not found" });
  res.json(await aiService.detectMoodAndGenre(rows[0]));
});

app.use("*", (req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

module.exports = { app, allowedOrigins };
