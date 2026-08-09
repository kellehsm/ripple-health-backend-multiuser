import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { personalThresholds } from "./ruleHelper.js";

// 4-metric question: when ALL of sleep, steps, and mood are high, does glucose
// stay in range more consistently? Measures the combined effect vs each factor alone.
export const QuadGlucoseSleepMoodStepsRule: InsightRule = {
  id: "quad_glucose_sleep_mood_steps",
  type: "combined",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      sleep_min: number; steps: number; avg_mood: number;
      glucose_avg: number; time_in_range: number;
    }>(
      `SELECT
         (summary_data->'sleep'->>'minutes')::numeric          AS sleep_min,
         (summary_data->'activity'->>'steps')::numeric         AS steps,
         (summary_data->'mood'->>'averageScore')::numeric      AS avg_mood,
         (summary_data->'glucose'->>'average')::numeric        AS glucose_avg,
         (summary_data->'glucose'->>'timeInRange')::numeric    AS time_in_range
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND summary_data->'sleep'->>'minutes' IS NOT NULL
         AND summary_data->'activity'->>'steps' IS NOT NULL
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
         AND summary_data->'glucose'->>'average' IS NOT NULL
         AND (summary_data->'glucose'->>'average')::numeric > 0`,
      [userId]
    );

    if (rows.length < 30) return null;

    // Personal high-thresholds for sleep/steps/mood — falls back to the
    // classic 7h/8k/3.5 targets when no baseline exists yet.
    const t = await personalThresholds(userId, [
      { metric: "sleep_secs", kind: "high", fallback: 25200 },
      { metric: "steps",      kind: "high", fallback: 8000 },
      { metric: "mood",       kind: "high", fallback: 3.5 },
    ]);
    const sleepMinCutoff = t.sleep_secs_high.threshold / 60;
    const stepCutoff     = t.steps_high.threshold;
    const moodCutoff     = t.mood_high.threshold;
    const isPersonal = t.sleep_secs_high.usedBaseline && t.steps_high.usedBaseline && t.mood_high.usedBaseline;

    type R = typeof rows[0];
    const goodSleep = (r: R) => Number(r.sleep_min) >= sleepMinCutoff;
    const goodSteps = (r: R) => Number(r.steps) >= stepCutoff;
    const goodMood  = (r: R) => Number(r.avg_mood) >= moodCutoff;
    const glucAvg   = (arr: R[]) => arr.reduce((s, r) => s + Number(r.glucose_avg), 0) / arr.length;
    const tirAvg    = (arr: R[]) => arr.reduce((s, r) => s + Number(r.time_in_range), 0) / arr.length;

    const allGood = rows.filter(r => goodSleep(r) && goodSteps(r) && goodMood(r));
    const allBad  = rows.filter(r => !goodSleep(r) && !goodSteps(r) && !goodMood(r));

    if (allGood.length < 5 || allBad.length < 5) return null;

    const glucGood = glucAvg(allGood);
    const glucBad  = glucAvg(allBad);
    const tirGood  = tirAvg(allGood);
    const tirBad   = tirAvg(allBad);

    const glucDiff = glucBad - glucGood;
    const tirDiff  = tirGood - tirBad;

    if (glucDiff < 5 && tirDiff < 5) return null;

    // Single-factor breakdowns
    const sleepAlone = rows.filter(r => goodSleep(r) && !goodSteps(r) && !goodMood(r));
    const stepsAlone = rows.filter(r => !goodSleep(r) && goodSteps(r) && !goodMood(r));
    const moodAlone  = rows.filter(r => !goodSleep(r) && !goodSteps(r) && goodMood(r));

    const { score, label } = calcConfidence(
      Math.min(allGood.length, allBad.length),
      Math.max(glucDiff / Math.max(glucGood, glucBad), tirDiff / 100)
    );

    const tirLine = tirDiff >= 3
      ? ` Time in range: ${Math.round(tirGood)}% on the best days vs ${Math.round(tirBad)}% on the worst.`
      : "";
    const factorLines = [
      sleepAlone.length >= 3 ? `Sleep alone: ${glucAvg(sleepAlone).toFixed(0)} mg/dL avg` : null,
      stepsAlone.length >= 3 ? `Steps alone: ${glucAvg(stepsAlone).toFixed(0)} mg/dL avg` : null,
      moodAlone.length >= 3 ? `Good mood alone: ${glucAvg(moodAlone).toFixed(0)} mg/dL avg` : null,
    ].filter(Boolean).join("; ");

    const sleepLabel = `${(sleepMinCutoff / 60).toFixed(sleepMinCutoff % 60 === 0 ? 0 : 1)}+ hours`;
    const stepLabel  = `${Math.round(stepCutoff).toLocaleString()}+ steps`;
    const moodLabel  = `${moodCutoff.toFixed(1)}+/5`;
    const personalNote = isPersonal ? " (your typical strong-day cutoffs)" : "";

    return {
      title: "Sleep + movement + good mood together coincide with your steadiest glucose",
      description: `On days when you slept ${sleepLabel}, hit ${stepLabel}, AND had a good mood (${moodLabel})${personalNote}, your average glucose was ${Math.round(glucGood)} mg/dL. When all three were off: ${Math.round(glucBad)} mg/dL — a ${Math.round(glucDiff)} mg/dL gap.${tirLine}${factorLines ? " For context: " + factorLines + "." : ""}`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        days_all_good: allGood.length,
        days_all_bad: allBad.length,
        glucose_all_good: Math.round(glucGood),
        glucose_all_bad: Math.round(glucBad),
        glucose_gap_mg_dl: Math.round(glucDiff),
        time_in_range_all_good: Math.round(tirGood),
        time_in_range_all_bad: Math.round(tirBad),
        glucose_sleep_alone: sleepAlone.length >= 3 ? Math.round(glucAvg(sleepAlone)) : null,
        glucose_steps_alone: stepsAlone.length >= 3 ? Math.round(glucAvg(stepsAlone)) : null,
        glucose_mood_alone: moodAlone.length >= 3 ? Math.round(glucAvg(moodAlone)) : null,
      },
    };
  },
};
