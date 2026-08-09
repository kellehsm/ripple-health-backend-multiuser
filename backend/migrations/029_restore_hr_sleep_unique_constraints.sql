-- Migration 029: restore UNIQUE constraints on heart_rate_readings and
-- sleep_sessions that migration 004 added but at some point were dropped
-- from prod (root cause unknown — likely a manual drop or a schema.sql
-- reset). Without these constraints, `INSERT ... ON CONFLICT (user_id,
-- recorded_at) DO NOTHING` in health-connect routes throws Postgres 42P10
-- ("no unique or exclusion constraint matching the ON CONFLICT
-- specification") and the sync 500s.

-- Dedupe first (safe no-op if none exist) so the ALTER doesn't fail.
DELETE FROM heart_rate_readings a
 USING heart_rate_readings b
 WHERE a.user_id = b.user_id
   AND a.recorded_at = b.recorded_at
   AND a.id > b.id;

DELETE FROM sleep_sessions a
 USING sleep_sessions b
 WHERE a.user_id = b.user_id
   AND a.start_time = b.start_time
   AND a.id > b.id;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_heart_rate_user_time') THEN
    ALTER TABLE heart_rate_readings
      ADD CONSTRAINT uq_heart_rate_user_time UNIQUE (user_id, recorded_at);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_sleep_user_time') THEN
    ALTER TABLE sleep_sessions
      ADD CONSTRAINT uq_sleep_user_time UNIQUE (user_id, start_time);
  END IF;
END $$;
