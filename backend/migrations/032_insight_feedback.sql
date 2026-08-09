-- Migration 032: insight feedback + action loop
--
-- Closes the "so what?" gap in the insights engine. Users can now tell us
-- whether an insight was useful (or already known, or missing the point),
-- and rules that consistently get downvoted get filtered out of that user's
-- active insights feed.
--
-- One row per (user, insight) — latest rating wins (upsert on that pair).

CREATE TABLE IF NOT EXISTS insight_feedback (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_id    UUID        NOT NULL REFERENCES user_insights(id) ON DELETE CASCADE,
  rule_id       TEXT        NOT NULL,   -- denormalized for suppression queries
  rating        TEXT        NOT NULL CHECK (rating IN ('helpful','neutral','not_useful','already_knew')),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, insight_id)
);

CREATE INDEX IF NOT EXISTS idx_insight_feedback_rule
  ON insight_feedback (user_id, rule_id, rating);
