-- Workout programs: generated starter plans + wizard completion flag
-- setup_complete lives in user_settings JSONB under settings.workout_setup_complete

CREATE TABLE workout_programs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  name             TEXT NOT NULL,
  goal             TEXT NOT NULL,  -- strength|muscle_gain|fat_loss|endurance|general_fitness
  experience_level TEXT NOT NULL,  -- beginner|intermediate|advanced
  days_per_week    INT  NOT NULL,
  preferred_minutes INT NOT NULL,
  equipment        TEXT[] NOT NULL DEFAULT '{}',
  muscle_focus     TEXT[] NOT NULL DEFAULT '{}',
  location         TEXT NOT NULL DEFAULT 'any',
  limitations      TEXT[] NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workout_programs_user ON workout_programs (user_id, created_at DESC);

CREATE TABLE workout_program_days (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES workout_programs(id) ON DELETE CASCADE,
  day_number INT  NOT NULL,
  focus      TEXT NOT NULL,  -- push|pull|legs|upper|lower|full_body
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE workout_program_exercises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id        UUID NOT NULL REFERENCES workout_program_days(id) ON DELETE CASCADE,
  exercise_id   UUID NOT NULL REFERENCES exercise_library(id),
  sets          INT  NOT NULL DEFAULT 3,
  rep_range_min INT  NOT NULL DEFAULT 8,
  rep_range_max INT  NOT NULL DEFAULT 12,
  sort_order    INT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);
