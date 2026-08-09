import { InsightRule, InsightResult } from "./types.js";
import { detectWindowTrend } from "./trendHelper.js";

export const TrendMoodRule: InsightRule = {
  id: "trend_mood",
  type: "trend",
  minDays: 45,

  async run(userId: string): Promise<InsightResult | null> {
    const t = await detectWindowTrend(
      userId,
      `SELECT logged_at::date AS day, AVG(mood_score)::float8 AS metric_value
       FROM journal_entries
       WHERE user_id = $1 AND mood_score IS NOT NULL
         AND logged_at >= NOW() - INTERVAL '60 days'
       GROUP BY logged_at::date`,
      30, 30, 8,
    );
    if (!t) return null;

    // Ignore <0.2 point change on a 1-5 scale — noise.
    if (Math.abs(t.diff) < 0.2) return null;

    const direction = t.diff > 0 ? "improved" : "dropped";
    const emoji     = t.diff > 0 ? "📈" : "📉";
    const recentM = t.recentMean.toFixed(2);
    const priorM  = t.priorMean.toFixed(2);

    return {
      title: `${emoji} Mood has ${direction} this month`,
      description: `Your average mood score over the last 30 days was ${recentM}/5, compared to ${priorM}/5 the 30 days before — a shift of ${Math.abs(t.diff).toFixed(2)} points ${direction}.`,
      confidence: t.confidence,
      confidenceScore: t.confidenceScore,
      timesObserved: t.recentCount + t.priorCount,
      supportingData: {
        recent_avg_mood: recentM,
        prior_avg_mood: priorM,
        change_points: t.diff.toFixed(2),
        direction,
        recent_days: t.recentCount,
        prior_days: t.priorCount,
      },
    };
  },
};
