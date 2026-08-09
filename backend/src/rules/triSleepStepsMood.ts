import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { personalThresholds } from "./ruleHelper.js";

// Finds whether the COMBINATION of good sleep + high steps drives better mood
// than either alone — a genuine 3-way interaction.
export const TriSleepStepsMoodRule: InsightRule = {
  id: "tri_sleep_steps_mood",
  type: "combined",
  minDays: 28,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      sleep_min: number; steps: number; avg_mood: number;
    }>(
      `SELECT
         (summary_data->'sleep'->>'minutes')::numeric   AS sleep_min,
         (summary_data->'activity'->>'steps')::numeric  AS steps,
         (summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND summary_data->'sleep'->>'minutes' IS NOT NULL
         AND summary_data->'activity'->>'steps' IS NOT NULL
         AND summary_data->'mood'->>'averageScore' IS NOT NULL`,
      [userId]
    );

    if (rows.length < 28) return null;

    // Personal thresholds — user's own p67 for sleep/steps if a baseline
    // exists, otherwise the classic 7h/8k cutoffs. Sleep baseline is in
    // seconds so we convert to minutes to match the JSON column.
    const t = await personalThresholds(userId, [
      { metric: "sleep_secs", kind: "high", fallback: 25200 },
      { metric: "steps",      kind: "high", fallback: 8000 },
    ]);
    const sleepMinCutoff = t.sleep_secs_high.threshold / 60;
    const stepCutoff     = t.steps_high.threshold;
    const isPersonal     = t.sleep_secs_high.usedBaseline && t.steps_high.usedBaseline;

    const goodSleep = (r: typeof rows[0]) => Number(r.sleep_min) >= sleepMinCutoff;
    const highSteps = (r: typeof rows[0]) => Number(r.steps) >= stepCutoff;
    const mood     = (r: typeof rows[0]) => Number(r.avg_mood);

    const both    = rows.filter(r => goodSleep(r) && highSteps(r));
    const sleepOnly = rows.filter(r => goodSleep(r) && !highSteps(r));
    const stepsOnly = rows.filter(r => !goodSleep(r) && highSteps(r));
    const neither  = rows.filter(r => !goodSleep(r) && !highSteps(r));

    if (both.length < 5 || neither.length < 5) return null;

    const avg = (arr: typeof rows) =>
      arr.reduce((s, r) => s + mood(r), 0) / arr.length;

    const moodBoth    = avg(both);
    const moodNeither = avg(neither);
    const moodSleepOnly = sleepOnly.length >= 3 ? avg(sleepOnly) : null;
    const moodStepsOnly = stepsOnly.length >= 3 ? avg(stepsOnly) : null;

    const gainBoth = moodBoth - moodNeither;
    if (gainBoth < 0.4) return null;

    // Interaction: is "both" better than would be expected from individual contributions?
    const gainSleep = moodSleepOnly != null ? moodSleepOnly - moodNeither : gainBoth / 2;
    const gainSteps = moodStepsOnly != null ? moodStepsOnly - moodNeither : gainBoth / 2;
    const expectedAdditive = moodNeither + gainSleep + gainSteps;
    const interaction = moodBoth - expectedAdditive;

    const { score, label } = calcConfidence(Math.min(both.length, neither.length), gainBoth / 4);

    const bothFmt    = moodBoth.toFixed(1);
    const neitherFmt = moodNeither.toFixed(1);

    const interactionNote = interaction > 0.15
      ? ` The two together appear to amplify each other — the mood boost is ${interaction.toFixed(1)} points above what either habit alone would predict.`
      : "";

    // Describe cutoffs the way the user's own data defines them, not with
    // a canned "7h + 8k" line that may not match their own normal.
    const sleepLabel = `${(sleepMinCutoff / 60).toFixed(sleepMinCutoff % 60 === 0 ? 0 : 1)}+ hours`;
    const stepLabel  = `${Math.round(stepCutoff).toLocaleString()}+ steps`;
    const personalNote = isPersonal ? " (your typical strong-day cutoffs)" : "";

    return {
      title: "Sleep + steps together coincide with your best mood days",
      description: `On days when you both slept ${sleepLabel} and hit ${stepLabel}${personalNote}, your average mood was ${bothFmt}/5 — versus ${neitherFmt}/5 on days with neither.${interactionNote} (${both.length} days with both vs ${neither.length} days with neither, over the last 90 days.)`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        days_both: both.length,
        days_neither: neither.length,
        days_sleep_only: sleepOnly.length,
        days_steps_only: stepsOnly.length,
        mood_both: bothFmt,
        mood_neither: neitherFmt,
        mood_sleep_only: moodSleepOnly?.toFixed(1) ?? null,
        mood_steps_only: moodStepsOnly?.toFixed(1) ?? null,
        mood_gain_combined: gainBoth.toFixed(2),
        interaction_above_additive: interaction.toFixed(2),
        sleep_min_cutoff: Math.round(sleepMinCutoff),
        step_cutoff: Math.round(stepCutoff),
        used_baseline: isPersonal,
      },
    };
  },
};
