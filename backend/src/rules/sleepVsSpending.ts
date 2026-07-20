import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const SleepVsSpendingRule: InsightRule = {
  id: "sleep_vs_spending",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; sleep_quality: number; impulse_spend: number }>(
      `SELECT
         ds.date::text AS date,
         (ds.summary_data->'sleep'->>'averageQuality')::numeric AS sleep_quality,
         COALESCE(se.total, 0) AS impulse_spend
       FROM daily_summaries ds
       LEFT JOIN (
         SELECT logged_at::date AS day, SUM(amount) AS total
         FROM spending_entries
         WHERE user_id = $1
           AND logged_at >= CURRENT_DATE - 60
           AND category NOT IN (
             'Rent / Mortgage', 'Utilities', 'Home', 'Health', 'health',
             'Subscriptions', 'subscriptions', 'Income / Transfer'
           )
         GROUP BY logged_at::date
       ) se ON se.day = ds.date
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - 60
         AND ds.summary_data->'sleep'->>'averageQuality' IS NOT NULL
         AND COALESCE(se.total, 0) > 0
       ORDER BY ds.date DESC`,
      [userId]
    );

    if (rows.length < 21) return null;

    // Sort by sleep quality to find tertile thresholds
    const sorted = [...rows].sort((a, b) => Number(a.sleep_quality) - Number(b.sleep_quality));
    const bottom33Idx = Math.floor(sorted.length / 3);
    const top33Idx = Math.ceil((sorted.length * 2) / 3);

    const poorThreshold = Number(sorted[bottom33Idx - 1].sleep_quality);
    const goodThreshold = Number(sorted[top33Idx].sleep_quality);

    const poorSleepDays = rows.filter(r => Number(r.sleep_quality) <= poorThreshold);
    const goodSleepDays = rows.filter(r => Number(r.sleep_quality) >= goodThreshold);

    if (poorSleepDays.length < 4 || goodSleepDays.length < 4) return null;

    const avgSpendPoor = poorSleepDays.reduce((s, r) => s + Number(r.impulse_spend), 0) / poorSleepDays.length;
    const avgSpendGood = goodSleepDays.reduce((s, r) => s + Number(r.impulse_spend), 0) / goodSleepDays.length;

    const diff = avgSpendPoor - avgSpendGood;
    if (Math.abs(diff) < 2) return null;

    const effectRatio = Math.abs(diff) / Math.max(avgSpendPoor, avgSpendGood);
    const sampleSize = Math.min(poorSleepDays.length, goodSleepDays.length);
    const { score, label } = calcConfidence(sampleSize, effectRatio);

    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Impulse spending tends to be ${direction} on poor-sleep days`,
      description: `Over the last 60 days, on days with poor sleep quality your average impulse spending was $${avgSpendPoor.toFixed(2)}, compared to $${avgSpendGood.toFixed(2)} on good-sleep days — a difference of $${Math.abs(diff).toFixed(2)}.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        poor_sleep_days: poorSleepDays.length,
        good_sleep_days: goodSleepDays.length,
        avg_spend_poor_sleep: avgSpendPoor.toFixed(2),
        avg_spend_good_sleep: avgSpendGood.toFixed(2),
        spend_difference: Math.abs(diff).toFixed(2),
        direction,
      },
    };
  },
};
