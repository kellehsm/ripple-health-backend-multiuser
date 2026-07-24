-- Username (optional, for invite by username instead of email)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);

-- Friend connections (canonical: user_id_a < user_id_b always)
CREATE TABLE IF NOT EXISTS friend_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id_a, user_id_b),
  CHECK (user_id_a < user_id_b)
);
CREATE INDEX IF NOT EXISTS friend_connections_a_idx ON friend_connections(user_id_a);
CREATE INDEX IF NOT EXISTS friend_connections_b_idx ON friend_connections(user_id_b);

-- Per-user sharing prefs (all off by default)
CREATE TABLE IF NOT EXISTS friend_sharing_prefs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  share_steps    BOOLEAN NOT NULL DEFAULT false,
  share_exercise BOOLEAN NOT NULL DEFAULT false,
  share_hobbies  BOOLEAN NOT NULL DEFAULT false,
  share_books    BOOLEAN NOT NULL DEFAULT false
);

-- Challenges
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('steps','exercise','hobbies','books')),
  goal_description TEXT NOT NULL,
  goal_value NUMERIC,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS challenges_created_by_idx ON challenges(created_by);

-- Challenge participants
CREATE TABLE IF NOT EXISTS challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(challenge_id, user_id)
);
CREATE INDEX IF NOT EXISTS challenge_participants_challenge_idx ON challenge_participants(challenge_id);
CREATE INDEX IF NOT EXISTS challenge_participants_user_idx ON challenge_participants(user_id);

-- Social notification prefs
CREATE TABLE IF NOT EXISTS social_notification_prefs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notify_friend_requests   BOOLEAN NOT NULL DEFAULT true,
  notify_challenge_invites BOOLEAN NOT NULL DEFAULT true,
  notify_challenge_updates BOOLEAN NOT NULL DEFAULT true,
  notify_friend_book_finish BOOLEAN NOT NULL DEFAULT true,
  notify_friend_milestone  BOOLEAN NOT NULL DEFAULT false
);
