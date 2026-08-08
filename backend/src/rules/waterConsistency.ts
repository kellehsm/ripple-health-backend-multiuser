import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { LOOKBACK_DAYS, avgOf } from "./ruleHelper.js";

export const WaterConsistencyRule: InsightRule = {
  id: "water_consistency",
  type: "water",
  minDays: 20,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; glasses: number; dow: number }>(
      `SELECT
         ds.date::text AS date,
         (ds.summary_data->'hydration'->>'glasses')::numeric AS glasses,
         EXTRACT(DOW FROM ds.date) AS dow
       FROM daily_summaries ds
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - ${LOOKBACK_DAYS}
         AND ds.summary_data->'hydration'->>'glasses' IS NOT NULL
       ORDER BY ds.date DESC`,
      [userId]
    );

    if (rows.length < 20) return null;

    // DOW: 0=Sun, 1=Mon, ..., 6=Sat
    const weekendDays  = rows.filter(r => Number(r.dow) === 0 || Number(r.dow) === 6);
    const weekdayDays  = rows.filter(r => Number(r.dow) >= 1 && Number(r.dow) <= 5);

    if (weekendDays.length < 4 || weekdayDays.length < 10) return null;

    const avgWeekend = avgOf(weekendDays, r => Number(r.glasses));
    const avgWeekday = avgOf(weekdayDays, r => Number(r.glasses));

    const diff = avgWeekday - avgWeekend;
    if (Math.abs(diff) < 1) return null; // less than 1 glass difference, not notable

    const effectRatio = Math.abs(diff) / 8; // 8 glasses = full goal
    const { score, label } = calcConfidence(Math.min(weekendDays.length, weekdayDays.length), effectRatio);

    const lowDay  = diff > 0 ? "weekends" : "weekdays";
    const highDay = diff > 0 ? "weekdays" : "weekends";

    return {
      title: `Water intake tends to be lower on ${lowDay}`,
      description: `Over the last 60 days, you averaged ${avgWeekday.toFixed(1)} glasses on weekdays and ${avgWeekend.toFixed(1)} on weekends — a difference of ${Math.abs(diff).toFixed(1)} glasses.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        weekend_days: weekendDays.length,
        weekday_days: weekdayDays.length,
        avg_glasses_weekend: avgWeekend.toFixed(1),
        avg_glasses_weekday: avgWeekday.toFixed(1),
        difference_glasses: Math.abs(diff).toFixed(1),
        lower_on: lowDay,
      },
    };
  },
};
