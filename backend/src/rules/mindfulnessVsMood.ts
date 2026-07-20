import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const MindfulnessVsMoodRule: InsightRule = {
  id: "mindfulness_vs_mood",
  type: "mindfulness",
  minDays: 20,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ mood_score: string; had_mindfulness: boolean }>(
      `WITH mindfulness_days AS (
         SELECT DATE(ml.logged_at) AS day
         FROM metric_logs ml
         JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1 AND m.name = 'mindfulness'
           AND ml.logged_at >= CURRENT_DATE - 60
         GROUP BY DATE(ml.logged_at)
       )
       SELECT
         (ds.summary_data->'mood'->>'averageScore')::numeric AS mood_score,
         (md.day IS NOT NULL) AS had_mindfulness
       FROM daily_summaries ds
       LEFT JOIN mindfulness_days md ON md.day = ds.date
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - 60
         AND ds.summary_data->'mood'->>'averageScore' IS NOT NULL`,
      [userId]
    );

    const mindfulnessDays   = rows.filter(r => r.had_mindfulness);
    const noMindfulnessDays = rows.filter(r => !r.had_mindfulness);

    if (mindfulnessDays.length < 5 || noMindfulnessDays.length < 5) return null;

    const avgMoodMindfulness   = mindfulnessDays.reduce((s, r) => s + Number(r.mood_score), 0) / mindfulnessDays.length;
    const avgMoodNoMindfulness = noMindfulnessDays.reduce((s, r) => s + Number(r.mood_score), 0) / noMindfulnessDays.length;

    const diff = avgMoodMindfulness - avgMoodNoMindfulness;
    if (Math.abs(diff) < 0.25) return null;

    const direction = diff > 0 ? "higher" : "lower";
    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(
      Math.min(mindfulnessDays.length, noMindfulnessDays.length),
      effectRatio
    );

    return {
      title: `Mood tends to be ${direction} on days you practice mindfulness`,
      description: `Over the last 60 days, on the ${mindfulnessDays.length} days with a mindfulness session your average mood was ${avgMoodMindfulness.toFixed(1)}/5, compared to ${avgMoodNoMindfulness.toFixed(1)}/5 on the ${noMindfulnessDays.length} days without — a difference of ${Math.abs(diff).toFixed(2)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        mindfulness_days: mindfulnessDays.length,
        no_mindfulness_days: noMindfulnessDays.length,
        avg_mood_mindfulness: avgMoodMindfulness.toFixed(2),
        avg_mood_no_mindfulness: avgMoodNoMindfulness.toFixed(2),
        mood_difference: diff.toFixed(2),
        direction,
      },
    };
  },
};
