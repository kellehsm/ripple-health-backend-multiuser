-- Migration 036: scope sync_log idempotency per user
--
-- sync_log was keyed on the global client-supplied sync_id alone, so one user's
-- sync_id could collide with (or be replayed against) another user's, silently
-- dropping their writes. Scope the idempotency key to (user_id, sync_id).

ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS user_id UUID;

-- Replace the global primary key on sync_id with a per-user unique index.
-- Legacy rows have user_id NULL; they age out via the 30-day TTL cleanup job.
ALTER TABLE sync_log DROP CONSTRAINT IF EXISTS sync_log_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS sync_log_user_sync_idx ON sync_log (user_id, sync_id);
