-- ═══════════════════════════════════════════════════════════════════════════
-- HRL Sync — PostgreSQL Self-Hosted Schema
-- Run: psql -U hrlsync -d hrlsync -f schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fast text search

-- ─── Types ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE clearance_status AS ENUM ('cleared_ready','in_progress','not_cleared');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rights_type AS ENUM ('one_stop','two_stop');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('to_do','sent','shortlist','licensed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('playlist_opened','track_played','track_downloaded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lyrics_status AS ENUM ('draft','final','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Users (JWT-based, no Supabase dependency) ───────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT,                         -- null if Google OAuth only
  full_name   TEXT,
  company_name TEXT,
  avatar_url  TEXT,
  is_admin    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Google OAuth tokens per user
CREATE TABLE IF NOT EXISTS user_drive_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date   BIGINT,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── Tracks ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  artist               TEXT NOT NULL,
  composer             TEXT,
  isrc                 TEXT,
  iswc                 TEXT,
  -- Google Drive is the source of truth for files
  google_drive_file_id TEXT,                  -- Drive file ID
  local_file_path      TEXT,                  -- Relative path in /uploads
  file_name            TEXT NOT NULL,
  file_size            BIGINT,
  mime_type            TEXT DEFAULT 'audio/mpeg',
  duration             INTEGER,               -- seconds
  bpm                  INTEGER,
  key                  TEXT,
  description          TEXT,
  rights_type          rights_type,
  clearance_status     clearance_status DEFAULT 'not_cleared',
  source               TEXT DEFAULT 'google_drive',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- Metadata tables
CREATE TABLE IF NOT EXISTS track_genres (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  genre    TEXT NOT NULL,
  sub_genre TEXT,
  UNIQUE(track_id, genre)
);

CREATE TABLE IF NOT EXISTS track_moods (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  mood     TEXT NOT NULL,
  UNIQUE(track_id, mood)
);

CREATE TABLE IF NOT EXISTS track_instruments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id   UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  instrument TEXT NOT NULL,
  UNIQUE(track_id, instrument)
);

CREATE TABLE IF NOT EXISTS track_keywords (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  keyword  TEXT NOT NULL,
  UNIQUE(track_id, keyword)
);

CREATE TABLE IF NOT EXISTS track_rights (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id       UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL,   -- 'composer','lyricist','master_owner','publisher'
  percentage     DECIMAL(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  pro_organization TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS track_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id     UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  version_type TEXT NOT NULL,
  google_drive_file_id TEXT,      -- Drive file ID for this version
  file_name    TEXT NOT NULL,
  file_size    BIGINT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ─── Lyrics ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lyrics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id              UUID REFERENCES tracks(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  artist                TEXT,
  content               TEXT NOT NULL DEFAULT '',
  preview_text          TEXT,
  language              VARCHAR(5) DEFAULT 'en',
  is_explicit           BOOLEAN DEFAULT false,
  is_public             BOOLEAN DEFAULT false,
  status                lyrics_status DEFAULT 'draft',
  google_doc_id         TEXT,
  last_synced_from_drive TIMESTAMPTZ,
  timecodes             JSONB,                -- [{time_ms, line, line_index}]
  copyright_notice      TEXT,
  publishing_info       JSONB,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lyrics_views (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lyrics_id  UUID NOT NULL REFERENCES lyrics(id) ON DELETE CASCADE,
  viewer_ip  INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Contacts (CRM) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  company      TEXT,
  role         TEXT,
  notes        TEXT,
  tags         TEXT[],
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ─── Playlists / Pitches ─────────────────────────────────────────────────────
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

-- ─── Projects (Kanban) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  status      project_status DEFAULT 'to_do',
  notes       TEXT,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  playlist_id UUID REFERENCES playlists(id) ON DELETE SET NULL,
  position    INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Share Links ─────────────────────────────────────────────────────────────
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

-- ─── Analytics ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracking_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shareable_link_id   UUID NOT NULL REFERENCES shareable_links(id) ON DELETE CASCADE,
  event_type          event_type NOT NULL,
  track_id            UUID REFERENCES tracks(id) ON DELETE SET NULL,
  recipient_email     TEXT,
  ip_address          INET,
  user_agent          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ─── Embed Settings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS embed_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  primary_color   VARCHAR(7) DEFAULT '#FF3C50',
  logo_url        TEXT,
  company_name    TEXT DEFAULT 'HRL Sync',
  show_branding   BOOLEAN DEFAULT true,
  custom_css      TEXT,
  allowed_domains TEXT[],
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tracks_user        ON tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_created     ON tracks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_drive_id    ON tracks(google_drive_file_id);
CREATE INDEX IF NOT EXISTS idx_tracks_title_trgm  ON tracks USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_trgm ON tracks USING gin(artist gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_lyrics_user        ON lyrics(user_id);
CREATE INDEX IF NOT EXISTS idx_lyrics_track       ON lyrics(track_id);
CREATE INDEX IF NOT EXISTS idx_lyrics_public      ON lyrics(is_public);

CREATE INDEX IF NOT EXISTS idx_playlists_user     ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user      ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user      ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_events_link        ON tracking_events(shareable_link_id);
CREATE INDEX IF NOT EXISTS idx_events_created     ON tracking_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_token        ON shareable_links(link_token);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN FOR t IN SELECT unnest(ARRAY['users','tracks','lyrics','contacts','playlists','projects','embed_settings'])
LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %s', t, t);
  EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
END LOOP; END $$;
