import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { avgOf } from "./ruleHelper.js";

const LOOKBACK_DAYS = 90;

export const WaterVsNextDayGlucoseRule: InsightRule = {
  id: "water_vs_next_day_glucose",
  type: "glucose",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    // Fetch daily water intake paired with next-morning fasting glucose
    // (first reading before 9am on the following day).
    const rows = await query<{
      water_day: string;
      glasses: string;
      fasting_glucose: string;
    }>(
      `WITH water_daily AS (
         SELECT
           DATE(ml.logged_at AT TIME ZONE 'America/New_York') AS day,
           SUM(ml.value) AS glasses
         FROM metric_logs ml
         JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1
           AND m.name = 'water'
           AND ml.logged_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
         GROUP BY DATE(ml.logged_at AT TIME ZONE 'America/New_York')
       ),
       fasting_glucose AS (
         SELECT DISTINCT ON (DATE(recorded_at AT TIME ZONE 'America/New_York'))
           DATE(recorded_at AT TIME ZONE 'America/New_York') AS day,
           glucose_mg_dl
         FROM glucose_readings
         WHERE user_id = $1
           AND recorded_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
           AND EXTRACT(HOUR FROM recorded_at AT TIME ZONE 'America/New_York') < 9
         ORDER BY DATE(recorded_at AT TIME ZONE 'America/New_York'),
                  recorded_at ASC
       )
       SELECT
         wd.day::text AS water_day,
         wd.glasses::text,
         fg.glucose_mg_dl::text AS fasting_glucose
       FROM water_daily wd
       JOIN fasting_glucose fg ON fg.day = wd.day + INTERVAL '1 day'
       ORDER BY wd.day DESC`,
      [userId]
    );

    if (rows.length < 21) return null;

    // Calculate user's average daily water intake
    const avgGlasses = avgOf(rows, r => Number(r.glasses));

    const lowWaterDays  = rows.filter(r => Number(r.glasses) < avgGlasses);
    const highWaterDays = rows.filter(r => Number(r.glasses) >= avgGlasses);

    if (lowWaterDays.length < 7 || highWaterDays.length < 7) return null;

    const avgFastingLowWater  = avgOf(lowWaterDays,  r => Number(r.fasting_glucose));
    const avgFastingHighWater = avgOf(highWaterDays, r => Number(r.fasting_glucose));

    const diff = avgFastingLowWater - avgFastingHighWater;
    if (Math.abs(diff) < 5) return null;

    const direction = diff > 0 ? "higher" : "lower";
    const effectRatio = Math.abs(diff) / Math.max(avgFastingLowWater, avgFastingHighWater);
    const { score, label } = calcConfidence(
      Math.min(lowWaterDays.length, highWaterDays.length),
      effectRatio
    );

    return {
      title: `Next-morning fasting glucose tends to be ${direction} after low-water days`,
      description: `Over the last 90 days, on mornings after days when you drank below your average (${avgGlasses.toFixed(1)} glasses) your fasting glucose averaged ${Math.round(avgFastingLowWater)} mg/dL, compared to ${Math.round(avgFastingHighWater)} mg/dL after well-hydrated days — a difference of ${Math.abs(diff).toFixed(0)} mg/dL.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      primaryMetric: "glucose_mg_dl",
      supportingData: {
        days_analyzed: rows.length,
        low_water_days: lowWaterDays.length,
        high_water_days: highWaterDays.length,
        avg_glasses_per_day: avgGlasses.toFixed(1),
        avg_fasting_glucose_low_water: Math.round(avgFastingLowWater),
        avg_fasting_glucose_high_water: Math.round(avgFastingHighWater),
        difference_mg_dl: Math.abs(diff).toFixed(0),
        direction,
      },
    };
  },
};
