-- Weekly frequency and PRN support for medications
ALTER TABLE medications
  ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (frequency IN ('daily', 'weekly')),
  ADD COLUMN IF NOT EXISTS day_of_week SMALLINT
    CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  ADD COLUMN IF NOT EXISTS is_prn BOOLEAN NOT NULL DEFAULT false;
