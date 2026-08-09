import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { personalThresholds } from "./ruleHelper.js";

// 4-metric synergy: days with good sleep + steps + water all met produce
// significantly better mood than any single or double combo.
export const QuadSleepStepsWaterMoodRule: InsightRule = {
  id: "quad_sleep_steps_water_mood",
  type: "combined",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      sleep_min: number; steps: number; glasses: number; goal: number; avg_mood: number;
    }>(
      `SELECT
         (summary_data->'sleep'->>'minutes')::numeric     AS sleep_min,
         (summary_data->'activity'->>'steps')::numeric    AS steps,
         (summary_data->'hydration'->>'glasses')::numeric AS glasses,
         COALESCE((summary_data->'hydration'->>'goal')::numeric, 8) AS goal,
         (summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND summary_data->'sleep'->>'minutes' IS NOT NULL
         AND summary_data->'activity'->>'steps' IS NOT NULL
         AND summary_data->'hydration'->>'glasses' IS NOT NULL
         AND summary_data->'mood'->>'averageScore' IS NOT NULL`,
      [userId]
    );

    if (rows.length < 30) return null;

    // Personal cutoffs — sleep + steps from baselines, water goal per-row.
    const t = await personalThresholds(userId, [
      { metric: "sleep_secs", kind: "high", fallback: 25200 },
      { metric: "steps",      kind: "high", fallback: 8000 },
    ]);
    const sleepMinCutoff = t.sleep_secs_high.threshold / 60;
    const stepCutoff     = t.steps_high.threshold;
    const isPersonal     = t.sleep_secs_high.usedBaseline && t.steps_high.usedBaseline;

    type R = typeof rows[0];
    const metSleep = (r: R) => Number(r.sleep_min) >= sleepMinCutoff;
    const metSteps = (r: R) => Number(r.steps) >= stepCutoff;
    const metWater = (r: R) => Number(r.glasses) >= Number(r.goal);
    const moodOf   = (r: R) => Number(r.avg_mood);
    const avg      = (arr: R[]) => arr.reduce((s, r) => s + moodOf(r), 0) / arr.length;

    const allThree   = rows.filter(r => metSleep(r) && metSteps(r) && metWater(r));
    const none       = rows.filter(r => !metSleep(r) && !metSteps(r) && !metWater(r));
    const sleepOnly  = rows.filter(r => metSleep(r) && !metSteps(r) && !metWater(r));
    const stepsOnly  = rows.filter(r => !metSleep(r) && metSteps(r) && !metWater(r));
    const waterOnly  = rows.filter(r => !metSleep(r) && !metSteps(r) && metWater(r));
    const anyTwo     = rows.filter(r => [metSleep(r), metSteps(r), metWater(r)].filter(Boolean).length === 2);

    if (allThree.length < 5 || none.length < 5) return null;

    const moodAllThree = avg(allThree);
    const moodNone     = avg(none);
    const diff         = moodAllThree - moodNone;
    if (diff < 0.4) return null;

    const moodAnyTwo   = anyTwo.length >= 5 ? avg(anyTwo) : null;
    const moodSleepOnly = sleepOnly.length >= 3 ? avg(sleepOnly) : null;
    const moodStepsOnly = stepsOnly.length >= 3 ? avg(stepsOnly) : null;
    const moodWaterOnly = waterOnly.length >= 3 ? avg(waterOnly) : null;

    const { score, label } = calcConfidence(Math.min(allThree.length, none.length), diff / 4);

    const twoNote = moodAnyTwo != null
      ? ` Hitting any two of the three: ${moodAnyTwo.toFixed(1)}/5.`
      : "";
    const oneNotes = [
      moodSleepOnly != null ? `Sleep only: ${moodSleepOnly.toFixed(1)}` : null,
      moodStepsOnly != null ? `Steps only: ${moodStepsOnly.toFixed(1)}` : null,
      moodWaterOnly != null ? `Water only: ${moodWaterOnly.toFixed(1)}` : null,
    ].filter(Boolean).join(", ");

    const sleepLabel = `${(sleepMinCutoff / 60).toFixed(sleepMinCutoff % 60 === 0 ? 0 : 1)}+ hours of sleep`;
    const stepLabel  = `${Math.round(stepCutoff).toLocaleString()}+ steps`;
    const personalNote = isPersonal ? " (your typical strong-day cutoffs)" : "";

    return {
      title: "Sleep + steps + water together coincide with your best mood days",
      description: `When you hit all three — ${sleepLabel}, ${stepLabel}, and your water goal${personalNote} — your mood averaged ${moodAllThree.toFixed(1)}/5. Missing all three: ${moodNone.toFixed(1)}/5. That's a ${diff.toFixed(1)}-point difference across ${allThree.length} triple-goal days.${twoNote}${oneNotes ? " Single habits: " + oneNotes + "." : ""}`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        days_all_three: allThree.length,
        days_any_two: anyTwo.length,
        days_none: none.length,
        mood_all_three: moodAllThree.toFixed(2),
        mood_any_two: moodAnyTwo?.toFixed(2) ?? null,
        mood_none: moodNone.toFixed(2),
        mood_sleep_only: moodSleepOnly?.toFixed(2) ?? null,
        mood_steps_only: moodStepsOnly?.toFixed(2) ?? null,
        mood_water_only: moodWaterOnly?.toFixed(2) ?? null,
        mood_lift: diff.toFixed(2),
      },
    };
  },
};
