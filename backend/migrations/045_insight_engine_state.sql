-- Incremental insight engine watermark: tracks the latest frame date seen per user
-- so semiweekly/weekly rules can be skipped when no new data has arrived in 3+ days.
CREATE TABLE IF NOT EXISTS insight_engine_state (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  latest_frame_date DATE NOT NULL,
  last_run_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
