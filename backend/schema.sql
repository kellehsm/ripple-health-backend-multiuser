-- ============================================================
-- WELLNESS APP - DATABASE SCHEMA (PostgreSQL)
-- Single-user app, but user_id kept for future-proofing
-- ============================================================

-- ---------- CORE ----------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- One row per day, rolled up from all sources. Cheap to query for
-- the Overview tab and doctor exports without joining everything live.
CREATE TABLE daily_summary (
    user_id UUID REFERENCES users(id),
    date DATE NOT NULL,
    steps INT,
    sleep_minutes INT,
    resting_heart_rate INT,
    water_glasses INT,
    mood_score SMALLINT,          -- 1-5
    screen_time_minutes INT,
    weather_condition TEXT,
    weather_temp_f NUMERIC,
    total_spend NUMERIC,
    glucose_avg NUMERIC,
    glucose_peak NUMERIC,
    pages_read INT,
    PRIMARY KEY (user_id, date)
);

-- ---------- GENERIC METRIC ENGINE ----------
-- Covers water, screen time, meds taken, workouts done, etc.
-- Anything single-value + timestamped without its own rich fields.
CREATE TABLE metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name TEXT NOT NULL,             -- 'water', 'screen_time', 'medication', 'workout'
    value_type TEXT NOT NULL,       -- 'number', 'duration_minutes', 'scale_1_5', 'boolean'
    unit TEXT,                      -- 'glasses', 'minutes', 'bpm'
    icon TEXT,
    color_key TEXT                  -- 'teal' | 'blue' | 'amber' | 'coral' | 'pink' | 'green'
);

CREATE TABLE metric_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_id UUID REFERENCES metrics(id),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    value NUMERIC,
    note TEXT
);

-- ---------- HEART RATE / SLEEP (from Health Connect) ----------
CREATE TABLE heart_rate_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL,
    bpm INT NOT NULL,
    source TEXT DEFAULT 'health_connect'
);

CREATE TABLE sleep_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    quality_score SMALLINT,          -- if the watch/Health Connect provides one
    source TEXT DEFAULT 'health_connect'
);

-- ---------- GLUCOSE (from Dexcom) ----------
-- High volume, 5-min intervals, kept separate from daily_summary.
CREATE TABLE glucose_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL,
    mg_dl NUMERIC NOT NULL,
    trend TEXT,                       -- 'rising', 'falling', 'steady'
    source TEXT DEFAULT 'dexcom'
);

-- ---------- FOOD ----------
CREATE TABLE meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    meal_type TEXT,                  -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
    carbs_g NUMERIC,
    sugar_g NUMERIC,
    calories NUMERIC,
    source_db TEXT,                  -- 'usda' | 'openfoodfacts' | 'manual'
    source_food_id TEXT              -- external ID for re-lookup
);

-- ---------- BOOKS ----------
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    title TEXT NOT NULL,
    author TEXT,
    cover_url TEXT,
    total_pages INT,
    status TEXT DEFAULT 'reading',   -- 'reading' | 'finished' | 'dropped' | 'want_to_read'
    rating SMALLINT,                 -- 1-5, set on finish
    started_at DATE,
    finished_at DATE,
    total_chapters INT,
    current_chapter INT
);

CREATE TABLE reading_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID REFERENCES books(id),
    logged_at DATE NOT NULL DEFAULT current_date,
    pages_read INT NOT NULL
);

-- ---------- HOBBIES (generalized "books" pattern for anything else) ----------
CREATE TABLE hobbies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name TEXT NOT NULL,               -- 'guitar practice', 'woodworking', 'gaming'
    unit_label TEXT,                  -- what a "log" measures: 'minutes practiced', 'projects', 'sessions'
    icon TEXT,
    color_key TEXT
);

CREATE TABLE hobby_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hobby_id UUID REFERENCES hobbies(id),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    amount NUMERIC,                   -- e.g. 45 (minutes)
    rating SMALLINT,                  -- optional 1-5, "how did this session feel"
    note TEXT
);

-- ---------- JOURNAL / MOOD ----------
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    mood_score SMALLINT NOT NULL,     -- 1-5
    entry_text TEXT
);

-- ---------- SPENDING (manual entry, or ingested from Goldfinch later) ----------
CREATE TABLE spending_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    amount NUMERIC NOT NULL,
    category TEXT,                     -- 'food' | 'subscriptions' | 'misc' | ...
    source TEXT DEFAULT 'manual'       -- 'manual' | 'goldfinch_import'
);

-- ---------- INDEXES for the correlation queries ----------
CREATE INDEX idx_glucose_time ON glucose_readings (user_id, recorded_at);
CREATE INDEX idx_meals_time ON meals (user_id, logged_at);
CREATE INDEX idx_spending_time ON spending_entries (user_id, logged_at);
CREATE INDEX idx_journal_time ON journal_entries (user_id, logged_at);
