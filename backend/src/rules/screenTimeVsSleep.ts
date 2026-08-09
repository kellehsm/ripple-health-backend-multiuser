import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { LOOKBACK_DAYS, tertileSplit, avgOf } from "./ruleHelper.js";

// Uses daily_summaries.screen_time_minutes when available. Compares sleep
// quality on high-screen-time days (top tertile) vs low-screen-time days
// (bottom tertile).
export const ScreenTimeVsSleepRule: InsightRule = {
  id: "screen_time_vs_sleep",
  type: "sleep",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; screen_min: number; sleep_quality: number }>(
      `SELECT
         date::text AS date,
         screen_time_minutes::numeric AS screen_min,
         (summary_data->'sleep'->>'averageQuality')::numeric AS sleep_quality
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - ${LOOKBACK_DAYS}
         AND screen_time_minutes IS NOT NULL
         AND screen_time_minutes > 0
         AND summary_data->'sleep'->>'averageQuality' IS NOT NULL`,
      [userId]
    );

    if (rows.length < 21) return null;

    const { lowGroup: lowScreen, highGroup: highScreen } = tertileSplit(rows, (r) => Number(r.screen_min));
    if (lowScreen.length < 5 || highScreen.length < 5) return null;

    const qHigh = avgOf(highScreen, (r) => Number(r.sleep_quality));
    const qLow  = avgOf(lowScreen,  (r) => Number(r.sleep_quality));
    const diff = qLow - qHigh;
    if (Math.abs(diff) < 3) return null;

    const effectRatio = Math.min(1, Math.abs(diff) / 25);
    const { score, label } = calcConfidence(Math.min(lowScreen.length, highScreen.length), effectRatio);
    const direction = diff > 0 ? "worse" : "better";

    return {
      title: `High-screen-time days appear linked to ${direction} sleep`,
      description: `On days with the most screen time, your sleep quality averaged ${qHigh.toFixed(0)}/100, compared to ${qLow.toFixed(0)}/100 on your lowest-screen-time days — a difference of ${Math.abs(diff).toFixed(0)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        high_screen_days: highScreen.length,
        low_screen_days: lowScreen.length,
        avg_quality_high_screen: qHigh.toFixed(1),
        avg_quality_low_screen: qLow.toFixed(1),
        difference: diff.toFixed(1),
      },
    };
  },
};
