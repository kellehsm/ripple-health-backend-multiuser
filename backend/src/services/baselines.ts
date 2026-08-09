import { query } from "../db.js";

/**
 * Per-user, per-metric rolling baselines used by the insights engine.
 *
 * WHY: Rules used hard-coded thresholds (good sleep = 7h+, high steps = 8k+,
 *      etc.) which made "high vs low" bucketing meaningless for users whose
 *      normal is outside those global cutoffs. This service computes each
 *      user's own median, 33rd percentile, and 67th percentile over the last
 *      60 days per metric — so rules can compare "your unusually-high sleep
 *      night" against "your usual" instead of a global constant.
 *
 * WHEN:  Recompute weekly (see jobs/baselinesJob.ts) and on-demand from the
 *        insights engine when a baseline is missing or stale (>7 days old).
 *
 * HOW to add a new metric:
 *   1. Add a case to buildMetricRows() with the query that returns one row per
 *      day per user with `metric_value`.
 *   2. Add the metric name to METRIC_IDS.
 *   3. Rules can read it via getBaseline(userId, metricName).
 */

export type MetricId =
  | "sleep_secs"       // total sleep per day in seconds
  | "steps"            // daily step count (from metric_logs where metric.name = 'steps')
  | "glucose_avg"      // daily mean glucose (mg/dL)
  | "glucose_cv"       // daily coefficient of variation (SD / mean)
  | "mood"             // daily average mood_score from journal_entries
  | "water"            // daily total water logs
  | "spending"         // daily total spend
  | "resting_hr";      // daily min heart_rate (proxy for resting HR)

export const METRIC_IDS: MetricId[] = [
  "sleep_secs", "steps", "glucose_avg", "glucose_cv", "mood",
  "water", "spending", "resting_hr",
];

export interface Baseline {
  metric: MetricId;
  median: number | null;
  p33: number | null;      // 33rd percentile → below this = "low for you"
  p67: number | null;      // 67th percentile → above this = "high for you"
  std_dev: number | null;
  sample_size: number;
  computed_at: string;
}

const WINDOW_DAYS = 60;
const STALE_AFTER_DAYS = 7;
const MIN_SAMPLE_SIZE = 10; // don't publish a baseline until we have at least this many day-observations

/**
 * SQL for each metric that returns one row per day with the aggregated value
 * for the trailing WINDOW_DAYS.  Every metric's query MUST produce columns
 * `day` (date) and `metric_value` (numeric).
 */
function metricQuery(metric: MetricId): string {
  const w = WINDOW_DAYS;
  switch (metric) {
    case "sleep_secs":
      return `
        SELECT start_time::date AS day,
               SUM(EXTRACT(EPOCH FROM (end_time - start_time)))::float8 AS metric_value
        FROM sleep_sessions
        WHERE user_id = $1 AND start_time >= NOW() - INTERVAL '${w} days'
        GROUP BY start_time::date
        HAVING SUM(EXTRACT(EPOCH FROM (end_time - start_time))) > 0
      `;
    case "steps":
      return `
        SELECT ml.logged_at::date AS day, MAX(ml.value)::float8 AS metric_value
        FROM metric_logs ml
        JOIN metrics m ON m.id = ml.metric_id
        WHERE m.user_id = $1 AND m.name = 'steps'
          AND ml.logged_at >= NOW() - INTERVAL '${w} days'
        GROUP BY ml.logged_at::date
      `;
    case "glucose_avg":
      return `
        SELECT recorded_at::date AS day, AVG(mg_dl)::float8 AS metric_value
        FROM glucose_readings
        WHERE user_id = $1 AND recorded_at >= NOW() - INTERVAL '${w} days'
        GROUP BY recorded_at::date
        HAVING COUNT(*) >= 5
      `;
    case "glucose_cv":
      return `
        SELECT recorded_at::date AS day,
               (STDDEV_SAMP(mg_dl) / NULLIF(AVG(mg_dl), 0))::float8 AS metric_value
        FROM glucose_readings
        WHERE user_id = $1 AND recorded_at >= NOW() - INTERVAL '${w} days'
        GROUP BY recorded_at::date
        HAVING COUNT(*) >= 20
      `;
    case "mood":
      return `
        SELECT logged_at::date AS day, AVG(mood_score)::float8 AS metric_value
        FROM journal_entries
        WHERE user_id = $1 AND mood_score IS NOT NULL
          AND logged_at >= NOW() - INTERVAL '${w} days'
        GROUP BY logged_at::date
      `;
    case "water":
      return `
        SELECT ml.logged_at::date AS day, SUM(ml.value)::float8 AS metric_value
        FROM metric_logs ml
        JOIN metrics m ON m.id = ml.metric_id
        WHERE m.user_id = $1 AND m.name = 'water'
          AND ml.logged_at >= NOW() - INTERVAL '${w} days'
        GROUP BY ml.logged_at::date
      `;
    case "spending":
      return `
        SELECT logged_at::date AS day, SUM(amount)::float8 AS metric_value
        FROM spending_entries
        WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '${w} days'
        GROUP BY logged_at::date
      `;
    case "resting_hr":
      // Daily min bpm as a proxy for resting HR (excludes obvious spikes).
      return `
        SELECT recorded_at::date AS day, MIN(bpm)::float8 AS metric_value
        FROM heart_rate_readings
        WHERE user_id = $1 AND recorded_at >= NOW() - INTERVAL '${w} days'
        GROUP BY recorded_at::date
        HAVING COUNT(*) >= 5
      `;
  }
}

/** Percentile helper — linear interpolation on a sorted array. */
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute + upsert baselines for one user across all metrics. Metrics with
 * fewer than MIN_SAMPLE_SIZE day-observations are skipped (no row written)
 * so `getBaseline()` returns null and rules can fall back to legacy thresholds.
 */
