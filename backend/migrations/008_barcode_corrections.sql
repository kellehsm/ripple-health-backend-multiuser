CREATE TABLE IF NOT EXISTS barcode_corrections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    barcode             TEXT NOT NULL,
    corrected_name      TEXT,
    corrected_carbs_g   NUMERIC,
    corrected_calories  NUMERIC,
    corrected_sugar_g   NUMERIC,
    corrected_caffeine_mg NUMERIC,
    corrected_abv_percent NUMERIC,
    corrected_serving_size TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, barcode)
);
