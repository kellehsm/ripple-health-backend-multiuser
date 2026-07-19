-- Color categories
CREATE TABLE medication_color_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, label)
);

-- Prescribers
CREATE TABLE medication_prescribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT,
  phone TEXT,
  office_location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Change history
CREATE TABLE medication_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN
    ('added','dose_changed','frequency_changed','prescriber_changed','stopped')),
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON medication_history (medication_id, changed_at DESC);

-- Extend medications
ALTER TABLE medications
  ADD COLUMN color_category_id UUID REFERENCES medication_color_categories(id) ON DELETE SET NULL,
  ADD COLUMN purpose TEXT,
  ADD COLUMN refill_date DATE,
  ADD COLUMN prescriber_id UUID REFERENCES medication_prescribers(id) ON DELETE SET NULL;
