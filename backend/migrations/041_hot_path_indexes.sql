-- Hot-path indexes for user × time-ordered reads that are currently doing
-- full-table scans. Every one of these tables gets queried by the daily
-- summary, dashboard, and insight rules — the pattern is always
-- `WHERE user_id = $1 AND <time_col> ...` with a time-ordered result.
--
-- CONCURRENTLY skipped: these tables are small in dev; if you run this
-- against a large prod instance, rewrite as
-- `CREATE INDEX CONCURRENTLY IF NOT EXISTS ...` and run each statement
-- separately outside a transaction.

CREATE INDEX IF NOT EXISTS idx_meals_user_logged_at
  ON meals (user_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_glucose_readings_user_recorded_at
  ON glucose_readings (user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_spending_entries_user_logged_at
  ON spending_entries (user_id, logged_at DESC);
