-- Add mood_label, period, and entry_type columns to journal_entries.
-- These exist in production already; this migration brings dev DB up to the same schema.

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS mood_label TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'period';
