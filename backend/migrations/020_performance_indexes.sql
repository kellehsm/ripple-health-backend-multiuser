-- Performance indexes for high-query-volume tables that previously had none.
-- Run with CREATE INDEX CONCURRENTLY on a live database to avoid table locks.

CREATE INDEX IF NOT EXISTS idx_metric_logs_metric_date
  ON metric_logs (metric_id, logged_at);

CREATE INDEX IF NOT EXISTS idx_metrics_user_name
  ON metrics (user_id, name);

CREATE INDEX IF NOT EXISTS idx_exercise_sessions_user_date
  ON exercise_sessions (user_id, started_at);

CREATE INDEX IF NOT EXISTS idx_sleep_sessions_user_time
  ON sleep_sessions (user_id, start_time);

CREATE INDEX IF NOT EXISTS idx_heart_rate_user_time
  ON heart_rate_readings (user_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_hobby_logs_hobby_time
  ON hobby_logs (hobby_id, logged_at);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_date
  ON daily_summaries (user_id, date);
