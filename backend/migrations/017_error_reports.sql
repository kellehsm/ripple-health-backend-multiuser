CREATE SEQUENCE IF NOT EXISTS error_report_number_seq START 1000;

CREATE TABLE error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number INTEGER NOT NULL DEFAULT nextval('error_report_number_seq'),
  user_id UUID REFERENCES users(id),
  message TEXT,
  context TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_reports_created ON error_reports (created_at DESC);
