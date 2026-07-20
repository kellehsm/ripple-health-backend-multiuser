import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const MindfulnessVsSpendingRule: InsightRule = {
  id: "mindfulness_vs_spending",
  type: "mindfulness",
  minDays: 20,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ total_spend: string; had_mindfulness: boolean }>(
      `WITH mindfulness_days AS (
         SELECT DATE(ml.logged_at) AS day
         FROM metric_logs ml
         JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1 AND m.name = 'mindfulness'
           AND ml.logged_at >= CURRENT_DATE - 60
         GROUP BY DATE(ml.logged_at)
       ),
       spend_days AS (
         SELECT
           logged_at::date AS date,
           SUM(amount) AS total_spend
         FROM spending_entries
         WHERE user_id = $1
           AND logged_at >= CURRENT_DATE - 60
         GROUP BY logged_at::date
       )
       SELECT
         sd.total_spend::text,
         (md.day IS NOT NULL) AS had_mindfulness
       FROM spend_days sd
       LEFT JOIN mindfulness_days md ON md.day = sd.date`,
      [userId]
    );

    const mindfulnessDays   = rows.filter(r => r.had_mindfulness);
    const noMindfulnessDays = rows.filter(r => !r.had_mindfulness);

    if (mindfulnessDays.length < 5 || noMindfulnessDays.length < 5) return null;

    const avgSpendMindfulness   = mindfulnessDays.reduce((s, r) => s + Number(r.total_spend), 0) / mindfulnessDays.length;
    const avgSpendNoMindfulness = noMindfulnessDays.reduce((s, r) => s + Number(r.total_spend), 0) / noMindfulnessDays.length;

    // positive diff = mindfulness days have lower spending
    const diff = avgSpendNoMindfulness - avgSpendMindfulness;
    if (Math.abs(diff) < 3) return null;

    const direction = diff > 0 ? "lower" : "higher";
    const effectRatio = Math.abs(diff) / 50;
    const { score, label } = calcConfidence(
      Math.min(mindfulnessDays.length, noMindfulnessDays.length),
      effectRatio
    );

    return {
      title: `Spending tends to be ${direction} on days you practice mindfulness`,
      description: `Over the last 60 days, on the ${mindfulnessDays.length} days with a mindfulness session your average daily spending was $${avgSpendMindfulness.toFixed(2)}, compared to $${avgSpendNoMindfulness.toFixed(2)} on the ${noMindfulnessDays.length} days without — a difference of $${Math.abs(diff).toFixed(2)}.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        mindfulness_days: mindfulnessDays.length,
        no_mindfulness_days: noMindfulnessDays.length,
        avg_spend_mindfulness: avgSpendMindfulness.toFixed(2),
        avg_spend_no_mindfulness: avgSpendNoMindfulness.toFixed(2),
        difference_dollars: Math.abs(diff).toFixed(2),
        direction,
      },
    };
  },
};
