/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HRL SYNC HUB — BUSINESS & B2B DATABASE EXTENSION
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { query } = require('./pool');
const { logger } = require('../utils/logger');

const runMigration = async () => {
    logger.info("Running Business Migration...");

    const tables = `
        -- Agencies 
        CREATE TABLE IF NOT EXISTS agencies (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT,
            country TEXT,
            city TEXT,
            contact_email TEXT,
            website TEXT,
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        );

        -- B2B Clients
        CREATE TABLE IF NOT EXISTS b2b_clients (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT,
            industry TEXT,
            contact_email TEXT,
            subscription_tier TEXT DEFAULT 'free',
            status TEXT DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT now()
        );

        -- White Label Channels
        CREATE TABLE IF NOT EXISTS white_label_channels (
            id UUID PRIMARY KEY,
            client_id UUID NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            channel_type TEXT,
            branding JSONB,
            settings JSONB,
            created_at TIMESTAMPTZ DEFAULT now()
        );

        -- Tracks in Channels
        CREATE TABLE IF NOT EXISTS channel_tracks (
            id UUID PRIMARY KEY,
            channel_id UUID NOT NULL REFERENCES white_label_channels(id) ON DELETE CASCADE,
            track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            added_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(channel_id, track_id)
        );
    `;

    try {
        await query(tables);
        logger.info("✅ Business Migration successful");
    } catch (e) {
        logger.error("❌ Business Migration failed: " + e.message);
        console.error(e);
        process.exit(1);
    }
};

if (require.main === module) {
    runMigration().then(() => process.exit(0));
}

module.exports = runMigration;
