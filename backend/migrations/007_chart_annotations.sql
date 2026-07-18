-- Chart annotations: user-defined markers on the glucose chart and trend views
CREATE TABLE IF NOT EXISTS chart_annotations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  annotated_at TIMESTAMPTZ NOT NULL,
  label        TEXT NOT NULL CHECK (char_length(label) <= 120),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chart_annotations_time
  ON chart_annotations (user_id, annotated_at);
