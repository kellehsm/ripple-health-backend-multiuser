-- Weather integration: daily weather data per user + location fields on user_settings.
-- Location (lat/lon/name) is stored in user_settings.settings JSONB under the "weather" key.
-- This migration only adds the weather_daily table; no schema change to user_settings needed
-- because settings is already a freeform JSONB column.

CREATE TABLE IF NOT EXISTS weather_daily (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  temp_max_c      NUMERIC(5,2),
  temp_min_c      NUMERIC(5,2),
  precipitation_mm NUMERIC(7,2),
  rain_hours      NUMERIC(5,1),
  snow_mm         NUMERIC(7,2),
  daylight_minutes INTEGER,
  weather_code    INTEGER,
  cloud_cover_pct INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS weather_daily_user_date ON weather_daily (user_id, date DESC);

GRANT ALL PRIVILEGES ON TABLE weather_daily TO wellness_user;
GRANT USAGE, SELECT ON SEQUENCE weather_daily_id_seq TO wellness_user;
