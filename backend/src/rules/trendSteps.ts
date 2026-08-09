import { InsightRule, InsightResult } from "./types.js";
import { detectWindowTrend } from "./trendHelper.js";

export const TrendStepsRule: InsightRule = {
  id: "trend_steps",
  type: "trend",
  minDays: 45,

  async run(userId: string): Promise<InsightResult | null> {
    const t = await detectWindowTrend(
      userId,
      `SELECT ml.logged_at::date AS day, MAX(ml.value)::float8 AS metric_value
       FROM metric_logs ml
       JOIN metrics m ON m.id = ml.metric_id
       WHERE m.user_id = $1 AND m.name = 'steps'
         AND ml.logged_at >= NOW() - INTERVAL '60 days'
       GROUP BY ml.logged_at::date`,
      30, 30, 8,
    );
    if (!t) return null;

    // Ignore <500 step average change — noise floor.
    if (Math.abs(t.diff) < 500) return null;

    const direction = t.diff > 0 ? "more" : "fewer";
    const recentK = Math.round(t.recentMean).toLocaleString();
    const priorK  = Math.round(t.priorMean).toLocaleString();

    return {
      title: `You're walking ${direction} this month (${Math.round(Math.abs(t.diff)).toLocaleString()} steps/day)`,
      description: `Over the last 30 days you averaged ${recentK} steps/day, compared to ${priorK} the 30 days before — a shift of ${Math.round(Math.abs(t.diff)).toLocaleString()} ${direction}.`,
      confidence: t.confidence,
      confidenceScore: t.confidenceScore,
      timesObserved: t.recentCount + t.priorCount,
      supportingData: {
        recent_avg_steps: recentK,
        prior_avg_steps: priorK,
        change_steps: Math.round(t.diff),
        direction,
        recent_days: t.recentCount,
        prior_days: t.priorCount,
      },
    };
  },
};
