/**
 * Creates (or updates the password of) the admin user.
 * Credentials come from env — never hard-code them.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='strong-pass' npm run db:seed
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { query, queryOne } = require("./pool");
const { logger } = require("../utils/logger");

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    logger.error("Set ADMIN_EMAIL and ADMIN_PASSWORD before running db:seed");
    process.exit(1);
  }
  if (password.length < 8) {
    logger.error("ADMIN_PASSWORD must be at least 8 characters");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const existing = await queryOne("SELECT id FROM users WHERE email = $1", [email]);

  if (existing) {
    await query(
      "UPDATE users SET password_hash = $1, is_admin = true, updated_at = now() WHERE id = $2",
      [hash, existing.id]
    );
    logger.info(`✅ Admin password updated for ${email}`);
  } else {
    await query(
      `INSERT INTO users (email, password_hash, full_name, is_admin)
       VALUES ($1, $2, $3, true)`,
      [email, hash, process.env.ADMIN_NAME || "HRL Admin"]
    );
    logger.info(`✅ Admin user created: ${email}`);
  }
}

if (require.main === module) {
  seedAdmin()
    .then(() => process.exit(0))
    .catch((e) => {
      logger.error("❌ Admin seeding failed: " + e.message);
      process.exit(1);
    });
}

module.exports = seedAdmin;
