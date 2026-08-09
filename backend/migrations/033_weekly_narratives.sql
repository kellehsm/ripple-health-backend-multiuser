-- Migration 033: weekly LLM-synthesized narratives
--
-- One row per (user, week_of). The insights engine + a Sunday-morning cron
-- assemble the week's top insights + stat highlights, hand them to Claude
-- (or a template fallback when no API key is set), and cache the result
-- here. Fetched by the client from /insights/narrative on the InsightsScreen.

CREATE TABLE IF NOT EXISTS weekly_narratives (
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_of       DATE        NOT NULL,                     -- Sunday of the covered week
  body          TEXT        NOT NULL,                     -- 3-paragraph prose
  source        TEXT        NOT NULL DEFAULT 'template',  -- 'llm' | 'template'
  input_summary JSONB       NOT NULL DEFAULT '{}',        -- what we passed to the model
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_of)
);

CREATE INDEX IF NOT EXISTS idx_weekly_narratives_recent
  ON weekly_narratives (user_id, week_of DESC);
