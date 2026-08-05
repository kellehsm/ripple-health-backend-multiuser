-- Migration 027: Partial index for Hardcover sync query
-- Speeds up the sync entry query: WHERE user_id = $1 AND hardcover_id IS NOT NULL

CREATE INDEX IF NOT EXISTS idx_books_user_hardcover
  ON books(user_id, hardcover_id)
  WHERE hardcover_id IS NOT NULL;
