-- 046: token_version for JWT revocation + logout, plus missing performance indexes

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_exercise_sessions_user_started ON exercise_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_metric_logs_metric_logged ON metric_logs(metric_id, logged_at);
