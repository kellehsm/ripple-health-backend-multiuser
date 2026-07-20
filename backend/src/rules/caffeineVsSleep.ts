import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const CaffeineVsSleepRule: InsightRule = {
  id: "caffeine_vs_sleep",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    // Join daily caffeine totals with sleep quality (sleep ending on that calendar day)
    const rows = await query<{ day: string; total_caffeine: number; avg_sleep_quality: number }>(
      `SELECT
         c.day::text AS day,
         c.total_caffeine,
         s.avg_sleep_quality
       FROM (
         SELECT logged_at::date AS day, SUM(caffeine_mg) AS total_caffeine
         FROM substance_logs
         WHERE user_id = $1
           AND substance_type = 'caffeine'
           AND logged_at >= CURRENT_DATE - 60
         GROUP BY logged_at::date
       ) c
       JOIN (
         SELECT DATE(end_time) AS day, AVG(quality_score) AS avg_sleep_quality
         FROM sleep_sessions
         WHERE user_id = $1
           AND end_time >= CURRENT_DATE - 60
         GROUP BY DATE(end_time)
       ) s ON s.day = c.day
       ORDER BY c.day DESC`,
      [userId]
    );

    if (rows.length < 21) return null;

    // Split into high (top 33%) vs low (bottom 33%) caffeine days
    const sorted = [...rows].sort((a, b) => Number(a.total_caffeine) - Number(b.total_caffeine));
    const bottom33Idx = Math.floor(sorted.length / 3);
    const top33Idx = Math.ceil((sorted.length * 2) / 3);

    const lowThreshold = Number(sorted[bottom33Idx - 1].total_caffeine);
    const highThreshold = Number(sorted[top33Idx].total_caffeine);

    const lowCaffeineDays = rows.filter(r => Number(r.total_caffeine) <= lowThreshold);
    const highCaffeineDays = rows.filter(r => Number(r.total_caffeine) >= highThreshold);

    if (lowCaffeineDays.length < 5 || highCaffeineDays.length < 5) return null;

    const avgSleepLow = lowCaffeineDays.reduce((s, r) => s + Number(r.avg_sleep_quality), 0) / lowCaffeineDays.length;
    const avgSleepHigh = highCaffeineDays.reduce((s, r) => s + Number(r.avg_sleep_quality), 0) / highCaffeineDays.length;

    const diff = avgSleepHigh - avgSleepLow;
    if (Math.abs(diff) < 0.2) return null;

    const effectRatio = Math.abs(diff) / 4; // sleep quality scale is 1-5
    const sampleSize = Math.min(lowCaffeineDays.length, highCaffeineDays.length);
    const { score, label } = calcConfidence(sampleSize, effectRatio);

    const avgCaffeineHigh = highCaffeineDays.reduce((s, r) => s + Number(r.total_caffeine), 0) / highCaffeineDays.length;
    const avgCaffeineLow = lowCaffeineDays.reduce((s, r) => s + Number(r.total_caffeine), 0) / lowCaffeineDays.length;

    // diff = high - low: if negative, sleep is lower on high-caffeine days
    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Sleep quality tends to be ${direction} on high-caffeine days`,
      description: `Over the last 60 days, on high-caffeine days (avg ${Math.round(avgCaffeineHigh)} mg) your average sleep quality was ${avgSleepHigh.toFixed(1)}/5, compared to ${avgSleepLow.toFixed(1)}/5 on low-caffeine days (avg ${Math.round(avgCaffeineLow)} mg) — a difference of ${Math.abs(diff).toFixed(2)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
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
