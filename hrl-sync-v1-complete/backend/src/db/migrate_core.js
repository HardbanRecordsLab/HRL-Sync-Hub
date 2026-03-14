const { query } = require('./pool');
const { logger } = require('../utils/logger');

const runMigration = async () => {
    logger.info("Running Core Migration...");

    const sql = `
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";
        CREATE EXTENSION IF NOT EXISTS "pg_trgm";

        DO $$ BEGIN
          CREATE TYPE clearance_status AS ENUM ('cleared_ready','in_progress','not_cleared');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        DO $$ BEGIN
          CREATE TYPE rights_type AS ENUM ('one_stop','two_stop');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        CREATE TABLE IF NOT EXISTS users (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email       TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          full_name   TEXT,
          company_name TEXT,
          avatar_url  TEXT,
          is_admin    BOOLEAN DEFAULT false,
          created_at  TIMESTAMPTZ DEFAULT now(),
          updated_at  TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS tracks (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title                TEXT NOT NULL,
          artist               TEXT NOT NULL,
          composer             TEXT,
          isrc                 TEXT,
          iswc                 TEXT,
          google_drive_file_id TEXT,
          local_file_path      TEXT,
          file_name            TEXT NOT NULL,
          file_size            BIGINT,
          mime_type            TEXT DEFAULT 'audio/mpeg',
          duration             INTEGER,
          bpm                  INTEGER,
          key                  TEXT,
          description          TEXT,
          rights_type          rights_type,
          clearance_status     clearance_status DEFAULT 'not_cleared',
          source               TEXT DEFAULT 'google_drive',
          is_public            BOOLEAN DEFAULT false,
          created_at           TIMESTAMPTZ DEFAULT now(),
          updated_at           TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS playlists (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name        TEXT NOT NULL,
          description TEXT,
          created_at  TIMESTAMPTZ DEFAULT now(),
          updated_at  TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          playlist_id   UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          track_id      UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
          position      INTEGER NOT NULL,
          track_comment TEXT
        );

        CREATE TABLE IF NOT EXISTS shareable_links (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          playlist_id     UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          link_token      TEXT NOT NULL UNIQUE,
          is_active       BOOLEAN DEFAULT true,
          expires_at      TIMESTAMPTZ,
          allow_downloads BOOLEAN DEFAULT false,
          require_email   BOOLEAN DEFAULT false,
          password_hash   TEXT,
          created_at      TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS tracking_events (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          shareable_link_id   UUID NOT NULL REFERENCES shareable_links(id) ON DELETE CASCADE,
          event_type          TEXT NOT NULL,
          track_id            UUID REFERENCES tracks(id) ON DELETE SET NULL,
          recipient_email     TEXT,
          ip_address          INET,
          user_agent          TEXT,
          created_at          TIMESTAMPTZ DEFAULT now()
        );
    `;

    try {
        await query(sql);
        logger.info("✅ Core Migration successful");
    } catch (e) {
        logger.error("❌ Core Migration failed: " + e.message);
        console.error(e);
        process.exit(1);
    }
};

if (require.main === module) {
    runMigration().then(() => process.exit(0));
}

module.exports = runMigration;
