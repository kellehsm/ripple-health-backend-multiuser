import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const WaterVsMoodRule: InsightRule = {
  id: "water_vs_mood",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; glasses: number; avg_mood: number }>(
      `SELECT
         date::text AS date,
         (summary_data->'hydration'->>'glasses')::numeric AS glasses,
         (summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 60
         AND summary_data->'hydration'->>'glasses' IS NOT NULL
         AND (summary_data->'hydration'->>'glasses')::numeric > 0
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
       ORDER BY glasses ASC`,
      [userId]
    );

    if (rows.length < 15) return null;

    // Top 33% vs bottom 33% by hydration
    const cutoff = Math.floor(rows.length / 3);
    const lowHydrationDays  = rows.slice(0, cutoff);
    const highHydrationDays = rows.slice(rows.length - cutoff);

    if (lowHydrationDays.length < 5 || highHydrationDays.length < 5) return null;

    const avgMoodHigh = highHydrationDays.reduce((s, r) => s + Number(r.avg_mood), 0) / highHydrationDays.length;
    const avgMoodLow  = lowHydrationDays.reduce((s, r) => s + Number(r.avg_mood), 0) / lowHydrationDays.length;

    const diff = avgMoodHigh - avgMoodLow;
    if (Math.abs(diff) < 0.15) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(
      Math.min(highHydrationDays.length, lowHydrationDays.length),
      effectRatio
    );

    const direction = diff > 0 ? "higher" : "lower";

    const avgGlassesHigh = highHydrationDays.reduce((s, r) => s + Number(r.glasses), 0) / highHydrationDays.length;
    const avgGlassesLow  = lowHydrationDays.reduce((s, r) => s + Number(r.glasses), 0) / lowHydrationDays.length;

    return {
      title: `Mood tends to be ${direction} on well-hydrated days`,
      description: `Over the last 60 days, on your most hydrated days (avg ${avgGlassesHigh.toFixed(1)} glasses) your mood averaged ${avgMoodHigh.toFixed(1)}/5, compared to ${avgMoodLow.toFixed(1)}/5 on your least hydrated days (avg ${avgGlassesLow.toFixed(1)} glasses).`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        high_hydration_days: highHydrationDays.length,
        low_hydration_days: lowHydrationDays.length,
        avg_mood_high_hydration: avgMoodHigh.toFixed(2),
        avg_mood_low_hydration: avgMoodLow.toFixed(2),
        avg_glasses_high_group: avgGlassesHigh.toFixed(1),
        avg_glasses_low_group: avgGlassesLow.toFixed(1),
        mood_difference: diff.toFixed(2),
        direction,
      },
    };
  },
};
