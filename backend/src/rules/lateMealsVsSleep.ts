import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const LateMealsVsSleepRule: InsightRule = {
  id: "late_meals_vs_sleep",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    // Find days with at least one meal logged after 9 PM UTC (hour >= 21)
    const lateMealDays = await query<{ date: string }>(
      `SELECT DISTINCT DATE(logged_at)::text AS date
       FROM meals
       WHERE user_id = $1
         AND logged_at >= CURRENT_DATE - 60
         AND EXTRACT(HOUR FROM logged_at) >= 21
       ORDER BY date DESC`,
      [userId]
    );

    // Find days with NO meals after 9 PM UTC (early-meal days)
    // = days that have meals but none after 9 PM
    const allMealDays = await query<{ date: string }>(
      `SELECT DISTINCT DATE(logged_at)::text AS date
       FROM meals
       WHERE user_id = $1
         AND logged_at >= CURRENT_DATE - 60
       ORDER BY date DESC`,
      [userId]
    );

    const lateDateSet = new Set(lateMealDays.map(r => r.date));
    const earlyMealDates = allMealDays
      .map(r => r.date)
      .filter(d => !lateDateSet.has(d));

    if (lateDateSet.size < 5 || earlyMealDates.length < 5) return null;

    // Get sleep quality from sleep_sessions — use AVG quality_score for sessions
    // ending on the same date as the meal day
    const getSleepQuality = async (dates: string[]): Promise<Array<{ date: string; quality: number }>> => {
      if (dates.length === 0) return [];
      const placeholders = dates.map((_, i) => `$${i + 2}`).join(", ");
      return query<{ date: string; quality: number }>(
        `SELECT
           DATE(end_time)::text AS date,
           AVG(quality_score)::numeric AS quality
         FROM sleep_sessions
         WHERE user_id = $1
           AND quality_score IS NOT NULL
           AND DATE(end_time) = ANY(ARRAY[${placeholders}]::date[])
         GROUP BY DATE(end_time)`,
        [userId, ...dates]
      );
    };

    const lateSleepData  = await getSleepQuality([...lateDateSet]);
    const earlySleepData = await getSleepQuality(earlyMealDates);

    if (lateSleepData.length < 5 || earlySleepData.length < 5) return null;

    const avgQualityLate  = lateSleepData.reduce((s, r) => s + Number(r.quality), 0) / lateSleepData.length;
    const avgQualityEarly = earlySleepData.reduce((s, r) => s + Number(r.quality), 0) / earlySleepData.length;

    // diff = early - late; positive means earlier meals → better sleep
    const diff = avgQualityEarly - avgQualityLate;
    if (Math.abs(diff) < 0.2) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(
      Math.min(lateSleepData.length, earlySleepData.length),
      effectRatio
    );

    // direction describes sleep quality on late-meal days vs early-meal days
    const direction = diff > 0 ? "lower" : "higher";

    return {
      title: `Sleep quality tends to be ${direction} on days with late meals`,
      description: `Over the last 60 days, on the ${lateSleepData.length} days with meals logged after 9 PM your average sleep quality was ${avgQualityLate.toFixed(1)}, compared to ${avgQualityEarly.toFixed(1)} on the ${earlySleepData.length} days without late-evening meals — a difference of ${Math.abs(diff).toFixed(1)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: lateSleepData.length + earlySleepData.length,
      supportingData: {
        late_meal_days_with_sleep: lateSleepData.length,
        early_meal_days_with_sleep: earlySleepData.length,
        avg_sleep_quality_late_meals: avgQualityLate.toFixed(2),
        avg_sleep_quality_early_meals: avgQualityEarly.toFixed(2),
        quality_difference: diff.toFixed(2),
        direction,
      },
    };
  },
};
