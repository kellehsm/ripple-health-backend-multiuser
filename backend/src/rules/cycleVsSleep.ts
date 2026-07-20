import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const CycleVsSleepRule: InsightRule = {
  id: "cycle_vs_sleep",
  type: "combined",
  minDays: 35,

  async run(userId: string): Promise<InsightResult | null> {
    // Get cycle days and sleep quality from daily_summaries joined on same date, last 90 days
    const rows = await query<{ log_date: string; flow_intensity: string; sleep_quality: number }>(
      `SELECT
         cdl.log_date::text AS log_date,
         cdl.flow_intensity,
         (ds.summary_data->'sleep'->>'averageQuality')::numeric AS sleep_quality
       FROM cycle_day_logs cdl
       JOIN daily_summaries ds
         ON ds.user_id = $1
         AND ds.date = cdl.log_date
       WHERE cdl.user_id = $1
         AND cdl.log_date >= CURRENT_DATE - 90
         AND cdl.flow_intensity IS NOT NULL
         AND ds.summary_data->'sleep'->>'averageQuality' IS NOT NULL
       ORDER BY cdl.log_date DESC`,
      [userId]
    );

    const menstrualDays    = rows.filter(r => ['spotting', 'light', 'medium', 'heavy'].includes(r.flow_intensity));
    const nonMenstrualDays = rows.filter(r => r.flow_intensity === 'none');

    if (menstrualDays.length < 5 || nonMenstrualDays.length < 15) return null;

    const avgSleepMenstrual    = menstrualDays.reduce((s, r) => s + Number(r.sleep_quality), 0) / menstrualDays.length;
    const avgSleepNonMenstrual = nonMenstrualDays.reduce((s, r) => s + Number(r.sleep_quality), 0) / nonMenstrualDays.length;

    const diff = avgSleepMenstrual - avgSleepNonMenstrual;
    if (Math.abs(diff) < 0.15) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(
      Math.min(menstrualDays.length, nonMenstrualDays.length),
      effectRatio
    );

    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Sleep quality tends to be ${direction} during your period`,
      description: `Over the last 90 days, your average sleep quality was ${avgSleepMenstrual.toFixed(1)}/5 on menstrual days and ${avgSleepNonMenstrual.toFixed(1)}/5 on non-menstrual days.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        menstrual_days: menstrualDays.length,
        non_menstrual_days: nonMenstrualDays.length,
        avg_sleep_quality_menstrual: avgSleepMenstrual.toFixed(2),
        avg_sleep_quality_non_menstrual: avgSleepNonMenstrual.toFixed(2),
        difference: diff.toFixed(2),
        direction,
      },
    };
  },
};
