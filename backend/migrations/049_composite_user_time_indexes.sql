-- Composite (user_id, timestamp) indexes for tables that get queried with
-- WHERE user_id = $1 AND <time_col> range predicates but lacked a covering index.
-- heart_rate_readings already covered by idx_heart_rate_user_time (migration 020).

-- medication_dose_logs: existing idx_dose_logs_user_date covers (user_id, log_date);
-- add a covering index on taken_at for timestamp-range queries.
CREATE INDEX IF NOT EXISTS idx_medication_dose_logs_user_taken_at
  ON medication_dose_logs (user_id, taken_at DESC);

-- cycle_day_logs: existing idx_cycle_day_logs_user_date covers (user_id, log_date);
-- add a covering index on created_at for timestamp-range queries.
CREATE INDEX IF NOT EXISTS idx_cycle_day_logs_user_created_at
  ON cycle_day_logs (user_id, created_at DESC);

-- metric_logs: covers mindfulness sessions and all other custom metrics logged
-- via the metric_logs table (joined to metrics.user_id).
-- Migration 020 has idx_metric_logs_metric_date on (metric_id, logged_at);
-- add a direct user-level index via metrics join is not possible as a plain index —
-- instead index metric_logs on logged_at for the metric_id already covered,
-- and add a composite on metrics (user_id, id) to speed the join lookup.
CREATE INDEX IF NOT EXISTS idx_metrics_user_id
  ON metrics (user_id, id);
