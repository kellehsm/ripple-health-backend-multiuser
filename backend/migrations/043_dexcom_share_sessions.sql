-- Persist Dexcom Share session IDs across backend restarts.
-- Previously the sessionCache lived only in-memory (dexcom-share-sync.ts),
-- so every deploy/restart forced a fresh LoginPublisherAccountById call.
-- Repeated logins within a short window trip Dexcom's rate limiter and
-- lock the account. This table lets us reuse a valid session across boots.
CREATE TABLE IF NOT EXISTS dexcom_share_sessions (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  base_url    TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
