/**
 * Automatic rule sunset — any rule with < 5% hit rate across all users after
 * 60 days of history gets marked as archived. Archived rules are still
 * present in code (in case we want to iterate) but the engine skips them
 * and they don't count against multiple-comparison correction.
 *
 * Sunset state is written to `insight_global_priors.hit_rate` (a value < 0
 * means archived). Engine reads this at startup — we keep it out of code
 * so a rule can be un-archived without a redeploy.
 *
 * Hit rate is computed as fired=TRUE rows / total evaluated rows from
 * insight_rule_runs. This is accurate because the engine now writes a row
 * for every evaluated rule (fired=TRUE when the rule produced an insight,
 * fired=FALSE otherwise), so the denominator correctly reflects all
 * evaluations rather than only successful fires.
 */

import { query } from "../db.js";

const HIT_RATE_FLOOR = 0.05; // 5%
const MIN_AGE_DAYS = 60;

export async function sunsetLowHitRules(): Promise<{ archived: number }> {
  // Compute hit rates from insight_rule_runs (fired=TRUE / total rows) for
  // rules that have at least MIN_AGE_DAYS of history. Only consider rules
  // that are not already archived (hit_rate >= 0 in insight_global_priors).
  const rows = await query<{ rule_id: string; hit_rate: number }>(
    `SELECT
       r.rule_id,
       SUM(CASE WHEN r.fired THEN 1 ELSE 0 END)::float
         / NULLIF(COUNT(*), 0)::float AS hit_rate
     FROM insight_rule_runs r
     WHERE r.ran_at < NOW() - INTERVAL '${MIN_AGE_DAYS} days'
     GROUP BY r.rule_id`
  );

  // Only sunset rules that are known to insight_global_priors and not already
  // archived (hit_rate < 0 means already archived).
  const priorRows = await query<{ rule_id: string; hit_rate: number }>(
    `SELECT rule_id, hit_rate FROM insight_global_priors WHERE hit_rate >= 0`
  );
  const priorMap = new Map(priorRows.map(p => [p.rule_id, p.hit_rate]));

  let archived = 0;
  for (const r of rows) {
    // Skip if not in global priors (never successfully fired, no prior row).
    if (!priorMap.has(r.rule_id)) continue;
    if (r.hit_rate < HIT_RATE_FLOOR) {
      await query(
        `UPDATE insight_global_priors SET hit_rate = -1 WHERE rule_id = $1`,
        [r.rule_id]
      );
      archived++;
    }
  }
  return { archived };
}

/** Returns the set of rule_ids currently archived. Engine skips these. */
export async function archivedRuleIds(): Promise<Set<string>> {
  const rows = await query<{ rule_id: string }>(
    `SELECT rule_id FROM insight_global_priors WHERE hit_rate < 0`
  );
  return new Set(rows.map(r => r.rule_id));
}
