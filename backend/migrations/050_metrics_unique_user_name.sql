-- 050: enforce one metric row per (user_id, name).
-- POST /metrics now upserts/returns-existing; this index makes the guarantee
-- hard at the DB level. metric_logs(metric_id, logged_at) already exists
-- (idx_metric_logs_metric_date, migration 020; idx_metric_logs_metric_logged, 046).

-- De-dupe first: repoint logs from duplicate metric rows to the lowest-id
-- keeper, then remove the duplicates.
WITH keepers AS (
  SELECT user_id, name, MIN(id::text)::uuid AS keep_id
  FROM metrics
  GROUP BY user_id, name
)
UPDATE metric_logs ml
SET metric_id = k.keep_id
FROM metrics m
JOIN keepers k ON k.user_id = m.user_id AND k.name = m.name
WHERE ml.metric_id = m.id
  AND m.id <> k.keep_id;

DELETE FROM metrics m
USING (
  SELECT user_id, name, MIN(id::text)::uuid AS keep_id
  FROM metrics
  GROUP BY user_id, name
) k
WHERE m.user_id = k.user_id
  AND m.name = k.name
  AND m.id <> k.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_user_name_unique
  ON metrics (user_id, name);
