-- Migration 035: media asset library + admin flag
--
-- App content assets (soundscape audio, chimes, images, videos) uploaded and
-- managed by an admin through /admin/media, streamed to the app via
-- /api/media/file/:id. Assets are global app content, not per-user data.

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,                       -- 'audio' | 'image' | 'video' | 'other'
  category TEXT,                            -- e.g. 'soundscape', 'chime', 'guide'
  title TEXT NOT NULL,
  filename TEXT NOT NULL,                   -- stored name on disk (uuid + ext)
  original_name TEXT,
  mime TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,  -- freeform: emoji, loop, duration…
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_kind_category
  ON media_assets (kind, category, sort_order);

-- Admin flag gates media mutations (uploads/deletes). kjsmyre = prod owner
-- account; demo@ripple.test exists only in the dev DB.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET is_admin = TRUE WHERE email IN ('kjsmyre@gmail.com', 'demo@ripple.test');
