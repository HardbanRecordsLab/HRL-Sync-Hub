require('dotenv').config();
const { query } = require('./pool');
const { logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const init = async () => {
  try {
    const schemaPath = path.join(__dirname, '../../../db/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    
    logger.info("Initializing schema...");
    await query(sql);
    logger.info("✅ Schema initialized successfully");
    
    // Also run business migration
    const migrateBusiness = require('./migrate_business');
    await migrateBusiness();
    
  } catch (e) {
    logger.error("Initialization failed: " + e.message);
    console.error(e);
  }
};

init().then(() => process.exit(0));
