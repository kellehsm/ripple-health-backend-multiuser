-- Backfill ON DELETE CASCADE on every FK that references users(id) without
-- cascade behavior. Deleting a user previously required ~20 explicit DELETEs
-- across child tables in a fixed order; that made account deletion error-
-- prone and left orphan-row risk on partial failure.
--
-- After this migration, a single DELETE FROM users WHERE id = ... will
-- cascade cleanly through every user-owned table.
--
-- 22 constraints total (fetched via pg_constraint on the live DB, so this
-- list is exhaustive as of migration 039).

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'books', 'cycle_custom_symptoms', 'cycle_day_logs', 'daily_summaries',
    'emotion_vocabulary', 'error_reports', 'exercise_sessions',
    'feature_hints_dismissed', 'glucose_readings', 'heart_rate_readings',
    'hobbies', 'hobby_logs', 'journal_entries', 'meals',
    'medication_dose_logs', 'medications', 'metrics', 'reading_logs',
    'sleep_sessions', 'spending_entries', 'substance_logs', 'workout_programs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE %I
         DROP CONSTRAINT IF EXISTS %I_user_id_fkey,
         ADD CONSTRAINT %I_user_id_fkey
           FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
      tbl, tbl, tbl
    );
  END LOOP;
END $$;
