import { InsightRule, InsightResult } from "./types.js";
import { detectWindowTrend } from "./trendHelper.js";

// Trend: daily glucose coefficient-of-variation (CV = SD / mean). Lower is
// steadier. Movement in either direction is worth surfacing.
export const TrendGlucoseVariabilityRule: InsightRule = {
  id: "trend_glucose_variability",
  type: "trend",
  minDays: 45,

  async run(userId: string, capabilities?): Promise<InsightResult | null> {
    if (!capabilities?.has_glucose) return null;

    const t = await detectWindowTrend(
      userId,
      `SELECT recorded_at::date AS day,
              (STDDEV_SAMP(mg_dl) / NULLIF(AVG(mg_dl), 0))::float8 AS metric_value
       FROM glucose_readings
       WHERE user_id = $1 AND recorded_at >= NOW() - INTERVAL '60 days'
       GROUP BY recorded_at::date
       HAVING COUNT(*) >= 20`,
      30, 30, 10,
    );
    if (!t) return null;

    // Ignore <1% absolute change in CV — noise floor.
    if (Math.abs(t.diff) < 0.01) return null;

    const direction = t.diff < 0 ? "steadier" : "more variable";
    const emoji     = t.diff < 0 ? "🎯" : "⚠️";
    const health    = t.diff < 0 ? "less variability day-to-day — a positive glucose control signal" : "more day-to-day swings than the prior month";
    const recentPct = (t.recentMean * 100).toFixed(1);
    const priorPct  = (t.priorMean  * 100).toFixed(1);

    return {
      title: `${emoji} Glucose has been ${direction} this month`,
      description: `Your daily glucose CV averaged ${recentPct}% over the last 30 days, compared to ${priorPct}% the 30 days before — ${health}.`,
      confidence: t.confidence,
      confidenceScore: t.confidenceScore,
      timesObserved: t.recentCount + t.priorCount,
      supportingData: {
        recent_avg_cv_pct: recentPct,
        prior_avg_cv_pct: priorPct,
        change_pct_points: (t.diff * 100).toFixed(1),
        direction,
        recent_days: t.recentCount,
        prior_days: t.priorCount,
      },
    };
  },
};
