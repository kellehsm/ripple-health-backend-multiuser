CREATE TABLE IF NOT EXISTS daily_summaries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES users(id),
  date               DATE NOT NULL,
  sleep_score        SMALLINT,
  glucose_score      SMALLINT,
  activity_score     SMALLINT,
  hydration_score    SMALLINT,
  nutrition_score    SMALLINT,
  mood_score         SMALLINT,
  productivity_score SMALLINT,
  stress_score       SMALLINT,
  overall_score      SMALLINT,
  summary_data       JSONB DEFAULT '{}'::jsonb,
  insights           JSONB DEFAULT '[]'::jsonb,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_date ON daily_summaries (user_id, date DESC);
