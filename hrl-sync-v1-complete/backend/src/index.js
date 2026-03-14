require("dotenv").config();
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const compression = require("compression");
const helmet = require("helmet");

const { logger } = require("./utils/logger");
const { testConnection } = require("./db/pool");
const errorHandler = require("./middleware/errorHandler");
const authMiddleware = require("./middleware/auth");
const { getHelmetConfig, RateLimitManager } = require("./middleware/security");

// ── Routes ────────────────────────────────────────────────────────────────────
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

const app = express();

app.set("trust proxy", 1);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet(getHelmetConfig()));

app.use(compression());
app.use(morgan("combined", { stream: { write: m => logger.info(m.trim()) } }));

// ── CORS ──────────────────────────────────────────────────────────────────────
const origins = (process.env.ALLOWED_ORIGINS || "*").split(",");
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origins.includes("*") || origins.includes(origin)) cb(null, true);
    else cb(null, true); // permissive in dev
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
}));

// ── Rate limits ───────────────────────────────────────────────────────────────
app.use("/api/", RateLimitManager.getGlobalLimiter());
app.use("/api/auth/login", RateLimitManager.getAuthLimiter());
app.use("/api/auth/register", RateLimitManager.getAuthLimiter());

// ── Parsers ───────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Static Files ──────────────────────────────────────────────────────────────
const path = require("path");
const fs = require("fs");
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use("/uploads", express.static(uploadsDir));
app.use("/public", express.static(path.join(__dirname, "../public")));

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  const { pool } = require("./db/pool");
  let dbOk = false;
  try { await pool.query("SELECT 1"); dbOk = true; } catch { }
  res.json({
    status: "ok",
    app: "HRL Sync API",
    version: "2.0.0-premium",
    db: dbOk ? "connected" : "error",
    drive: !!process.env.GOOGLE_CLIENT_ID,
    ts: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/tracks", (req, res, next) => {
  if (req.path.startsWith("/stream/") && req.query.shareToken) return next();
  return authMiddleware(req, res, next);
}, tracksRoutes);
app.use("/api/lyrics", lyricsRoutes);
app.use("/api/drive", authMiddleware, driveRoutes);
app.use("/api/playlists", playlistsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/embed", embedRoutes);
app.use("/api/contacts", authMiddleware, contactsRoutes);
app.use("/api/projects", authMiddleware, projectsRoutes);

// AI Insight Route
app.post("/api/ai/analyze-track/:id", authMiddleware, async (req, res) => {
  const track = await require("./db/pool").queryOne("SELECT * FROM tracks WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!track) return res.status(404).json({ error: "Track not found" });
  const analysis = await aiService.detectMoodAndGenre(track);
  res.json(analysis);
});

app.use("*", (req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
(async () => {
  try {
    await testConnection(); 
    
    // Auto-run migrations
    const migrateCore = require("./db/migrate_core");
    const migrateBusiness = require("./db/migrate_business");
    await migrateCore();
    await migrateBusiness();
    
    app.listen(PORT, "0.0.0.0", () => {
      logger.info(`🎵 HRL Sync Hub PREMIUM API — port ${PORT} | env: ${process.env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error("Failed to start HRL Sync API:", err.message);
    process.exit(1);
  }
})();

module.exports = app;
