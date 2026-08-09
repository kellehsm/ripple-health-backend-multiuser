-- Migration 031: personalized baselines for the insights engine
--
-- Rules currently use hard-coded thresholds (good sleep = 7h+, high steps =
-- 8k+, high glucose = 130+). For someone who sleeps 6.5h nightly the "good
-- sleep" bucket is always empty — the rule can't fire on their own patterns.
--
-- This table stores per-user, per-metric rolling baselines (median + std dev
-- over the last 60 days). Rules read from here to compare "high vs low FOR
-- THIS USER" instead of "high vs low globally."
--
-- Refreshed by services/baselines.ts on a weekly cron and at engine startup
-- (only recomputes if last update > 7 days ago).

CREATE TABLE IF NOT EXISTS user_baselines (
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric       TEXT        NOT NULL,                    -- e.g. 'sleep_secs', 'steps', 'glucose_avg'
  median       DOUBLE PRECISION,                        -- 50th percentile
  p33          DOUBLE PRECISION,                        -- 33rd percentile (low-tertile boundary)
  p67          DOUBLE PRECISION,                        -- 67th percentile (high-tertile boundary)
  std_dev      DOUBLE PRECISION,
  sample_size  INTEGER     NOT NULL DEFAULT 0,          -- # observations used
  window_days  INTEGER     NOT NULL DEFAULT 60,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, metric)
);

CREATE INDEX IF NOT EXISTS idx_user_baselines_computed
  ON user_baselines (computed_at);
