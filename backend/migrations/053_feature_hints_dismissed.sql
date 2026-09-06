CREATE TABLE IF NOT EXISTS feature_hints_dismissed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hint_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS feature_hints_dismissed_user_hint
  ON feature_hints_dismissed (user_id, hint_key);