export async function recomputeBaselinesForUser(userId: string): Promise<{ metric: MetricId; sampleSize: number; wrote: boolean }[]> {
  const results: { metric: MetricId; sampleSize: number; wrote: boolean }[] = [];

  for (const metric of METRIC_IDS) {
    try {
      const rows = await query<{ metric_value: number }>(metricQuery(metric), [userId]);
      const values = rows.map((r) => Number(r.metric_value)).filter((v) => Number.isFinite(v));
      if (values.length < MIN_SAMPLE_SIZE) {
        results.push({ metric, sampleSize: values.length, wrote: false });
        continue;
      }
      const sorted = [...values].sort((a, b) => a - b);
      const median = percentile(sorted, 0.5);
      const p33 = percentile(sorted, 0.33);
      const p67 = percentile(sorted, 0.67);
      const sd = stdDev(values);

      await query(
        `INSERT INTO user_baselines (user_id, metric, median, p33, p67, std_dev, sample_size, window_days, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (user_id, metric) DO UPDATE SET
           median      = EXCLUDED.median,
           p33         = EXCLUDED.p33,
           p67         = EXCLUDED.p67,
           std_dev     = EXCLUDED.std_dev,
           sample_size = EXCLUDED.sample_size,
           window_days = EXCLUDED.window_days,
           computed_at = NOW()`,
        [userId, metric, median, p33, p67, sd, values.length, WINDOW_DAYS]
      );
      results.push({ metric, sampleSize: values.length, wrote: true });
    } catch {
      // A malformed table (e.g. missing metric_logs join for a fresh account)
      // shouldn't take down the whole baselines refresh — swallow and move on.
      results.push({ metric, sampleSize: 0, wrote: false });
    }
  }

  return results;
}

/** Read one baseline for one user. Returns null when unavailable. */
export async function getBaseline(userId: string, metric: MetricId): Promise<Baseline | null> {
  const [row] = await query<{
    metric: MetricId;
    median: number | null;
    p33: number | null;
    p67: number | null;
    std_dev: number | null;
    sample_size: number;
    computed_at: string;
  }>(
    `SELECT metric, median, p33, p67, std_dev, sample_size, computed_at
     FROM user_baselines WHERE user_id = $1 AND metric = $2`,
    [userId, metric]
  );
  if (!row) return null;
  return {
    metric: row.metric,
    median: row.median != null ? Number(row.median) : null,
    p33:    row.p33    != null ? Number(row.p33)    : null,
    p67:    row.p67    != null ? Number(row.p67)    : null,
    std_dev: row.std_dev != null ? Number(row.std_dev) : null,
    sample_size: row.sample_size,
    computed_at: row.computed_at,
  };
}

/** Bulk fetch — one round-trip when a rule needs multiple baselines. */
export async function getBaselines(userId: string, metrics: MetricId[]): Promise<Map<MetricId, Baseline>> {
  if (metrics.length === 0) return new Map();
  const rows = await query<{
    metric: MetricId;
    median: number | null;
    p33: number | null;
    p67: number | null;
    std_dev: number | null;
    sample_size: number;
    computed_at: string;
  }>(
    `SELECT metric, median, p33, p67, std_dev, sample_size, computed_at
     FROM user_baselines WHERE user_id = $1 AND metric = ANY($2::text[])`,
    [userId, metrics]
  );
  const map = new Map<MetricId, Baseline>();
  for (const r of rows) {
    map.set(r.metric, {
      metric: r.metric,
      median:  r.median  != null ? Number(r.median)  : null,
      p33:     r.p33     != null ? Number(r.p33)     : null,
      p67:     r.p67     != null ? Number(r.p67)     : null,
      std_dev: r.std_dev != null ? Number(r.std_dev) : null,
      sample_size: r.sample_size,
      computed_at: r.computed_at,
    });
  }
  return map;
}

/** True when the user has no baselines OR the newest one is older than STALE_AFTER_DAYS. */
export async function baselinesAreStale(userId: string): Promise<boolean> {
  const [row] = await query<{ newest: string | null }>(
    `SELECT MAX(computed_at) AS newest FROM user_baselines WHERE user_id = $1`,
    [userId]
  );
  if (!row?.newest) return true;
  const ageDays = (Date.now() - new Date(row.newest).getTime()) / (1000 * 86400);
  return ageDays > STALE_AFTER_DAYS;
}

/** Ensure baselines are fresh for one user — recompute if missing/stale. */
export async function ensureFreshBaselines(userId: string): Promise<void> {
  if (await baselinesAreStale(userId)) {
    await recomputeBaselinesForUser(userId);
  }
}

/**
 * Weekly job entrypoint — refresh baselines for every user that has any data.
 * Safe to call from a cron scheduler.
 */
export async function refreshAllBaselines(): Promise<{ users: number; totalMetricsWritten: number }> {
  const users = await query<{ id: string }>(
    `SELECT DISTINCT u.id
     FROM users u
     WHERE EXISTS (SELECT 1 FROM journal_entries je WHERE je.user_id = u.id LIMIT 1)
        OR EXISTS (SELECT 1 FROM sleep_sessions ss WHERE ss.user_id = u.id LIMIT 1)
        OR EXISTS (SELECT 1 FROM glucose_readings g WHERE g.user_id = u.id LIMIT 1)`
  );
  let totalMetricsWritten = 0;
  for (const u of users) {
    const results = await recomputeBaselinesForUser(u.id);
    totalMetricsWritten += results.filter((r) => r.wrote).length;
  }
  return { users: users.length, totalMetricsWritten };
}
