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
import { eligibleUserCount } from "./ruleEligibility.js";

export async function computeGlobalPriors(): Promise<{ rules: number }> {
  // Fire counts + feedback come first — we compute the hit-rate denominator
  // per rule below using each rule's capability requirement so cycle/med/
  // glucose-only rules aren't divided by every user in the system.
  const rows = await query<{ rule_id: string; n_fires: number; helpful_rate: number; mean_effect: number }>(
    `WITH per_rule AS (
       SELECT
         ui.rule_id,
         COUNT(*)::float                                             AS n_fires,
         AVG(NULLIF((ui.supporting_data->>'effect_size')::float, 0)) AS mean_effect
       FROM user_insights ui
       WHERE ui.status = 'active' OR ui.status = 'stale'
       GROUP BY ui.rule_id
     ),
     fb AS (
       SELECT rule_id,
              COUNT(*) FILTER (WHERE rating = 'helpful')::float
                / NULLIF(COUNT(*), 0)::float                          AS helpful_rate
       FROM insight_feedback
       GROUP BY rule_id
     )
     SELECT p.rule_id,
            p.n_fires,
            COALESCE(fb.helpful_rate, 0.5) AS helpful_rate,
            COALESCE(p.mean_effect, 0)     AS mean_effect
     FROM per_rule p LEFT JOIN fb USING (rule_id)`
  );

  const [{ total }] = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM users`
  );
  const totalUsers = Number(total ?? 0) || 1;

  for (const r of rows) {
    const denom = await eligibleUserCount(r.rule_id, totalUsers);
    const hitRate = Number(r.n_fires) / denom;
    await query(
      `INSERT INTO insight_global_priors (rule_id, mean_effect, hit_rate, helpful_rate)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (rule_id) DO UPDATE SET
         mean_effect  = EXCLUDED.mean_effect,
         hit_rate     = EXCLUDED.hit_rate,
         helpful_rate = EXCLUDED.helpful_rate,
         updated_at   = NOW()`,
      [r.rule_id, r.mean_effect, hitRate, r.helpful_rate]
    );
  }
  return { rules: rows.length };
}
