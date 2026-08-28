-- Add composite indexes to improve query performance on hobby_logs and
-- medication_dose_logs. These tables are queried frequently by hobby streak,
-- weekly-digest, and medication adherence routes without a covering index.

CREATE INDEX IF NOT EXISTS idx_hobby_logs_hobby_id ON hobby_logs (hobby_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_dose_logs_med_date ON medication_dose_logs (medication_id, log_date, status);
