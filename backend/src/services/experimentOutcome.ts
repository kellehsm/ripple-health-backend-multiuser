/**
 * Experiment outcome → follow-up insight.
 *
 * When an experiment ends (end_date < today AND no outcome row exists yet),
 * compute before/after means over the tracked metric window and emit a
 * new insight into user_insights so the user sees the result in their feed.
 */

import { query } from "../db.js";

interface EndedExp {
  id: string;
  user_id: string;
  description: string;
  start_date: string;
  end_date: string;
  metrics: string[];
}

const METRIC_TO_SQL: Record<string, { sql: string; label: string; unit: string }> = {
  mood_score: {
    sql: `SELECT AVG(mood_score)::float AS v FROM journal_entries
          WHERE user_id = $1 AND logged_at BETWEEN $2 AND $3 AND mood_score IS NOT NULL`,
    label: "mood", unit: "/5",
  },
  sleep_minutes: {
    sql: `SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::float AS v FROM sleep_sessions
          WHERE user_id = $1 AND start_time BETWEEN $2 AND $3`,
    label: "sleep", unit: " min",
  },
  glucose_average: {
    sql: `SELECT AVG(mg_dl)::float AS v FROM glucose_readings
          WHERE user_id = $1 AND recorded_at BETWEEN $2 AND $3`,
    label: "glucose", unit: " mg/dL",
  },
  steps: {
    sql: `SELECT AVG(v)::float AS v FROM (
            SELECT ml.logged_at::date AS d, MAX(ml.value) AS v
            FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
            WHERE m.user_id = $1 AND m.name = 'steps'
              AND ml.logged_at BETWEEN $2 AND $3
            GROUP BY ml.logged_at::date
          ) t`,
    label: "steps", unit: "",
  },
};

async function meanForWindow(userId: string, metric: string, from: string, to: string): Promise<number | null> {
  const cfg = METRIC_TO_SQL[metric];
  if (!cfg) return null;
  const rows = await query<{ v: number | null }>(cfg.sql, [userId, from, to]);
  return rows[0]?.v != null ? Number(rows[0].v) : null;
}

export async function processEndedExperiments(): Promise<{ processed: number }> {
  const ended = await query<EndedExp>(
    `SELECT e.id, e.user_id, e.description, e.start_date::text, e.end_date::text, e.metrics
     FROM experiments e
     LEFT JOIN insight_experiment_results r ON r.experiment_id = e.id
     WHERE e.end_date < CURRENT_DATE AND r.id IS NULL
     LIMIT 100`
  );
  let processed = 0;
  for (const exp of ended) {
    const primary = exp.metrics[0];
    if (!primary || !METRIC_TO_SQL[primary]) continue;

    const start = new Date(exp.start_date);
    const durMs = new Date(exp.end_date).getTime() - start.getTime();
    const beforeStart = new Date(start.getTime() - durMs).toISOString();
    const beforeEnd = start.toISOString();
    const afterStart = start.toISOString();
    const afterEnd = new Date(exp.end_date).toISOString();

    const before = await meanForWindow(exp.user_id, primary, beforeStart, beforeEnd);
    const after  = await meanForWindow(exp.user_id, primary, afterStart, afterEnd);
    if (before == null || after == null) continue;

    const cfg = METRIC_TO_SQL[primary];
    const delta = after - before;
    const direction = delta > 0 ? "up" : "down";

    await query(
      `INSERT INTO insight_experiment_results
         (experiment_id, user_id, rule_id, before_mean, after_mean, direction)
       VALUES ($1, $2, 'experiment_outcome', $3, $4, $5)`,
      [exp.id, exp.user_id, before, after, direction]
    );

    const title = `Experiment result: ${cfg.label} moved ${direction}`;
    const desc =
      `During your ${exp.description.slice(0, 60)}${exp.description.length > 60 ? "…" : ""} ` +
      `your ${cfg.label} averaged ${after.toFixed(1)}${cfg.unit} vs ${before.toFixed(1)}${cfg.unit} in the prior window ` +
      `— a ${delta > 0 ? "+" : ""}${delta.toFixed(1)}${cfg.unit} change.`;

    await query(
      `INSERT INTO user_insights
         (user_id, rule_id, type, title, description, confidence, confidence_score,
          supporting_data, status, dismissed)
       VALUES ($1, $2, 'trend', $3, $4, 'high', 65, $5::jsonb, 'active', FALSE)
       ON CONFLICT (user_id, rule_id) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description,
         supporting_data = EXCLUDED.supporting_data,
         last_confirmed = NOW(), status = 'active', updated_at = NOW()`,
      [
        exp.user_id,
        `experiment_outcome_${exp.id}`,
        title,
        desc,
        JSON.stringify({
          experiment_id: exp.id,
          metric: cfg.label,
          before_mean: Number(before.toFixed(2)),
          after_mean:  Number(after.toFixed(2)),
          difference:  Number(delta.toFixed(2)),
          direction,
        }),
      ]
    );
    processed++;
  }
  return { processed };
}
