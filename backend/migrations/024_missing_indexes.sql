CREATE INDEX IF NOT EXISTS idx_annotations_user_time
  ON chart_annotations (user_id, annotated_at);

CREATE INDEX IF NOT EXISTS idx_spending_untagged
  ON spending_entries (user_id, logged_at)
  WHERE tag IS NULL;

CREATE INDEX IF NOT EXISTS idx_friend_connections_a
  ON friend_connections (user_id_a, status);

CREATE INDEX IF NOT EXISTS idx_friend_connections_b
  ON friend_connections (user_id_b, status);

CREATE INDEX IF NOT EXISTS idx_friend_nudges_pair_time
  ON friend_nudges (sender_id, recipient_id, sent_at);

CREATE INDEX IF NOT EXISTS idx_hobby_logs_user
  ON hobby_logs (user_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_reading_logs_user
  ON reading_logs (user_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_cycle_logs_user_date
  ON cycle_day_logs (user_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_substance_logs_user_time
  ON substance_logs (user_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_type
  ON journal_entries (user_id, entry_type, logged_at DESC);
