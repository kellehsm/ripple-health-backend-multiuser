import { query } from "../db.js";
import { InsightRule, InsightResult, UserCapabilities } from "./types.js";
import { LOOKBACK_DAYS, tertileSplit, avgOf } from "./ruleHelper.js";
import { welchTTest, effectiveSampleSize, confidenceFromStats } from "./stats.js";

export const CaffeineVsSleepRule: InsightRule = {
  id: "caffeine_vs_sleep",
  type: "combined",
  minDays: 21,
  primaryMetric: "sleep_quality",

  async run(userId: string, capabilities?: UserCapabilities): Promise<InsightResult | null> {
    if (capabilities && !capabilities.has_substances) return null;
    // Join daily caffeine totals on day D with the FOLLOWING night's sleep —
    // i.e. the session ending on day D+1. (Caffeine precedes the sleep it can
    // affect; joining to the sleep that ended the same morning was reversed.)
    const rows = await query<{ day: string; total_caffeine: number; avg_sleep_quality: number }>(
      `SELECT
         c.day::text AS day,
         c.total_caffeine,
         s.avg_sleep_quality
       FROM (
         SELECT logged_at::date AS day, SUM(caffeine_mg) AS total_caffeine
         FROM (
           -- Multiply by servings — the meals row's caffeine_mg is per-serving.
           SELECT logged_at, (caffeine_mg * servings) AS caffeine_mg FROM meals
           WHERE user_id = $1 AND caffeine_mg IS NOT NULL AND logged_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
           UNION ALL
           SELECT logged_at, caffeine_mg FROM substance_logs
           WHERE user_id = $1 AND substance_type = 'caffeine' AND logged_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
         ) combined
         GROUP BY logged_at::date
       ) c
       JOIN (
         SELECT DATE(end_time) AS day, AVG(quality_score) AS avg_sleep_quality
         FROM sleep_sessions
         WHERE user_id = $1
           AND end_time >= CURRENT_DATE - ${LOOKBACK_DAYS}
         GROUP BY DATE(end_time)
       ) s ON s.day = c.day + 1
       ORDER BY c.day DESC`,
      [userId]
    );

    if (rows.length < 21) return null;

    // Split into high (top 33%) vs low (bottom 33%) caffeine days
    const { lowGroup: lowCaffeineDays, highGroup: highCaffeineDays } =
      tertileSplit(rows, r => Number(r.total_caffeine));

    if (lowCaffeineDays.length < 5 || highCaffeineDays.length < 5) return null;

    const highQuality = highCaffeineDays.map(r => Number(r.avg_sleep_quality));
    const lowQuality  = lowCaffeineDays.map(r => Number(r.avg_sleep_quality));

    const avgSleepLow  = avgOf(lowCaffeineDays,  r => Number(r.avg_sleep_quality));
    const avgSleepHigh = avgOf(highCaffeineDays, r => Number(r.avg_sleep_quality));

    const diff = avgSleepHigh - avgSleepLow;
    if (Math.abs(diff) < 0.2) return null;

    // Welch's t-test with autocorrelation-adjusted effective N, so this rule
    // carries a p-value and participates in FDR correction like modern rules.
    const effN = effectiveSampleSize(highQuality);
    const test = welchTTest(highQuality, lowQuality, effN);
    const { score, label } = confidenceFromStats(test.pValue, Math.abs(test.effectSize));

    const avgCaffeineHigh = avgOf(highCaffeineDays, r => Number(r.total_caffeine));
    const avgCaffeineLow  = avgOf(lowCaffeineDays,  r => Number(r.total_caffeine));

    // diff = high - low: if negative, sleep is lower after high-caffeine days
    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Sleep quality tends to be ${direction} on nights after high-caffeine days`,
      description: `Over the last 60 days, after high-caffeine days (avg ${Math.round(avgCaffeineHigh)} mg) your average sleep quality was ${avgSleepHigh.toFixed(1)}/5, compared to ${avgSleepLow.toFixed(1)}/5 after low-caffeine days (avg ${Math.round(avgCaffeineLow)} mg) — a difference of ${Math.abs(diff).toFixed(2)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      pValue: test.pValue,
      effectSize: test.effectSize,
      ci95: test.ci95,
      primaryMetric: "sleep_quality",
      supportingData: {
        days_analyzed: rows.length,
        high_caffeine_days: highCaffeineDays.length,
        low_caffeine_days: lowCaffeineDays.length,
        avg_sleep_quality_high_caffeine: avgSleepHigh.toFixed(2),
        avg_sleep_quality_low_caffeine: avgSleepLow.toFixed(2),
        avg_caffeine_mg_high: Math.round(avgCaffeineHigh),
        avg_caffeine_mg_low: Math.round(avgCaffeineLow),
        quality_difference: Math.abs(diff).toFixed(2),
        direction,
      },
    };
  },
};
