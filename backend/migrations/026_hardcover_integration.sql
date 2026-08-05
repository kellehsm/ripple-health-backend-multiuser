-- Migration 026: Hardcover.app integration
-- Adds: hardcover_id + updated_at + hardcover_synced_at to books,
--        updated_at trigger, sync queue, and sync audit log.

-- ── books table additions ───────────────────────────────────────────────────

ALTER TABLE books
  ADD COLUMN IF NOT EXISTS hardcover_id       INT,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS hardcover_synced_at TIMESTAMPTZ;

-- Backfill updated_at for rows that existed before this migration
UPDATE books SET updated_at = COALESCE(started_at::timestamptz, now())
 WHERE updated_at = now() AND started_at IS NOT NULL;

-- Trigger: keep updated_at current on every user-initiated UPDATE.
-- The sync job reads this to decide which side is newer (last-updated-wins).
CREATE OR REPLACE FUNCTION set_books_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS books_set_updated_at ON books;
CREATE TRIGGER books_set_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW
  EXECUTE FUNCTION set_books_updated_at();

-- ── Sync queue: retry store for failed push operations ─────────────────────

CREATE TABLE IF NOT EXISTS hardcover_sync_queue (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id      UUID        NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  operation    TEXT        NOT NULL,    -- 'push_status' | 'push_progress'
  payload      JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  retry_count  INT         NOT NULL DEFAULT 0,
  last_error   TEXT
);

CREATE INDEX IF NOT EXISTS idx_hardcover_sync_queue_user
  ON hardcover_sync_queue (user_id, created_at);

-- ── Sync audit log: one row per push/pull action for debugging ─────────────

CREATE TABLE IF NOT EXISTS hardcover_sync_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id    UUID,
  direction  TEXT        NOT NULL,   -- 'push' | 'pull'
  field      TEXT,                   -- 'status' | 'progress'
  detail     TEXT,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hardcover_sync_log_user
  ON hardcover_sync_log (user_id, synced_at DESC);

GRANT ALL PRIVILEGES ON TABLE hardcover_sync_queue TO wellness_user;
GRANT ALL PRIVILEGES ON TABLE hardcover_sync_log   TO wellness_user;
