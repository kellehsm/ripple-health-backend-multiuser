import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const GlucoseVariabilityRule: InsightRule = {
  id: "glucose_variability",
  type: "glucose",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ avg_glucose: number }>(
      `SELECT (summary_data->'glucose'->>'average')::numeric AS avg_glucose
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 30
         AND summary_data->'glucose'->>'average' IS NOT NULL
         AND (summary_data->'glucose'->>'average')::numeric > 50`,
      [userId]
    );

    if (rows.length < 14) return null;

    const values = rows.map(r => Number(r.avg_glucose));
    const n = values.length;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
    const stddev = Math.sqrt(variance);
    const cv = (stddev / mean) * 100;

    let title: string;
    let description: string;
    let effectRatio: number;

    if (cv > 20) {
      title = "Your glucose has been notably variable day-to-day";
      description = `Over the last 30 days, your daily average glucose has varied considerably — a coefficient of variation of ${cv.toFixed(0)}% (std dev ${stddev.toFixed(0)} mg/dL around a mean of ${mean.toFixed(0)} mg/dL). Elevated day-to-day variability can reflect differences in diet, activity, or stress patterns across days.`;
      effectRatio = Math.min(1, (cv - 15) / 25);
    } else if (cv < 8) {
      title = "Your glucose has been impressively stable day-to-day";
      description = `Over the last 30 days, your daily average glucose has stayed close to ${mean.toFixed(0)} mg/dL — a coefficient of variation of just ${cv.toFixed(0)}% (std dev ${stddev.toFixed(0)} mg/dL), indicating consistent day-to-day regulation.`;
      effectRatio = Math.min(1, (10 - cv) / 10);
    } else {
      return null;
    }

    const { score, label } = calcConfidence(n, effectRatio);

    return {
      title,
      description,
      confidence: label,
      confidenceScore: score,
      timesObserved: n,
      supportingData: {
        days_analyzed: n,
        mean_glucose: mean.toFixed(0),
        glucose_stddev: stddev.toFixed(1),
        glucose_cv_pct: cv.toFixed(0),
      },
    };
  },
};
