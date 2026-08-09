import { InsightRule, InsightResult } from "./types.js";
import { detectWindowTrend } from "./trendHelper.js";

// Trend: total daily sleep — has it drifted up or down over the last month?
export const TrendSleepDurationRule: InsightRule = {
  id: "trend_sleep_duration",
  type: "trend",
  minDays: 45,

  async run(userId: string): Promise<InsightResult | null> {
    const t = await detectWindowTrend(
      userId,
      `SELECT start_time::date AS day,
              SUM(EXTRACT(EPOCH FROM (end_time - start_time)))::float8 AS metric_value
       FROM sleep_sessions
       WHERE user_id = $1 AND start_time >= NOW() - INTERVAL '60 days'
       GROUP BY start_time::date
       HAVING SUM(EXTRACT(EPOCH FROM (end_time - start_time))) > 0`,
      30, 30, 8,
    );
    if (!t) return null;

    // Ignore anything smaller than 15 minutes total change — noise.
    if (Math.abs(t.diff) < 900) return null;

    const direction = t.diff > 0 ? "more" : "less";
    const minsDelta = Math.abs(t.diff) / 60;
    const recentH = (t.recentMean / 3600).toFixed(1);
    const priorH  = (t.priorMean / 3600).toFixed(1);

    return {
      title: `You're sleeping ${direction} on average this month`,
      description: `Over the last 30 days you slept ${recentH}h/night on average, compared to ${priorH}h/night the 30 days before — a shift of ${Math.round(minsDelta)} minutes ${direction}.`,
      confidence: t.confidence,
      confidenceScore: t.confidenceScore,
      timesObserved: t.recentCount + t.priorCount,
      supportingData: {
        recent_avg_hours: recentH,
        prior_avg_hours: priorH,
        change_minutes: Math.round(minsDelta),
        direction,
        recent_nights: t.recentCount,
        prior_nights: t.priorCount,
      },
    };
  },
};
