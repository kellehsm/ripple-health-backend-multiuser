CREATE TABLE IF NOT EXISTS streak_freezes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  freeze_month DATE NOT NULL, -- first day of the month this freeze was used
  applied_to_date DATE NOT NULL, -- the missed day that was covered
  streak_type TEXT NOT NULL, -- e.g. 'mindfulness', 'logging', 'exercise'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS streak_freezes_user_month_type
  ON streak_freezes (user_id, freeze_month, streak_type);
