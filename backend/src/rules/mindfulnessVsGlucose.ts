import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const MindfulnessVsGlucoseRule: InsightRule = {
  id: "mindfulness_vs_glucose",
  type: "mindfulness",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ avg_glucose: string; had_mindfulness: boolean }>(
      `WITH mindfulness_days AS (
         SELECT DATE(ml.logged_at) AS day
         FROM metric_logs ml
         JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1 AND m.name = 'mindfulness'
           AND ml.logged_at >= CURRENT_DATE - 60
         GROUP BY DATE(ml.logged_at)
       )
       SELECT
         (ds.summary_data->'glucose'->>'average')::numeric AS avg_glucose,
         (md.day IS NOT NULL) AS had_mindfulness
       FROM daily_summaries ds
       LEFT JOIN mindfulness_days md ON md.day = ds.date
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - 60
         AND ds.summary_data->'glucose'->>'average' IS NOT NULL
         AND (ds.summary_data->'glucose'->>'average')::numeric > 50`,
      [userId]
    );

    const mindfulnessDays   = rows.filter(r => r.had_mindfulness);
    const noMindfulnessDays = rows.filter(r => !r.had_mindfulness);

    if (mindfulnessDays.length < 5 || noMindfulnessDays.length < 5) return null;

    const avgGlucoseMindfulness   = mindfulnessDays.reduce((s, r) => s + Number(r.avg_glucose), 0) / mindfulnessDays.length;
    const avgGlucoseNoMindfulness = noMindfulnessDays.reduce((s, r) => s + Number(r.avg_glucose), 0) / noMindfulnessDays.length;

    // positive diff = mindfulness days have lower glucose (better)
    const diff = avgGlucoseNoMindfulness - avgGlucoseMindfulness;
    if (Math.abs(diff) < 5) return null;

    const direction = diff > 0 ? "lower" : "higher";
    const effectRatio = Math.abs(diff) / 30;
    const { score, label } = calcConfidence(
      Math.min(mindfulnessDays.length, noMindfulnessDays.length),
      effectRatio
    );

    return {
      title: `Glucose tends to be ${direction} on days you practice mindfulness`,
      description: `Over the last 60 days, on the ${mindfulnessDays.length} days with a mindfulness session your average glucose was ${avgGlucoseMindfulness.toFixed(0)} mg/dL, compared to ${avgGlucoseNoMindfulness.toFixed(0)} mg/dL on the ${noMindfulnessDays.length} days without — a difference of ${Math.abs(diff).toFixed(0)} mg/dL.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        mindfulness_days: mindfulnessDays.length,
        no_mindfulness_days: noMindfulnessDays.length,
        avg_glucose_mindfulness: avgGlucoseMindfulness.toFixed(0),
        avg_glucose_no_mindfulness: avgGlucoseNoMindfulness.toFixed(0),
        difference_mg_dl: Math.abs(diff).toFixed(0),
        direction,
      },
    };
  },
};
