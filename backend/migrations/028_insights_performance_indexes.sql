-- Performance indexes for insights job query patterns
CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_date ON daily_summaries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_substance_logs_user_type ON substance_logs(user_id, substance_type, logged_at);
-- Note: end_time is timestamptz; DATE() on timestamptz is volatile so index on end_time directly
CREATE INDEX IF NOT EXISTS idx_sleep_sessions_user_date ON sleep_sessions(user_id, end_time);
CREATE INDEX IF NOT EXISTS idx_cycle_day_logs_user_date ON cycle_day_logs(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_medication_dose_logs_user_date ON medication_dose_logs(user_id, log_date);
