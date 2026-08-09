import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { LOOKBACK_DAYS, avgOf, tertileSplit } from "./ruleHelper.js";

// Do high-stress days correlate with higher spending? Signal for "retail
// therapy" or stress-eating-out patterns. Uses daily_summaries.stress_score
// (0-100, higher = more stress) + summary_data.finance.totalSpend.
export const StressVsSpendingRule: InsightRule = {
  id: "stress_vs_spending",
  type: "mood",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; stress: number; spend: number }>(
      `SELECT
         date::text AS date,
         stress_score::numeric AS stress,
         (summary_data->'finance'->>'totalSpend')::numeric AS spend
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - ${LOOKBACK_DAYS}
         AND stress_score IS NOT NULL
         AND summary_data->'finance'->>'totalSpend' IS NOT NULL`,
      [userId]
    );

    if (rows.length < 21) return null;

    const { lowGroup: calmDays, highGroup: stressedDays } = tertileSplit(rows, (r) => Number(r.stress));
    if (calmDays.length < 5 || stressedDays.length < 5) return null;

    const avgSpendCalm = avgOf(calmDays, (r) => Number(r.spend));
    const avgSpendStressed = avgOf(stressedDays, (r) => Number(r.spend));
    const diff = avgSpendStressed - avgSpendCalm;
    if (Math.abs(diff) < 5) return null; // $5 noise floor

    const effectRatio = Math.abs(diff) / Math.max(avgSpendCalm, avgSpendStressed, 1);
    const { score, label } = calcConfidence(Math.min(calmDays.length, stressedDays.length), effectRatio);
    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Spending is ${direction} on high-stress days`,
      description: `On your most stressful days you spent $${avgSpendStressed.toFixed(0)} on average, compared to $${avgSpendCalm.toFixed(0)} on your calmest days — a difference of $${Math.abs(diff).toFixed(0)}.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        stressed_days: stressedDays.length,
        calm_days: calmDays.length,
        avg_spend_stressed: avgSpendStressed.toFixed(2),
        avg_spend_calm: avgSpendCalm.toFixed(2),
        difference_dollars: diff.toFixed(2),
        direction,
      },
    };
  },
};
