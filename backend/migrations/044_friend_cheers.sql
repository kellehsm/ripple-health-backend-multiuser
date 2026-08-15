-- Feature: Streak Cheers (one-tap cheer for a friend's streak, one per friend per day)
CREATE TABLE IF NOT EXISTS friend_cheers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_friend_cheers_recipient ON friend_cheers(recipient_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_cheers_pair_day ON friend_cheers(sender_id, recipient_id, sent_at);
