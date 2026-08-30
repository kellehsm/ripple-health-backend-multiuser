import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { LOOKBACK_DAYS, avgOf } from "./ruleHelper.js";

export const MindfulnessVsSleepRule: InsightRule = {
  id: "mindfulness_vs_sleep",
  type: "mindfulness",
  minDays: 20,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      sleep_duration: string;
      sleep_quality: string;
      had_mindfulness: boolean;
    }>(
      `WITH mindfulness_days AS (
         SELECT DATE(ml.logged_at) AS day
         FROM metric_logs ml
         JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1 AND m.name = 'mindfulness'
           AND ml.logged_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
         GROUP BY DATE(ml.logged_at)
       )
       SELECT
         (ds.summary_data->'sleep'->>'duration')::numeric AS sleep_duration,
         (ds.summary_data->'sleep'->>'averageQuality')::numeric AS sleep_quality,
         (md.day IS NOT NULL) AS had_mindfulness
       FROM daily_summaries ds
       LEFT JOIN mindfulness_days md ON md.day = ds.date
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - ${LOOKBACK_DAYS}
         AND ds.summary_data->'sleep'->>'duration' IS NOT NULL
         AND (ds.summary_data->'sleep'->>'duration')::numeric > 0`,
      [userId]
    );

    if (rows.length < 20) return null;

    const mindfulnessDays   = rows.filter(r => r.had_mindfulness);
    const noMindfulnessDays = rows.filter(r => !r.had_mindfulness);

    if (mindfulnessDays.length < 8 || noMindfulnessDays.length < 8) return null;

    const avgDurationWith    = avgOf(mindfulnessDays,   r => Number(r.sleep_duration));
    const avgDurationWithout = avgOf(noMindfulnessDays, r => Number(r.sleep_duration));

    const avgQualityWith    = avgOf(mindfulnessDays,   r => Number(r.sleep_quality));
    const avgQualityWithout = avgOf(noMindfulnessDays, r => Number(r.sleep_quality));

    const durationDiff = avgDurationWith - avgDurationWithout;
    const qualityDiff  = avgQualityWith  - avgQualityWithout;

    // Need at least a 10-minute difference in duration or 0.2 quality difference
    if (Math.abs(durationDiff) < 10 && Math.abs(qualityDiff) < 0.2) return null;

    // Use whichever signal is stronger as the primary
    const useDuration = Math.abs(durationDiff / 60) >= Math.abs(qualityDiff / 4);
    const direction   = useDuration
      ? durationDiff > 0 ? "longer" : "shorter"
      : qualityDiff  > 0 ? "better"  : "worse";

    const effectRatio = useDuration
      ? Math.abs(durationDiff) / Math.max(avgDurationWith, avgDurationWithout)
      : Math.abs(qualityDiff) / 4;

    const { score, label } = calcConfidence(
      Math.min(mindfulnessDays.length, noMindfulnessDays.length),
      effectRatio
    );

    const durationDiffMins = Math.round(Math.abs(durationDiff));
    const title = useDuration
      ? `Sleep tends to be ${direction} on days you practice mindfulness`
      : `Sleep quality tends to be ${direction} on mindfulness days`;

    const description = useDuration
      ? `Over the last ${LOOKBACK_DAYS} days, on the ${mindfulnessDays.length} days with a mindfulness session you averaged ${(avgDurationWith / 60).toFixed(1)} h of sleep, compared to ${(avgDurationWithout / 60).toFixed(1)} h on the ${noMindfulnessDays.length} days without — a difference of ${durationDiffMins} minutes.`
      : `Over the last ${LOOKBACK_DAYS} days, on the ${mindfulnessDays.length} days with a mindfulness session your sleep quality averaged ${avgQualityWith.toFixed(1)}/5, compared to ${avgQualityWithout.toFixed(1)}/5 on the ${noMindfulnessDays.length} days without.`;

    return {
      title,
      description,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      primaryMetric: useDuration ? "sleep_duration_minutes" : "sleep_quality",
      supportingData: {
        days_analyzed: rows.length,
        mindfulness_days: mindfulnessDays.length,
        no_mindfulness_days: noMindfulnessDays.length,
        avg_sleep_duration_with_minutes: Math.round(avgDurationWith),
        avg_sleep_duration_without_minutes: Math.round(avgDurationWithout),
        avg_sleep_quality_with: avgQualityWith.toFixed(2),
        avg_sleep_quality_without: avgQualityWithout.toFixed(2),
        duration_difference_minutes: durationDiffMins,
        quality_difference: qualityDiff.toFixed(2),
        direction,
      },
    };
  },
};
