/**
 * Automatic rule sunset — any rule with < 5% hit rate across all users after
 * 60 days of history gets marked as archived. Archived rules are still
 * present in code (in case we want to iterate) but the engine skips them
 * and they don't count against multiple-comparison correction.
 *
 * Sunset state is written to `insight_global_priors.hit_rate` (a value < 0
 * means archived). Engine reads this at startup — we keep it out of code
 * so a rule can be un-archived without a redeploy.
 */

import { query } from "../db.js";

const HIT_RATE_FLOOR = 0.05; // 5%
const MIN_AGE_DAYS = 60;

export async function sunsetLowHitRules(): Promise<{ archived: number }> {
  const rows = await query<{ rule_id: string; hit_rate: number }>(
    `SELECT gp.rule_id, gp.hit_rate
     FROM insight_global_priors gp
     WHERE gp.updated_at < NOW() - INTERVAL '${MIN_AGE_DAYS} days'
       OR gp.updated_at IS NULL`
  );
  let archived = 0;
  for (const r of rows) {
    if (r.hit_rate < HIT_RATE_FLOOR && r.hit_rate >= 0) {
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
