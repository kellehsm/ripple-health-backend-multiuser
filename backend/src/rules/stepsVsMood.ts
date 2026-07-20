import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const StepsVsMoodRule: InsightRule = {
  id: "steps_vs_mood",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; steps: number; avg_mood: number }>(
      `SELECT
         date::text AS date,
         (summary_data->'activity'->>'steps')::numeric AS steps,
         (summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 60
         AND summary_data->'activity'->>'steps' IS NOT NULL
         AND (summary_data->'activity'->>'steps')::numeric > 0
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
       ORDER BY steps ASC`,
      [userId]
    );

    if (rows.length < 18) return null;

    // Top 33% vs bottom 33% by step count
    const cutoff = Math.floor(rows.length / 3);
    const lowStepDays  = rows.slice(0, cutoff);
    const highStepDays = rows.slice(rows.length - cutoff);

    if (lowStepDays.length < 6 || highStepDays.length < 6) return null;

    const avgMoodHigh = highStepDays.reduce((s, r) => s + Number(r.avg_mood), 0) / highStepDays.length;
    const avgMoodLow  = lowStepDays.reduce((s, r) => s + Number(r.avg_mood), 0) / lowStepDays.length;

    const diff = avgMoodHigh - avgMoodLow;
    if (Math.abs(diff) < 0.15) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(
      Math.min(highStepDays.length, lowStepDays.length),
      effectRatio
    );

    const direction = diff > 0 ? "higher" : "lower";

    const avgStepsHigh = highStepDays.reduce((s, r) => s + Number(r.steps), 0) / highStepDays.length;
    const avgStepsLow  = lowStepDays.reduce((s, r) => s + Number(r.steps), 0) / lowStepDays.length;

    return {
      title: `Mood tends to be ${direction} on high-step days`,
      description: `Over the last 60 days, on your highest-step days (avg ${Math.round(avgStepsHigh).toLocaleString()} steps) your mood averaged ${avgMoodHigh.toFixed(1)}/5, compared to ${avgMoodLow.toFixed(1)}/5 on your lowest-step days (avg ${Math.round(avgStepsLow).toLocaleString()} steps).`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        high_step_days: highStepDays.length,
        low_step_days: lowStepDays.length,
        avg_mood_high_steps: avgMoodHigh.toFixed(2),
        avg_mood_low_steps: avgMoodLow.toFixed(2),
        avg_steps_high_group: Math.round(avgStepsHigh),
        avg_steps_low_group: Math.round(avgStepsLow),
        mood_difference: diff.toFixed(2),
        direction,
      },
    };
  },
};
