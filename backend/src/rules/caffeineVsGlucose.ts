import { query } from "../db.js";
import { InsightRule, InsightResult, UserCapabilities, calcConfidence } from "./types.js";
import { LOOKBACK_DAYS, tertileSplit, avgOf } from "./ruleHelper.js";

export const CaffeineVsGlucoseRule: InsightRule = {
  id: "caffeine_vs_glucose",
  type: "combined",
  minDays: 21,

  async run(userId: string, capabilities?: UserCapabilities): Promise<InsightResult | null> {
    if (capabilities && (!capabilities.has_substances || !capabilities.has_glucose)) return null;
    // Join daily caffeine totals with daily glucose averages
    const rows = await query<{ day: string; total_caffeine: number; avg_glucose: number }>(
      `SELECT
         c.day::text AS day,
         c.total_caffeine,
         (ds.summary_data->'glucose'->>'average')::numeric AS avg_glucose
       FROM (
         SELECT logged_at::date AS day, SUM(caffeine_mg) AS total_caffeine
         FROM (
           SELECT logged_at, (caffeine_mg * servings) AS caffeine_mg FROM meals
           WHERE user_id = $1 AND caffeine_mg IS NOT NULL AND logged_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
           UNION ALL
           SELECT logged_at, caffeine_mg FROM substance_logs
           WHERE user_id = $1 AND substance_type = 'caffeine' AND logged_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
         ) combined
         GROUP BY logged_at::date
       ) c
       JOIN daily_summaries ds ON ds.date = c.day AND ds.user_id = $1
       WHERE ds.summary_data->'glucose'->>'average' IS NOT NULL
         AND (ds.summary_data->'glucose'->>'average')::numeric > 0
       ORDER BY c.day DESC`,
      [userId]
    );

    if (rows.length < 21) return null;

    // Split into high (top 33%) vs low (bottom 33%) caffeine days
    const { lowGroup: lowCaffeineDays, highGroup: highCaffeineDays } =
      tertileSplit(rows, r => Number(r.total_caffeine));

    if (lowCaffeineDays.length < 4 || highCaffeineDays.length < 4) return null;

    const avgGlucoseHigh = avgOf(highCaffeineDays, r => Number(r.avg_glucose));
    const avgGlucoseLow  = avgOf(lowCaffeineDays,  r => Number(r.avg_glucose));

    const diff = avgGlucoseHigh - avgGlucoseLow;
    if (Math.abs(diff) < 5) return null;

    const effectRatio = Math.abs(diff) / Math.max(avgGlucoseHigh, avgGlucoseLow);
    const sampleSize = Math.min(lowCaffeineDays.length, highCaffeineDays.length);
    const { score, label } = calcConfidence(sampleSize, effectRatio);

    const avgCaffeineHigh = avgOf(highCaffeineDays, r => Number(r.total_caffeine));
    const avgCaffeineLow  = avgOf(lowCaffeineDays,  r => Number(r.total_caffeine));

    // diff = high - low: if positive, glucose is higher on high-caffeine days
    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Glucose tends to be ${direction} on high-caffeine days`,
      description: `Over the last 60 days, on high-caffeine days (avg ${Math.round(avgCaffeineHigh)} mg) your average glucose was ${Math.round(avgGlucoseHigh)} mg/dL, compared to ${Math.round(avgGlucoseLow)} mg/dL on low-caffeine days (avg ${Math.round(avgCaffeineLow)} mg) — a difference of ${Math.abs(diff).toFixed(0)} mg/dL.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        high_caffeine_days: highCaffeineDays.length,
        low_caffeine_days: lowCaffeineDays.length,
        avg_glucose_high_caffeine: Math.round(avgGlucoseHigh),
        avg_glucose_low_caffeine: Math.round(avgGlucoseLow),
        avg_caffeine_mg_high: Math.round(avgCaffeineHigh),
        avg_caffeine_mg_low: Math.round(avgCaffeineLow),
        difference_mg_dl: Math.abs(diff).toFixed(0),
        direction,
      },
    };
  },
};
