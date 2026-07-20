import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

const FIXED_CATEGORIES = [
  'Rent / Mortgage',
  'Utilities',
  'Home',
  'Health',
  'health',
  'subscriptions',
  'Subscriptions',
  'income / transfer',
  'Income / Transfer',
];

export const SpendingCyclePhaseRule: InsightRule = {
  id: "spending_cycle_phase",
  type: "spending",
  minDays: 35,

  async run(userId: string): Promise<InsightResult | null> {
    // Join cycle_logs with impulse spending (excluding fixed categories) for last 90 days
    const rows = await query<{ date: string; cycle_day: number; total_spend: number }>(
      `SELECT
         cl.date::text AS date,
         cl.cycle_day,
         COALESCE(se.total, 0) AS total_spend
       FROM cycle_logs cl
       LEFT JOIN (
         SELECT
           logged_at::date AS day,
           SUM(amount) AS total
         FROM spending_entries
         WHERE user_id = $1
           AND logged_at >= CURRENT_DATE - 90
           AND category NOT IN (${FIXED_CATEGORIES.map((_, i) => `$${i + 2}`).join(", ")})
         GROUP BY logged_at::date
       ) se ON se.day = cl.date
       WHERE cl.user_id = $1
         AND cl.date >= CURRENT_DATE - 90
         AND cl.cycle_day IS NOT NULL
         AND COALESCE(se.total, 0) > 0
       ORDER BY cl.date DESC`,
      [userId, ...FIXED_CATEGORIES]
    );

    if (rows.length < 10) return null;

    // Follicular = first half (cycle_day <= 14), Luteal = second half (cycle_day > 14)
    const follicularDays = rows.filter(r => Number(r.cycle_day) <= 14);
    const lutealDays     = rows.filter(r => Number(r.cycle_day) > 14);

    if (follicularDays.length < 5 || lutealDays.length < 5) return null;

    const avgSpendFollicular = follicularDays.reduce((s, r) => s + Number(r.total_spend), 0) / follicularDays.length;
    const avgSpendLuteal     = lutealDays.reduce((s, r) => s + Number(r.total_spend), 0) / lutealDays.length;

    const diff = avgSpendLuteal - avgSpendFollicular; // positive = more spending in second half
    if (Math.abs(diff) < 2) return null;

    const refAmount = Math.max(avgSpendFollicular, avgSpendLuteal, 1);
    const effectRatio = Math.abs(diff) / refAmount;
    const { score, label } = calcConfidence(
      Math.min(follicularDays.length, lutealDays.length),
      effectRatio
    );

    const higherHalf = diff > 0 ? "second half" : "first half";
    const lowerHalf  = diff > 0 ? "first half" : "second half";
    const absDiff    = Math.abs(diff);

    return {
      title: `Spending tends to be higher in the ${higherHalf} of your cycle`,
      description: `Over the last 90 days, your average daily impulse spending was $${avgSpendFollicular.toFixed(0)} in the first half of your cycle and $${avgSpendLuteal.toFixed(0)} in the second half — a difference of about $${absDiff.toFixed(0)}.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        first_half_days: follicularDays.length,
        second_half_days: lutealDays.length,
        avg_spend_first_half: avgSpendFollicular.toFixed(2),
        avg_spend_second_half: avgSpendLuteal.toFixed(2),
        difference_dollars: absDiff.toFixed(2),
        higher_spending_half: higherHalf,
        lower_spending_half: lowerHalf,
      },
    };
  },
};
