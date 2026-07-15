-- Migration 003: JSONB context column on meals + journal_entries, sync_log for offline queue

-- Add flexible context column to meals
ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS context JSONB DEFAULT NULL;

-- Add flexible context column to journal_entries
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS context JSONB DEFAULT NULL;

-- Optional GIN indexes: enable fast queries on specific context keys
-- (only worth creating once you have enough rows; comment out if the tables are small)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meals_context
--   ON meals USING gin (context jsonb_path_ops);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_context
--   ON journal_entries USING gin (context jsonb_path_ops);

-- Idempotency log for the offline sync batch endpoint.
-- Processed sync_ids are recorded here so retried batch submissions
-- don't cause duplicate inserts.
CREATE TABLE IF NOT EXISTS sync_log (
  sync_id      TEXT        PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
