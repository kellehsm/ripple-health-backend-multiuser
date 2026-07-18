CREATE TABLE IF NOT EXISTS user_insights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id          TEXT NOT NULL,
  type             TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  confidence       TEXT NOT NULL CHECK (confidence IN ('low','moderate','high','very_high')),
  confidence_score NUMERIC(5,1) NOT NULL DEFAULT 0,
  supporting_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_detected   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_confirmed   TIMESTAMPTZ NOT NULL DEFAULT now(),
  times_observed   INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'active',
  dismissed        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_user ON user_insights (user_id, dismissed, status);
