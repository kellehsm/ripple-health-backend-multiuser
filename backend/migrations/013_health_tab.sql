CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  dosage TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE medication_schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  time_of_day TEXT NOT NULL CHECK (time_of_day IN ('morning','midday','evening','custom')),
  specific_time TIME,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE medication_dose_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  medication_id UUID NOT NULL REFERENCES medications(id),
  slot_id UUID REFERENCES medication_schedule_slots(id),
  log_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('taken','skipped')) DEFAULT 'taken',
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, medication_id, slot_id, log_date)
);

CREATE INDEX idx_dose_logs_user_date ON medication_dose_logs (user_id, log_date);

CREATE TABLE cycle_day_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  log_date DATE NOT NULL,
  flow_intensity TEXT CHECK (flow_intensity IN ('none','spotting','light','medium','heavy')),
  symptoms TEXT[],
  mood_label TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, log_date)
);

CREATE TABLE cycle_custom_symptoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, label)
);

CREATE TABLE emotion_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  label TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('default','mood_tab','cycle_tab')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, label)
);

INSERT INTO emotion_vocabulary (user_id, label, source) VALUES
  (NULL, 'irritable', 'default'),
  (NULL, 'anxious', 'default'),
  (NULL, 'sad', 'default'),
  (NULL, 'weepy', 'default'),
  (NULL, 'angry', 'default'),
  (NULL, 'low energy', 'default'),
  (NULL, 'happy', 'default'),
  (NULL, 'calm', 'default'),
  (NULL, 'content', 'default'),
  (NULL, 'overwhelmed', 'default'),
  (NULL, 'sensitive', 'default'),
  (NULL, 'energetic', 'default')
ON CONFLICT DO NOTHING;
