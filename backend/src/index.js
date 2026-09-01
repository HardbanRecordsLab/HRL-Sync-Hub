require("dotenv").config();

const { logger } = require("./utils/logger");

// ── Fail fast on missing critical config ─────────────────────────────────────
for (const key of ["JWT_SECRET", "DATABASE_URL"]) {
  if (!process.env[key]) {
    logger.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const { testConnection } = require("./db/pool");
const migrate = require("./db/migrate");
const { app, allowedOrigins } = require("./app");

const PORT = process.env.PORT || 3001;

(async () => {
  await testConnection();
  try {
    await migrate();
  } catch (err) {
    logger.error(`Schema migration failed — starting anyway, /health will report degraded: ${err.message}`);
  }
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`🎵 HRL Sync API — port ${PORT} | env: ${process.env.NODE_ENV || "development"}`);
    logger.info(`   CORS origins: ${allowedOrigins.join(", ")}`);
  });
})();

module.exports = app;
