require('dotenv').config();
const { queryAll } = require('./pool');
const { logger } = require('../utils/logger');

const check = async () => {
  try {
    const tables = await queryAll("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("Existing tables:", tables.map(t => t.table_name).join(", "));
    
    const types = await queryAll("SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')");
    console.log("Existing types:", types.map(t => t.typname).join(", "));
  } catch (e) {
    console.error("Check failed:", e);
  }
};

check().then(() => process.exit(0));
