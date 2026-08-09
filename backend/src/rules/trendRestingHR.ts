import { InsightRule, InsightResult } from "./types.js";
import { detectWindowTrend } from "./trendHelper.js";

// Trend: has resting HR (daily min bpm) moved meaningfully over the last 30
// days compared to the 30 days before that? A drop is a positive fitness /
// recovery signal; a rise can flag over-training, illness, or stress.
export const TrendRestingHRRule: InsightRule = {
  id: "trend_resting_hr",
  type: "trend",
  minDays: 45,

  async run(userId: string, capabilities?): Promise<InsightResult | null> {
    if (!capabilities?.has_hr) return null;

    const t = await detectWindowTrend(
      userId,
      `SELECT recorded_at::date AS day, MIN(bpm)::float8 AS metric_value
       FROM heart_rate_readings
       WHERE user_id = $1 AND recorded_at >= NOW() - INTERVAL '60 days'
       GROUP BY recorded_at::date
       HAVING COUNT(*) >= 5`,
      30, 30, 8,
    );
    if (!t) return null;

    // Ignore anything smaller than 2 bpm — noise floor for daily min readings.
    if (Math.abs(t.diff) < 2) return null;

    const direction = t.diff < 0 ? "lower" : "higher";
    const arrow     = t.diff < 0 ? "↓" : "↑";
    const health    = t.diff < 0 ? "typically a positive recovery/fitness signal" : "worth attention — often reflects overtraining, illness, or stress";
    const magnitude = Math.abs(t.diff).toFixed(1);

    return {
      title: `Resting heart rate has trended ${direction} (${arrow}${magnitude} bpm)`,
      description: `Over the last 30 days your daily resting HR averaged ${t.recentMean.toFixed(1)} bpm, compared to ${t.priorMean.toFixed(1)} bpm the 30 days before — a shift of ${magnitude} bpm ${direction}. This is ${health}.`,
      confidence: t.confidence,
      confidenceScore: t.confidenceScore,
      timesObserved: t.recentCount + t.priorCount,
      supportingData: {
        recent_avg_bpm: t.recentMean.toFixed(1),
        prior_avg_bpm: t.priorMean.toFixed(1),
        change_bpm: t.diff.toFixed(1),
        direction,
        recent_days: t.recentCount,
        prior_days: t.priorCount,
      },
    };
  },
};
