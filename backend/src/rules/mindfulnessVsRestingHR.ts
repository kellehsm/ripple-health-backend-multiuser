import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const MindfulnessVsRestingHRRule: InsightRule = {
  id: "mindfulness_vs_resting_hr",
  type: "mindfulness",
  minDays: 20,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; resting_hr: number; had_mindfulness: boolean }>(
      `WITH mindfulness_days AS (
         SELECT DATE(ml.logged_at) AS day
         FROM metric_logs ml
         JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1 AND m.name = 'mindfulness'
           AND ml.logged_at >= CURRENT_DATE - 60
         GROUP BY DATE(ml.logged_at)
       ),
       hr_days AS (
         SELECT
           DATE(recorded_at) AS date,
           MIN(bpm) AS resting_hr
         FROM heart_rate_readings
         WHERE user_id = $1
           AND recorded_at >= CURRENT_DATE - 60
         GROUP BY DATE(recorded_at)
       )
       SELECT
         hd.date::text,
         hd.resting_hr,
         (md.day IS NOT NULL) AS had_mindfulness
       FROM hr_days hd
       LEFT JOIN mindfulness_days md ON md.day = hd.date`,
      [userId]
    );

    const mindfulnessDays   = rows.filter(r => r.had_mindfulness);
    const noMindfulnessDays = rows.filter(r => !r.had_mindfulness);

    if (mindfulnessDays.length < 5 || noMindfulnessDays.length < 5) return null;

    const avgHrMindfulness   = mindfulnessDays.reduce((s, r) => s + Number(r.resting_hr), 0) / mindfulnessDays.length;
    const avgHrNoMindfulness = noMindfulnessDays.reduce((s, r) => s + Number(r.resting_hr), 0) / noMindfulnessDays.length;

    // positive diff = mindfulness days have lower HR (better)
    const diff = avgHrNoMindfulness - avgHrMindfulness;
    if (Math.abs(diff) < 3) return null;

    const direction = diff > 0 ? "lower" : "higher";
    const effectRatio = Math.abs(diff) / 20;
    const { score, label } = calcConfidence(
      Math.min(mindfulnessDays.length, noMindfulnessDays.length),
      effectRatio
    );

    return {
      title: `Resting heart rate tends to be ${direction} on mindfulness days`,
      description: `Over the last 60 days, on the ${mindfulnessDays.length} days with a mindfulness session your average resting heart rate (lowest reading of the day) was ${avgHrMindfulness.toFixed(0)} bpm, compared to ${avgHrNoMindfulness.toFixed(0)} bpm on the ${noMindfulnessDays.length} days without — a difference of ${Math.abs(diff).toFixed(0)} bpm.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        mindfulness_days: mindfulnessDays.length,
        no_mindfulness_days: noMindfulnessDays.length,
        avg_resting_hr_mindfulness: avgHrMindfulness.toFixed(1),
        avg_resting_hr_no_mindfulness: avgHrNoMindfulness.toFixed(1),
        bpm_difference: Math.abs(diff).toFixed(1),
        direction,
      },
    };
  },
};
