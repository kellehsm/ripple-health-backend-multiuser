CREATE TABLE IF NOT EXISTS monthly_narratives (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month       CHAR(7) NOT NULL,       -- 'YYYY-MM'
  narrative   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS monthly_narratives_user_month_idx ON monthly_narratives (user_id, month);
