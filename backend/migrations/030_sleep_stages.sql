-- Migration 030: persist per-stage sleep durations
--
-- Health Connect gives us stages (deep / REM / light / awake) per SleepSession.
-- The client used to compute them and cache to AsyncStorage only, so the data
-- was lost on app reinstall and never available for trend analysis. Store on
-- the session row so /sleep/range + /sleep/stats can surface breakdowns.
--
-- All four columns are nullable — most Google Fit / older Android sources don't
-- provide stage data, and we still want to keep the session for total duration.

ALTER TABLE sleep_sessions
  ADD COLUMN IF NOT EXISTS deep_ms   BIGINT,
  ADD COLUMN IF NOT EXISTS rem_ms    BIGINT,
  ADD COLUMN IF NOT EXISTS light_ms  BIGINT,
  ADD COLUMN IF NOT EXISTS awake_ms  BIGINT;
