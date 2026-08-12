-- Snooze support for insight cards. Complements the existing
-- `dismissed` boolean — dismissal is forever, snooze is time-boxed.
--
-- An insight is hidden from GET /insights whenever
--   dismissed = TRUE  OR  snoozed_until > NOW()
-- so both flags coexist cleanly. `snoozed_until` is NULL by default so
-- untouched rows behave exactly as before.
ALTER TABLE user_insights ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
