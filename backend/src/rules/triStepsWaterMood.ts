import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Tests whether hitting BOTH step goal AND hydration goal produces better mood
// than the expected additive sum of each alone — a genuine interaction.
export const TriStepsWaterMoodRule: InsightRule = {
  id: "tri_steps_water_mood",
  type: "combined",
  minDays: 28,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      steps: number; glasses: number; goal: number; avg_mood: number;
    }>(
      `SELECT
         (summary_data->'activity'->>'steps')::numeric     AS steps,
         (summary_data->'hydration'->>'glasses')::numeric  AS glasses,
         COALESCE((summary_data->'hydration'->>'goal')::numeric, 8) AS goal,
         (summary_data->'mood'->>'averageScore')::numeric  AS avg_mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND summary_data->'activity'->>'steps' IS NOT NULL
         AND summary_data->'hydration'->>'glasses' IS NOT NULL
         AND summary_data->'mood'->>'averageScore' IS NOT NULL`,
      [userId]
    );

    if (rows.length < 28) return null;

    const metSteps  = (r: typeof rows[0]) => Number(r.steps) >= 8000;
    const metWater  = (r: typeof rows[0]) => Number(r.glasses) >= Number(r.goal);
    const mood      = (r: typeof rows[0]) => Number(r.avg_mood);
    const avg       = (arr: typeof rows) => arr.reduce((s, r) => s + mood(r), 0) / arr.length;

    const both      = rows.filter(r => metSteps(r) && metWater(r));
    const stepsOnly = rows.filter(r => metSteps(r) && !metWater(r));
    const waterOnly = rows.filter(r => !metSteps(r) && metWater(r));
    const neither   = rows.filter(r => !metSteps(r) && !metWater(r));

    if (both.length < 5 || neither.length < 5) return null;

    const moodBoth    = avg(both);
    const moodNeither = avg(neither);
    const diff = moodBoth - moodNeither;

    if (diff < 0.3) return null;

    // Measure true interaction: is "both" better than additive prediction?
    const moodStepsOnly = stepsOnly.length >= 3 ? avg(stepsOnly) : moodNeither + diff / 2;
    const moodWaterOnly = waterOnly.length >= 3 ? avg(waterOnly) : moodNeither + diff / 2;
    const additivePred  = moodNeither + (moodStepsOnly - moodNeither) + (moodWaterOnly - moodNeither);
    const interaction   = moodBoth - additivePred;

    const { score, label } = calcConfidence(Math.min(both.length, neither.length), diff / 4);

    const interactionNote = interaction > 0.1
      ? ` The combination appears to be ${interaction.toFixed(1)} mood points stronger than the two habits would predict separately — a genuine synergy.`
      : "";

    return {
      title: "Hitting steps + water together lifts your mood more than either alone",
      description: `On days you hit 8,000+ steps AND your water goal, your mood averaged ${moodBoth.toFixed(1)}/5 — vs ${moodNeither.toFixed(1)}/5 when you missed both. Steps alone: ${moodStepsOnly.toFixed(1)}/5. Water alone: ${moodWaterOnly.toFixed(1)}/5.${interactionNote}`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        days_both: both.length,
        days_steps_only: stepsOnly.length,
        days_water_only: waterOnly.length,
        days_neither: neither.length,
        mood_both: moodBoth.toFixed(2),
        mood_steps_only: moodStepsOnly.toFixed(2),
        mood_water_only: moodWaterOnly.toFixed(2),
        mood_neither: moodNeither.toFixed(2),
        interaction_above_additive: interaction.toFixed(2),
      },
    };
  },
};
