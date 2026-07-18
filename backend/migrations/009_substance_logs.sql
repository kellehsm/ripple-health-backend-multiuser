CREATE TABLE IF NOT EXISTS substance_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id),
  substance_type TEXT NOT NULL,
  name           TEXT,
  caffeine_mg    NUMERIC,
  abv_percent    NUMERIC,
  volume_ml      NUMERIC,
  source_db      TEXT,
  logged_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_substance_logs_user_date ON substance_logs (user_id, logged_at);
