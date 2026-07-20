import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const SleepConsistencyRule: InsightRule = {
  id: "sleep_consistency",
  type: "sleep",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    // Get sleep sessions from last 60 days: bedtime hour as fractional hour, plus quality
    const rows = await query<{ bedtime_hour: number; quality_score: number }>(
      `SELECT
         EXTRACT(HOUR FROM start_time) + EXTRACT(MINUTE FROM start_time) / 60.0 AS bedtime_hour,
         quality_score
       FROM sleep_sessions
       WHERE user_id = $1
         AND start_time >= NOW() - INTERVAL '60 days'
         AND quality_score IS NOT NULL
       ORDER BY start_time DESC`,
      [userId]
    );

    if (rows.length < 10) return null;

    const n = rows.length;
    const bedtimes = rows.map(r => Number(r.bedtime_hour));
    const qualities = rows.map(r => Number(r.quality_score));

    // Adjust for midnight wraparound: hours < 6 treated as after-midnight (add 24)
    const adjustedBedtimes = bedtimes.map(h => h < 6 ? h + 24 : h);

    const meanBedtime = adjustedBedtimes.reduce((s, v) => s + v, 0) / n;
    const bedtimeVariance = adjustedBedtimes.reduce((s, v) => s + Math.pow(v - meanBedtime, 2), 0) / n;
    const bedtimeStddev = Math.sqrt(bedtimeVariance);

    const avgQuality = qualities.reduce((s, v) => s + v, 0) / n;

    let title: string;
    let description: string;
    let effectRatio: number;

    if (bedtimeStddev > 1.5) {
      title = "Your bedtime has been quite varied — irregular sleep timing tends to affect sleep quality";
      description = `Over the last 60 days, your bedtime has varied by about ${bedtimeStddev.toFixed(1)} hours (std dev) across ${n} sleep sessions. More consistent sleep timing tends to be associated with better rest.`;
      effectRatio = Math.min(1, Math.max(0, (bedtimeStddev - 1.0) / 2.0));
    } else if (bedtimeStddev < 0.5 && avgQuality >= 3.5) {
      title = "Your sleep schedule has been consistent, which tends to support better sleep quality";
      description = `Over the last 60 days, your bedtime has varied by only ${bedtimeStddev.toFixed(1)} hours (std dev) across ${n} sessions, and your average sleep quality has been ${avgQuality.toFixed(1)}/5.`;
      effectRatio = Math.min(1, Math.max(0, (1.0 - bedtimeStddev) / 1.0));
    } else {
      return null;
    }

    const { score, label } = calcConfidence(n, effectRatio);

    return {
      title,
      description,
      confidence: label,
      confidenceScore: score,
      timesObserved: n,
      supportingData: {
        bedtime_stddev_hours: bedtimeStddev.toFixed(2),
        avg_quality: avgQuality.toFixed(2),
        session_count: n,
      },
    };
  },
};
