import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const MealSkippingVsMoodRule: InsightRule = {
  id: "meal_skipping_vs_mood",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; meal_count: number; avg_mood: number }>(
      `SELECT
         date::text AS date,
         (summary_data->'nutrition'->>'mealCount')::numeric AS meal_count,
         (summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 60
         AND summary_data->'nutrition'->>'mealCount' IS NOT NULL
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
       ORDER BY date DESC`,
      [userId]
    );

    if (rows.length < 12) return null;

    // Low meal day = mealCount ≤ 1, normal day = mealCount ≥ 3
    const lowMealDays    = rows.filter(r => Number(r.meal_count) <= 1);
    const normalMealDays = rows.filter(r => Number(r.meal_count) >= 3);

    if (lowMealDays.length < 4 || normalMealDays.length < 8) return null;

    const avgMoodLow    = lowMealDays.reduce((s, r) => s + Number(r.avg_mood), 0) / lowMealDays.length;
    const avgMoodNormal = normalMealDays.reduce((s, r) => s + Number(r.avg_mood), 0) / normalMealDays.length;

    // diff > 0 means normal meals → better mood
    const diff = avgMoodNormal - avgMoodLow;
    if (Math.abs(diff) < 0.2) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(
      Math.min(lowMealDays.length, normalMealDays.length),
      effectRatio
    );

    // title focuses on the "fewer meals" group compared to normal
    const direction = diff > 0 ? "lower" : "higher";

    return {
      title: `Mood tends to be ${direction} on days with fewer meals logged`,
      description: `Over the last 60 days, on the ${lowMealDays.length} days with 0–1 meals logged your average mood was ${avgMoodLow.toFixed(1)}/5, compared to ${avgMoodNormal.toFixed(1)}/5 on the ${normalMealDays.length} days with 3+ meals — a difference of ${Math.abs(diff).toFixed(1)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        low_meal_days: lowMealDays.length,
        normal_meal_days: normalMealDays.length,
        avg_mood_low_meals: avgMoodLow.toFixed(2),
        avg_mood_normal_meals: avgMoodNormal.toFixed(2),
        mood_difference: diff.toFixed(2),
        direction,
      },
    };
  },
};
