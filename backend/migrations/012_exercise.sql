-- Exercise feature: library, sessions, log entries

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE exercise_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  equipment TEXT,
  primary_muscles TEXT[],
  secondary_muscles TEXT[],
  instructions TEXT[],
  images TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_exercise_library_name    ON exercise_library USING gin (name gin_trgm_ops);
CREATE INDEX idx_exercise_library_muscles ON exercise_library USING gin (primary_muscles);

CREATE TABLE exercise_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_exercise_sessions_user ON exercise_sessions (user_id, started_at DESC);

CREATE TABLE exercise_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exercise_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercise_library(id),
  sets INTEGER,
  reps INTEGER,
  duration_seconds INTEGER,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_exercise_log_entries_session ON exercise_log_entries (session_id, sort_order);
