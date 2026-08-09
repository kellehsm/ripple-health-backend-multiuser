/**
 * Cross-user aggregated priors for cold-start.
 *
 * WHY: new accounts have no baselines and see almost nothing for 2–3 weeks.
 * We aggregate per-rule fire rates and helpful-feedback rates across ALL
 * users into a single row per rule. New users' insights use these priors to
 * pre-weight rule rankings, so they still get *something* useful early.
 *
 * Privacy: we only aggregate rule-level effect magnitudes and feedback
 * counts — no per-user records or raw data ever leave the aggregation.
 */

import { query } from "../db.js";

export async function computeGlobalPriors(): Promise<{ rules: number }> {
  const rows = await query<{ rule_id: string; hit_rate: number; helpful_rate: number; mean_effect: number }>(
    `WITH per_rule AS (
       SELECT
         ui.rule_id,
         COUNT(*)::float                                                                       AS n_fires,
         AVG(NULLIF((ui.supporting_data->>'effect_size')::float, 0))                            AS mean_effect
       FROM user_insights ui
       WHERE ui.status = 'active' OR ui.status = 'stale'
       GROUP BY ui.rule_id
     ),
     fb AS (
       SELECT rule_id,
              COUNT(*) FILTER (WHERE rating = 'helpful')::float
                / NULLIF(COUNT(*), 0)::float                                                    AS helpful_rate
       FROM insight_feedback
       GROUP BY rule_id
     ),
     users AS (SELECT COUNT(*)::float AS total FROM users)
     SELECT p.rule_id,
            p.n_fires / GREATEST(1, u.total) AS hit_rate,
            COALESCE(fb.helpful_rate, 0.5)   AS helpful_rate,
            COALESCE(p.mean_effect, 0)       AS mean_effect
     FROM per_rule p LEFT JOIN fb USING (rule_id) CROSS JOIN users u`
  );

  for (const r of rows) {
    await query(
      `INSERT INTO insight_global_priors (rule_id, mean_effect, hit_rate, helpful_rate)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (rule_id) DO UPDATE SET
         mean_effect  = EXCLUDED.mean_effect,
         hit_rate     = EXCLUDED.hit_rate,
         helpful_rate = EXCLUDED.helpful_rate,
         updated_at   = NOW()`,
      [r.rule_id, r.mean_effect, r.hit_rate, r.helpful_rate]
    );
  }
  return { rules: rows.length };
}
