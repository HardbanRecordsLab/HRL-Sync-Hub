/**
 * Applies db/schema.sql. Idempotent — runs on every boot and via `npm run db:migrate`.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("./pool");
const { logger } = require("../utils/logger");

const SCHEMA_PATH = path.join(__dirname, "schema.sql");

async function migrate() {
  const sql = fs.readFileSync(SCHEMA_PATH, "utf8");
  await pool.query(sql);
  logger.info("✅ Schema applied (db/schema.sql)");
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((e) => {
      logger.error("❌ Migration failed: " + e.message);
      process.exit(1);
    });
}

module.exports = migrate;
