CREATE INDEX IF NOT EXISTS idx_reading_logs_book ON reading_logs (book_id, logged_at DESC);
