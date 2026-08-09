-- Migration 034: insights engine upgrades
--
-- Adds:
--   * insight_rule_runs   — per-rule-per-run telemetry for observability
--   * insight_pins        — user bookmark/pin state
--   * insight_nudges      — per-user nudge cooldown tracking
--   * user_rule_weights   — continuous per-rule weight from feedback
--   * user_insights.pinned column
--   * daily_snapshots     — per-day metric snapshots the anomaly layer reads
--   * insight_experiment_results — outcome payload for follow-up insight

CREATE TABLE IF NOT EXISTS insight_rule_runs (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id        TEXT NOT NULL,
  rule_version   INTEGER NOT NULL DEFAULT 1,
  tier           TEXT NOT NULL DEFAULT 'semiweekly',
  ran_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  runtime_ms     INTEGER NOT NULL DEFAULT 0,
  fired          BOOLEAN NOT NULL DEFAULT FALSE,
  fdr_rejected   BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_rule_runs_user_ran ON insight_rule_runs (user_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_runs_rule     ON insight_rule_runs (rule_id, ran_at DESC);

CREATE TABLE IF NOT EXISTS insight_pins (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_id  UUID NOT NULL REFERENCES user_insights(id) ON DELETE CASCADE,
  pinned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, insight_id)
);

CREATE TABLE IF NOT EXISTS insight_nudges (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id      TEXT NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clicked      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_nudges_user_sent ON insight_nudges (user_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS user_rule_weights (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id      TEXT NOT NULL,
  weight       DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, rule_id)
);

ALTER TABLE user_insights ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_insights ADD COLUMN IF NOT EXISTS variant TEXT;
ALTER TABLE user_insights ADD COLUMN IF NOT EXISTS rank_score DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS insight_experiment_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id  UUID NOT NULL,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id        TEXT NOT NULL,
  before_mean    DOUBLE PRECISION,
  after_mean     DOUBLE PRECISION,
  p_value        DOUBLE PRECISION,
  direction      TEXT,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aggregated cross-user priors used for cold-start.
-- Populated by a nightly job; only stores anonymized coefficients.
CREATE TABLE IF NOT EXISTS insight_global_priors (
  rule_id       TEXT PRIMARY KEY,
  mean_effect   DOUBLE PRECISION,
  hit_rate      DOUBLE PRECISION,
  helpful_rate  DOUBLE PRECISION,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
