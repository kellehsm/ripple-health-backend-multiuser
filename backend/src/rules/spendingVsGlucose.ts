import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

const FIXED_CATEGORIES = [
  'Rent / Mortgage',
  'Utilities',
  'Home',
  'Health',
  'health',
  'subscriptions',
  'Subscriptions',
  'income / transfer',
  'Income / Transfer',
];

export const SpendingVsGlucoseRule: InsightRule = {
  id: "spending_vs_glucose",
  type: "spending",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    // Join daily_summaries with impulse spending (excluding fixed categories) for last 60 days
    const rows = await query<{ date: string; avg_glucose: number; total_spend: number }>(
      `SELECT
         ds.date::text AS date,
         (ds.summary_data->'glucose'->>'averageGlucose')::numeric AS avg_glucose,
         COALESCE(se.total, 0) AS total_spend
       FROM daily_summaries ds
       LEFT JOIN (
         SELECT
           logged_at::date AS day,
           SUM(amount) AS total
         FROM spending_entries
         WHERE user_id = $1
           AND logged_at >= CURRENT_DATE - 60
           AND category NOT IN (${FIXED_CATEGORIES.map((_, i) => `$${i + 2}`).join(", ")})
         GROUP BY logged_at::date
       ) se ON se.day = ds.date
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - 60
         AND ds.summary_data->'glucose'->>'averageGlucose' IS NOT NULL
         AND COALESCE(se.total, 0) > 0
       ORDER BY ds.date DESC`,
      [userId, ...FIXED_CATEGORIES]
    );

    if (rows.length < 8) return null; // need enough for top/bottom 25% splits

    // Sort by glucose to find quartile thresholds
    const glucoseValues = rows.map(r => Number(r.avg_glucose)).sort((a, b) => a - b);
    const p25 = glucoseValues[Math.floor(glucoseValues.length * 0.25)];
    const p75 = glucoseValues[Math.floor(glucoseValues.length * 0.75)];

    if (p25 === p75) return null;

    const highGlucoseDays = rows.filter(r => Number(r.avg_glucose) >= p75);
    const lowGlucoseDays  = rows.filter(r => Number(r.avg_glucose) <= p25);

    if (highGlucoseDays.length < 4 || lowGlucoseDays.length < 4) return null;

    const avgSpendHighGlucose = highGlucoseDays.reduce((s, r) => s + Number(r.total_spend), 0) / highGlucoseDays.length;
    const avgSpendLowGlucose  = lowGlucoseDays.reduce((s, r) => s + Number(r.total_spend), 0) / lowGlucoseDays.length;

    const diff = avgSpendHighGlucose - avgSpendLowGlucose; // positive = more spending on high-glucose days
    if (Math.abs(diff) < 3) return null;

    const refAmount = Math.max(avgSpendHighGlucose, avgSpendLowGlucose, 1);
    const effectRatio = Math.abs(diff) / refAmount;
    const { score, label } = calcConfidence(
      Math.min(highGlucoseDays.length, lowGlucoseDays.length),
      effectRatio
    );

    const avgGlucoseHigh = highGlucoseDays.reduce((s, r) => s + Number(r.avg_glucose), 0) / highGlucoseDays.length;
    const avgGlucoseLow  = lowGlucoseDays.reduce((s, r) => s + Number(r.avg_glucose), 0) / lowGlucoseDays.length;

    const spendDir = diff > 0 ? "higher" : "lower";
    const absDiff  = Math.abs(diff);

    return {
      title: `Spending tends to be ${spendDir} on higher-glucose days`,
      description: `Over the last 60 days, on your highest-glucose days (avg ${Math.round(avgGlucoseHigh)} mg/dL) you spent an average of $${avgSpendHighGlucose.toFixed(0)}, compared to $${avgSpendLowGlucose.toFixed(0)} on your lowest-glucose days (avg ${Math.round(avgGlucoseLow)} mg/dL) — a difference of about $${absDiff.toFixed(0)}.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        high_glucose_days: highGlucoseDays.length,
        low_glucose_days: lowGlucoseDays.length,
        avg_glucose_high_days: Math.round(avgGlucoseHigh),
        avg_glucose_low_days: Math.round(avgGlucoseLow),
        avg_spend_high_glucose: avgSpendHighGlucose.toFixed(2),
        avg_spend_low_glucose: avgSpendLowGlucose.toFixed(2),
        difference_dollars: absDiff.toFixed(2),
        spend_direction: spendDir,
      },
    };
  },
};
