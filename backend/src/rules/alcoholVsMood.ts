import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const AlcoholVsMoodRule: InsightRule = {
  id: "alcohol_vs_mood",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    // Get mood for each day, tagged with whether the PREVIOUS day had any alcohol
    const rows = await query<{ date: string; avg_mood: number; prev_day_had_alcohol: boolean }>(
      `WITH alcohol_days AS (
         SELECT DISTINCT logged_at::date AS day
         FROM substance_logs
         WHERE user_id = $1
           AND substance_type = 'alcohol'
           AND logged_at >= CURRENT_DATE - 61
       ),
       mood_days AS (
         SELECT
           date,
           (summary_data->'mood'->>'averageScore')::numeric AS avg_mood
         FROM daily_summaries
         WHERE user_id = $1
           AND date >= CURRENT_DATE - 60
           AND summary_data->'mood'->>'averageScore' IS NOT NULL
       )
       SELECT
         m.date::text AS date,
         m.avg_mood,
         CASE WHEN a.day IS NOT NULL THEN true ELSE false END AS prev_day_had_alcohol
       FROM mood_days m
       LEFT JOIN alcohol_days a ON a.day = m.date - INTERVAL '1 day'
       ORDER BY m.date DESC`,
      [userId]
    );

    if (rows.length < 21) return null;

    const afterAlcoholDays = rows.filter(r => r.prev_day_had_alcohol);
    const afterNoAlcoholDays = rows.filter(r => !r.prev_day_had_alcohol);

    if (afterAlcoholDays.length < 4 || afterNoAlcoholDays.length < 8) return null;

    const avgMoodAfterAlcohol = afterAlcoholDays.reduce((s, r) => s + Number(r.avg_mood), 0) / afterAlcoholDays.length;
    const avgMoodAfterNone = afterNoAlcoholDays.reduce((s, r) => s + Number(r.avg_mood), 0) / afterNoAlcoholDays.length;

    const diff = avgMoodAfterAlcohol - avgMoodAfterNone;
    if (Math.abs(diff) < 0.2) return null;

    const effectRatio = Math.abs(diff) / 4; // mood scale is 1-5
    const sampleSize = Math.min(afterAlcoholDays.length, afterNoAlcoholDays.length);
    const { score, label } = calcConfidence(sampleSize, effectRatio);

    // diff = after-alcohol - after-none: if negative, mood tends to be lower the day after drinking
    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Mood tends to be ${direction} the day after drinking`,
      description: `Over the last 60 days, on days following alcohol consumption your average mood was ${avgMoodAfterAlcohol.toFixed(1)}/5, compared to ${avgMoodAfterNone.toFixed(1)}/5 on days after no drinking — a difference of ${Math.abs(diff).toFixed(2)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        days_after_alcohol: afterAlcoholDays.length,
        days_after_no_alcohol: afterNoAlcoholDays.length,
        avg_mood_after_alcohol: avgMoodAfterAlcohol.toFixed(2),
        avg_mood_after_no_alcohol: avgMoodAfterNone.toFixed(2),
        mood_difference: Math.abs(diff).toFixed(2),
        direction,
      },
    };
  },
};
