-- Progressive overload fields on exercise_log_entries
-- actual_reps_per_set: one INT per set completed in order
-- all_sets_maxed: true when every set hit target_rep_range_max (drives Phase 6 double-progression)

ALTER TABLE exercise_log_entries
  ADD COLUMN weight_used         NUMERIC,
  ADD COLUMN target_rep_range_min INT,
  ADD COLUMN target_rep_range_max INT,
  ADD COLUMN actual_reps_per_set  INT[],
  ADD COLUMN all_sets_maxed       BOOLEAN;
