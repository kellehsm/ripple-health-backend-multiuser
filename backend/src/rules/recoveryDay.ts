/**
 * Recovery-day rule.
 *
 * Compares performance (steps, mood, resting HR next morning) after a rest
 * day vs after two consecutive training days. Descriptive only — surfaces
 * whether the user benefits from more spacing.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { welchTTest } from "./stats.js";

function trainedYesterday(rows: any[], i: number): boolean {
  return i > 0 && (rows[i - 1].exercise_min ?? 0) >= 20;
}
function trainedTwoBefore(rows: any[], i: number): boolean {
  return i > 1 && (rows[i - 1].exercise_min ?? 0) >= 20 && (rows[i - 2].exercise_min ?? 0) >= 20;
}

export const RecoveryDayRule: InsightRule = {
  id: "recovery_day_pattern",
  type: "exercise",
  minDays: 30,
  tier: "weekly",
  version: 1,
  actionable: true,
  primaryMetric: "steps",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    const rows = ctx.frame.rows;
    if (rows.length < 30) return null;
    const afterRest: number[] = [];
    const afterBackToBack: number[] = [];
    for (let i = 2; i < rows.length; i++) {
      const steps = rows[i].steps;
      if (steps == null) continue;
      if (!trainedYesterday(rows, i)) afterRest.push(steps);
      else if (trainedTwoBefore(rows, i)) afterBackToBack.push(steps);
    }
    if (afterRest.length < 6 || afterBackToBack.length < 6) return null;

    const t = welchTTest(afterRest, afterBackToBack);
    if (t.pValue > 0.1) return null;

    const diff = t.meanA - t.meanB;
    const dir = diff > 0 ? "more" : "fewer";
    return {
      title: `You take ${Math.abs(Math.round(diff))} ${dir} steps the day after a rest day`,
      description:
        `Days after a rest day average ${Math.round(t.meanA)} steps vs ${Math.round(t.meanB)} steps after ` +
        `two consecutive training days. Consider building in more recovery.`,
      confidence: t.pValue < 0.05 ? "high" : "moderate",
      confidenceScore: Math.min(80, 40 + Math.round((1 - t.pValue) * 40)),
      timesObserved: afterRest.length + afterBackToBack.length,
      pValue: t.pValue,
      supportingData: {
        avg_steps_after_rest: Math.round(t.meanA),
        avg_steps_after_back_to_back: Math.round(t.meanB),
        step_difference: Math.round(diff),
        p_value: Number(t.pValue.toFixed(3)),
      },
    };
  },
};
