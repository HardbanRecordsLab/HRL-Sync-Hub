// Direct connection to CMLP's own database (cmlp), used ONLY for creating new tracks.
//
// The shared catalog (`tracks`) is reached from this app in two ways:
//   1. `db/pool.js` — the local `hrl_sync` connection, where `tracks` is a postgres_fdw
//      foreign table pointing at cmlp.tracks (set up 2026-09-22). Reads/JOINs/UPDATEs/
//      DELETEs by id go through this — existing queries barely changed.
//   2. This module — a genuinely separate connection straight to `cmlp`, needed ONLY for
//      INSERTs that create a new track row. postgres_fdw's IMPORT FOREIGN SCHEMA does not
//      carry over the remote `id` column's `DEFAULT nextval(...)`, so an INSERT through the
//      foreign table sends an explicit NULL for `id` and fails NOT NULL — confirmed live,
//      2026-09-22. Inserting directly against cmlp sidesteps that; the new row is then
//      immediately visible through the foreign table for any follow-up read.
//
// CMLP_DATABASE_URL must point at the same `hbrl-postgres` server, database `cmlp` — not
// the shared hrl_sync DATABASE_URL.
const { Pool } = require("pg");
const { logger } = require("../utils/logger");

if (!process.env.CMLP_DATABASE_URL) {
  logger.warn("CMLP_DATABASE_URL not set — creating new tracks (upload, Drive import, metadata-only) will fail.");
}

const catalogPool = new Pool({
  connectionString: process.env.CMLP_DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  min: 0,
  max: parseInt(process.env.CMLP_DB_POOL_MAX || "5"),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

catalogPool.on("error", (err) => logger.error("CMLP catalog pool error:", err.message));

const catalogQuery = async (text, params) => {
  const start = Date.now();
  const res = await catalogPool.query(text, params);
  const ms = Date.now() - start;
  if (ms > 1000) logger.warn(`Slow catalog query (${ms}ms): ${text.substring(0, 80)}`);
  return res;
};

module.exports = { catalogPool, catalogQuery };
