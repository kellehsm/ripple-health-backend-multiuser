import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { LOOKBACK_DAYS, tertileSplit, avgOf } from "./ruleHelper.js";

export const SleepVsStepsRule: InsightRule = {
  id: "sleep_vs_steps",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; sleep_quality: number; steps: number }>(
      `SELECT
         date::text AS date,
         (summary_data->'sleep'->>'averageQuality')::numeric AS sleep_quality,
         (summary_data->'activity'->>'steps')::numeric AS steps
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - ${LOOKBACK_DAYS}
         AND summary_data->'sleep'->>'averageQuality' IS NOT NULL
         AND summary_data->'activity'->>'steps' IS NOT NULL
         AND (summary_data->'activity'->>'steps')::numeric > 0
       ORDER BY date DESC`,
      [userId]
    );

    if (rows.length < 21) return null;

    // Split by sleep quality into poor (bottom 33%) and good (top 33%) tertiles
    const { lowGroup: poorSleepDays, highGroup: goodSleepDays } =
      tertileSplit(rows, r => Number(r.sleep_quality));

    if (poorSleepDays.length < 5 || goodSleepDays.length < 5) return null;

    const avgStepsPoor = avgOf(poorSleepDays, r => Number(r.steps));
    const avgStepsGood = avgOf(goodSleepDays, r => Number(r.steps));

    const diff = avgStepsGood - avgStepsPoor;
    if (Math.abs(diff) < 500) return null;

    const effectRatio = Math.abs(diff) / Math.max(avgStepsPoor, avgStepsGood);
    const sampleSize = Math.min(poorSleepDays.length, goodSleepDays.length);
    const { score, label } = calcConfidence(sampleSize, effectRatio);

    // "higher/lower on days after poor sleep" — diff = good - poor, so if positive, poor < good → steps are lower on poor sleep days
    const direction = diff > 0 ? "lower" : "higher";

    return {
      title: `Step count tends to be ${direction} on days after poor sleep`,
      description: `Over the last 60 days, on poor-sleep days your average step count was ${Math.round(avgStepsPoor).toLocaleString()} steps, compared to ${Math.round(avgStepsGood).toLocaleString()} steps on good-sleep days — a difference of ${Math.abs(diff).toFixed(0)} steps.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        poor_sleep_days: poorSleepDays.length,
        good_sleep_days: goodSleepDays.length,
        avg_steps_poor_sleep: Math.round(avgStepsPoor),
        avg_steps_good_sleep: Math.round(avgStepsGood),
        step_difference: Math.abs(diff).toFixed(0),
        direction,
      },
    };
  },
};
