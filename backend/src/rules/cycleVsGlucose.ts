import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const CycleVsGlucoseRule: InsightRule = {
  id: "cycle_vs_glucose",
  type: "combined",
  minDays: 35,

  async run(userId: string): Promise<InsightResult | null> {
    // Get cycle days and glucose from daily_summaries joined on same date, last 90 days
    const rows = await query<{ log_date: string; flow_intensity: string; avg_glucose: number }>(
      `SELECT
         cdl.log_date::text AS log_date,
         cdl.flow_intensity,
         (ds.summary_data->'glucose'->>'average')::numeric AS avg_glucose
       FROM cycle_day_logs cdl
       JOIN daily_summaries ds
         ON ds.user_id = $1
         AND ds.date = cdl.log_date
       WHERE cdl.user_id = $1
         AND cdl.log_date >= CURRENT_DATE - 90
         AND cdl.flow_intensity IS NOT NULL
         AND ds.summary_data->'glucose'->>'average' IS NOT NULL
       ORDER BY cdl.log_date DESC`,
      [userId]
    );

    const menstrualDays    = rows.filter(r => ['spotting', 'light', 'medium', 'heavy'].includes(r.flow_intensity));
    const nonMenstrualDays = rows.filter(r => r.flow_intensity === 'none');

    if (menstrualDays.length < 5 || nonMenstrualDays.length < 15) return null;

    const avgGlucoseMenstrual    = menstrualDays.reduce((s, r) => s + Number(r.avg_glucose), 0) / menstrualDays.length;
    const avgGlucoseNonMenstrual = nonMenstrualDays.reduce((s, r) => s + Number(r.avg_glucose), 0) / nonMenstrualDays.length;

    const diff = avgGlucoseMenstrual - avgGlucoseNonMenstrual;
    if (Math.abs(diff) < 5) return null;

    const effectRatio = Math.abs(diff) / Math.max(avgGlucoseMenstrual, avgGlucoseNonMenstrual);
    const { score, label } = calcConfidence(
      Math.min(menstrualDays.length, nonMenstrualDays.length),
      effectRatio
    );

    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Glucose tends to be ${direction} during your period`,
      description: `Over the last 90 days, your average glucose was ${avgGlucoseMenstrual.toFixed(0)} mg/dL on menstrual days and ${avgGlucoseNonMenstrual.toFixed(0)} mg/dL on non-menstrual days — a difference of about ${Math.abs(diff).toFixed(0)} mg/dL.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        menstrual_days: menstrualDays.length,
        non_menstrual_days: nonMenstrualDays.length,
        avg_glucose_menstrual: avgGlucoseMenstrual.toFixed(1),
        avg_glucose_non_menstrual: avgGlucoseNonMenstrual.toFixed(1),
        difference_mg_dl: diff.toFixed(1),
        direction,
      },
    };
  },
};
