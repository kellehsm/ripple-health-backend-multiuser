import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const ActivityVsGlucoseRule: InsightRule = {
  id: "activity_vs_glucose",
  type: "activity",
  minDays: 20,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ steps: number; avg_glucose: number }>(
      `SELECT
         (summary_data->'activity'->>'steps')::numeric AS steps,
         (summary_data->'glucose'->>'average')::numeric AS avg_glucose
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 60
         AND summary_data->'activity'->>'steps' IS NOT NULL
         AND summary_data->'glucose'->>'average' IS NOT NULL
         AND (summary_data->'glucose'->>'average')::numeric > 0`,
      [userId]
    );

    if (rows.length < 20) return null;

    const activedays = rows.filter(r => Number(r.steps) >= 8000);
    const sedentaryDays = rows.filter(r => Number(r.steps) < 4000);

    if (activedays.length < 5 || sedentaryDays.length < 5) return null;

    const avgGlucoseActive   = activedays.reduce((s, r) => s + Number(r.avg_glucose), 0) / activedays.length;
    const avgGlucoseSedentary = sedentaryDays.reduce((s, r) => s + Number(r.avg_glucose), 0) / sedentaryDays.length;

    const diff = avgGlucoseSedentary - avgGlucoseActive; // positive = active days lower
    if (Math.abs(diff) < 5) return null; // less than 5 mg/dL not notable

    const effectRatio = Math.abs(diff) / 40; // 40 mg/dL = large effect
    const { score, label } = calcConfidence(Math.min(activedays.length, sedentaryDays.length), effectRatio);

    const direction = diff > 0 ? "lower" : "higher";

    return {
      title: "Higher step days appear linked to steadier glucose",
      description: `Over the last 60 days, on days with 8,000+ steps your average glucose was ${Math.round(avgGlucoseActive)} mg/dL, compared to ${Math.round(avgGlucoseSedentary)} mg/dL on low-activity days — a difference of ${Math.abs(diff).toFixed(0)} mg/dL.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        active_days: activedays.length,
        sedentary_days: sedentaryDays.length,
        avg_glucose_active: Math.round(avgGlucoseActive),
        avg_glucose_sedentary: Math.round(avgGlucoseSedentary),
        difference_mg_dl: Math.abs(diff).toFixed(0),
        direction,
      },
    };
  },
};
