require("dotenv").config();
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const { logger } = require("./utils/logger");
const { testConnection } = require("./db/pool");
const errorHandler = require("./middleware/errorHandler");
const authMiddleware = require("./middleware/auth");

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

const app = express();

app.set("trust proxy", 1);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameSrc: ["*"],
      mediaSrc: ["*"],
      imgSrc: ["*", "data:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
    },
  },
}));

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
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, max: 600 }));
app.use("/api/auth/", rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));

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
    version: "1.0.0",
    db: dbOk ? "connected" : "error",
    drive: !!process.env.GOOGLE_CLIENT_ID,
    ts: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/tracks", (req, res, next) => {
  if (req.path.startsWith("/stream/") && req.query.shareToken) return next();
  return authMiddleware(req, res, next);
}, tracksRoutes);
app.use("/api/lyrics", lyricsRoutes);          // public + authed
app.use("/api/drive", authMiddleware, driveRoutes);
app.use("/api/playlists", playlistsRoutes);        // public + authed
app.use("/api/analytics", analyticsRoutes);        // public tracking
app.use("/api/embed", embedRoutes);            // public embed
app.use("/api/contacts", authMiddleware, contactsRoutes);
app.use("/api/projects", authMiddleware, projectsRoutes);

app.use("*", (req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
(async () => {
  await testConnection();
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`🎵 HRL Sync API — port ${PORT} | env: ${process.env.NODE_ENV}`);
  });
})();

module.exports = app;
