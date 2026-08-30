import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { avgOf } from "./ruleHelper.js";

const LOOKBACK_DAYS = 60;

export const MealSkippingVsGlucoseRule: InsightRule = {
  id: "meal_skipping_vs_glucose",
  type: "glucose",
  minDays: 14,

  async run(userId: string): Promise<InsightResult | null> {
    // For each day, determine whether breakfast was logged (any meal before 11am)
    // and collect average glucose in the 10am–1pm window.
    const rows = await query<{
      day: string;
      had_breakfast: boolean;
      avg_mid_morning_glucose: string;
    }>(
      `WITH breakfast_days AS (
         SELECT
           DATE(logged_at AT TIME ZONE 'America/New_York') AS day,
           TRUE AS had_breakfast
         FROM meal_logs
         WHERE user_id = $1
           AND logged_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
           AND EXTRACT(HOUR FROM logged_at AT TIME ZONE 'America/New_York') < 11
         GROUP BY DATE(logged_at AT TIME ZONE 'America/New_York')
       ),
       glucose_window AS (
         SELECT
           DATE(recorded_at AT TIME ZONE 'America/New_York') AS day,
           AVG(glucose_mg_dl) AS avg_mid_morning_glucose
         FROM glucose_readings
         WHERE user_id = $1
           AND recorded_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
           AND EXTRACT(HOUR FROM recorded_at AT TIME ZONE 'America/New_York') BETWEEN 10 AND 13
         GROUP BY DATE(recorded_at AT TIME ZONE 'America/New_York')
         HAVING COUNT(*) >= 1
       )
       SELECT
         gw.day::text AS day,
         COALESCE(bd.had_breakfast, FALSE) AS had_breakfast,
         gw.avg_mid_morning_glucose::text
       FROM glucose_window gw
       LEFT JOIN breakfast_days bd ON bd.day = gw.day
       ORDER BY gw.day DESC`,
      [userId]
    );

    if (rows.length < 14) return null;

    const skippedBreakfast = rows.filter(r => !r.had_breakfast);
    const hadBreakfast     = rows.filter(r => r.had_breakfast);

    if (skippedBreakfast.length < 5 || hadBreakfast.length < 5) return null;

    const avgGlucoseSkipped = avgOf(skippedBreakfast, r => Number(r.avg_mid_morning_glucose));
    const avgGlucoseEaten   = avgOf(hadBreakfast,     r => Number(r.avg_mid_morning_glucose));

    const diff = avgGlucoseSkipped - avgGlucoseEaten;
    if (Math.abs(diff) < 5) return null;

    const direction = diff > 0 ? "higher" : "lower";
    const effectRatio = Math.abs(diff) / Math.max(avgGlucoseSkipped, avgGlucoseEaten);
    const { score, label } = calcConfidence(
      Math.min(skippedBreakfast.length, hadBreakfast.length),
      effectRatio
    );

    return {
      title: `Mid-morning glucose tends to be ${direction} on days you skip breakfast`,
      description: `Over the last 60 days, on the ${skippedBreakfast.length} days with no meal logged before 11 am your average glucose between 10 am–1 pm was ${Math.round(avgGlucoseSkipped)} mg/dL, compared to ${Math.round(avgGlucoseEaten)} mg/dL on the ${hadBreakfast.length} days with breakfast — a difference of ${Math.abs(diff).toFixed(0)} mg/dL.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      primaryMetric: "glucose_mg_dl",
      supportingData: {
        days_analyzed: rows.length,
        skipped_breakfast_days: skippedBreakfast.length,
        had_breakfast_days: hadBreakfast.length,
        avg_glucose_skipped: Math.round(avgGlucoseSkipped),
        avg_glucose_with_breakfast: Math.round(avgGlucoseEaten),
        difference_mg_dl: Math.abs(diff).toFixed(0),
        direction,
      },
    };
  },
};
