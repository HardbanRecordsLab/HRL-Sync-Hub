const { Pool } = require("pg");
const { logger } = require("../utils/logger");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  min: parseInt(process.env.DB_POOL_MIN || "2"),
  max: parseInt(process.env.DB_POOL_MAX || "10"),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => logger.error("PG pool error:", err.message));
pool.on("connect", () => logger.debug("PG: new client connected"));

// Helper: run query returning rows
const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - start;
  if (ms > 1000) logger.warn(`Slow query (${ms}ms): ${text.substring(0, 80)}`);
  return res;
};

// Helper: single row or null
const queryOne = async (text, params) => {
  const res = await pool.query(text, params);
  return res.rows[0] ?? null;
};

// Helper: all rows
const queryAll = async (text, params) => {
  const res = await pool.query(text, params);
  return res.rows;
};

// Test connection on startup
const testConnection = async () => {
  try {
    await pool.query("SELECT NOW()");
    logger.info("✅ PostgreSQL connected");
  } catch (err) {
    logger.error("❌ PostgreSQL connection failed:", err.message);
    process.exit(1);
  }
};

module.exports = { pool, query, queryOne, queryAll, testConnection };
