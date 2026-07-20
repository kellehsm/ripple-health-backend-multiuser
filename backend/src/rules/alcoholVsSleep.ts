import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const AlcoholVsSleepRule: InsightRule = {
  id: "alcohol_vs_sleep",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    // Get all days with sleep data in the last 60 days
    const rows = await query<{ day: string; avg_sleep_quality: number; had_alcohol: boolean }>(
      `SELECT
         s.day::text AS day,
         s.avg_sleep_quality,
         CASE WHEN a.day IS NOT NULL THEN true ELSE false END AS had_alcohol
       FROM (
         SELECT DATE(end_time) AS day, AVG(quality_score) AS avg_sleep_quality
         FROM sleep_sessions
         WHERE user_id = $1
           AND end_time >= CURRENT_DATE - 60
         GROUP BY DATE(end_time)
       ) s
       LEFT JOIN (
         SELECT DISTINCT logged_at::date AS day
         FROM substance_logs
         WHERE user_id = $1
           AND substance_type = 'alcohol'
           AND volume_ml > 0
           AND logged_at >= CURRENT_DATE - 60
       ) a ON a.day = s.day
       ORDER BY s.day DESC`,
      [userId]
    );

    if (rows.length < 21) return null;

    const alcoholDays = rows.filter(r => r.had_alcohol);
    const noAlcoholDays = rows.filter(r => !r.had_alcohol);

    if (alcoholDays.length < 5 || noAlcoholDays.length < 5) return null;

    const avgSleepAlcohol = alcoholDays.reduce((s, r) => s + Number(r.avg_sleep_quality), 0) / alcoholDays.length;
    const avgSleepNoAlcohol = noAlcoholDays.reduce((s, r) => s + Number(r.avg_sleep_quality), 0) / noAlcoholDays.length;

    const diff = avgSleepAlcohol - avgSleepNoAlcohol;
    if (Math.abs(diff) < 0.15) return null;

    const effectRatio = Math.abs(diff) / 4; // sleep quality scale is 1-5
    const sampleSize = Math.min(alcoholDays.length, noAlcoholDays.length);
    const { score, label } = calcConfidence(sampleSize, effectRatio);

    // diff = alcohol - no-alcohol: if negative, sleep is lower after drinking
    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Sleep quality tends to be ${direction} on nights after drinking`,
      description: `Over the last 60 days, on nights when you had alcohol your average sleep quality was ${avgSleepAlcohol.toFixed(1)}/5, compared to ${avgSleepNoAlcohol.toFixed(1)}/5 on alcohol-free nights — a difference of ${Math.abs(diff).toFixed(2)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        alcohol_nights: alcoholDays.length,
        no_alcohol_nights: noAlcoholDays.length,
        avg_sleep_quality_alcohol: avgSleepAlcohol.toFixed(2),
        avg_sleep_quality_no_alcohol: avgSleepNoAlcohol.toFixed(2),
        quality_difference: Math.abs(diff).toFixed(2),
        direction,
      },
    };
  },
};
