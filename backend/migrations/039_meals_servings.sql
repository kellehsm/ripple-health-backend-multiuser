-- Servings on meals: nutrition columns are per-serving, `servings` is how many
-- servings the user actually ate. Total nutrition = value * servings.
-- Default 1 keeps every existing row semantically equivalent.
ALTER TABLE meals ADD COLUMN IF NOT EXISTS servings NUMERIC(6,2) NOT NULL DEFAULT 1;
