-- Add auth columns to users table and create user_settings table.
-- These exist in production already; this migration brings a fresh dev DB up to the same schema.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb
);

GRANT ALL PRIVILEGES ON TABLE user_settings TO wellness_user;
