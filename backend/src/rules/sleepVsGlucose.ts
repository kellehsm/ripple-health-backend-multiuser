import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { LOOKBACK_DAYS, tertileSplit, avgOf } from "./ruleHelper.js";

export const SleepVsGlucoseRule: InsightRule = {
  id: "sleep_vs_glucose",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; sleep_quality: number; avg_glucose: number }>(
      `SELECT
         date::text AS date,
         (summary_data->'sleep'->>'averageQuality')::numeric AS sleep_quality,
         (summary_data->'glucose'->>'average')::numeric AS avg_glucose
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - ${LOOKBACK_DAYS}
         AND summary_data->'sleep'->>'averageQuality' IS NOT NULL
         AND summary_data->'glucose'->>'average' IS NOT NULL
         AND (summary_data->'glucose'->>'average')::numeric > 0
       ORDER BY date DESC`,
      [userId]
    );

    if (rows.length < 21) return null;

    // Split by sleep quality into poor (bottom 33%) and good (top 33%) tertiles
    const { lowGroup: poorSleepDays, highGroup: goodSleepDays } =
      tertileSplit(rows, r => Number(r.sleep_quality));

    if (poorSleepDays.length < 5 || goodSleepDays.length < 5) return null;

    const avgGlucosePoor = avgOf(poorSleepDays, r => Number(r.avg_glucose));
    const avgGlucoseGood = avgOf(goodSleepDays, r => Number(r.avg_glucose));

    const diff = avgGlucosePoor - avgGlucoseGood;
    if (Math.abs(diff) < 5) return null;

    const effectRatio = Math.abs(diff) / Math.max(avgGlucosePoor, avgGlucoseGood);
    const sampleSize = Math.min(poorSleepDays.length, goodSleepDays.length);
    const { score, label } = calcConfidence(sampleSize, effectRatio);

    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Glucose tends to be ${direction} on poor-sleep days`,
      description: `Over the last 60 days, on days with poor sleep quality your average glucose was ${Math.round(avgGlucosePoor)} mg/dL, compared to ${Math.round(avgGlucoseGood)} mg/dL on good-sleep days — a difference of ${Math.abs(diff).toFixed(0)} mg/dL.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        poor_sleep_days: poorSleepDays.length,
        good_sleep_days: goodSleepDays.length,
        avg_glucose_poor_sleep: Math.round(avgGlucosePoor),
        avg_glucose_good_sleep: Math.round(avgGlucoseGood),
        difference_mg_dl: Math.abs(diff).toFixed(0),
        direction,
      },
    };
  },
};
