-- Migration 004: Add unique constraints required for safe backup restore and Health Connect re-sync
--
-- Without these, re-syncing Health Connect after a restore would insert duplicate rows because
-- the sync routes used plain INSERT with no conflict target. These constraints give each row a
-- real unique identity beyond its surrogate PK, so ON CONFLICT can be used in both the sync
-- routes and the restore endpoint.

-- Health Connect heart-rate re-sync safety
ALTER TABLE heart_rate_readings
  ADD CONSTRAINT uq_heart_rate_user_time UNIQUE (user_id, recorded_at);

-- Health Connect sleep re-sync safety
ALTER TABLE sleep_sessions
  ADD CONSTRAINT uq_sleep_user_start UNIQUE (user_id, start_time);

-- Dexcom re-sync safety (Dexcom polling already tracks "since last reading" but belt-and-suspenders)
ALTER TABLE glucose_readings
  ADD CONSTRAINT uq_glucose_user_time UNIQUE (user_id, recorded_at);

-- The steps sync route already uses ON CONFLICT (metric_id, logged_at) but the backing
-- unique constraint was never created — add it now so that clause is actually valid.
ALTER TABLE metric_logs
  ADD CONSTRAINT uq_metric_log UNIQUE (metric_id, logged_at);
