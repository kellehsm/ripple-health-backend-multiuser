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

export const SpendingCyclePhaseRule: InsightRule = {
  id: "spending_cycle_phase",
  type: "spending",
  minDays: 35,

  async run(userId: string): Promise<InsightResult | null> {
    // Join cycle_day_logs with impulse spending (excluding fixed categories) for last 90 days
    const rows = await query<{ log_date: string; flow_intensity: string; total_spend: number }>(
      `SELECT
         cdl.log_date::text AS log_date,
         cdl.flow_intensity,
         COALESCE(se.total, 0) AS total_spend
       FROM cycle_day_logs cdl
       LEFT JOIN (
         SELECT
           logged_at::date AS day,
           SUM(amount) AS total
         FROM spending_entries
         WHERE user_id = $1
           AND logged_at >= CURRENT_DATE - 90
           AND category NOT IN (${FIXED_CATEGORIES.map((_, i) => `$${i + 2}`).join(", ")})
         GROUP BY logged_at::date
       ) se ON se.day = cdl.log_date
       WHERE cdl.user_id = $1
         AND cdl.log_date >= CURRENT_DATE - 90
         AND cdl.flow_intensity IS NOT NULL
         AND COALESCE(se.total, 0) > 0
       ORDER BY cdl.log_date DESC`,
      [userId, ...FIXED_CATEGORIES]
    );

    if (rows.length < 10) return null;

    // Menstrual = flow present; non-menstrual = flow_intensity = 'none'
    const menstrualDays    = rows.filter(r => ['spotting', 'light', 'medium', 'heavy'].includes(r.flow_intensity));
    const nonMenstrualDays = rows.filter(r => r.flow_intensity === 'none');

    if (menstrualDays.length < 5 || nonMenstrualDays.length < 5) return null;

    const avgSpendMenstrual    = menstrualDays.reduce((s, r) => s + Number(r.total_spend), 0) / menstrualDays.length;
    const avgSpendNonMenstrual = nonMenstrualDays.reduce((s, r) => s + Number(r.total_spend), 0) / nonMenstrualDays.length;

    const diff = avgSpendMenstrual - avgSpendNonMenstrual; // positive = more spending during period
    if (Math.abs(diff) < 2) return null;

    const refAmount = Math.max(avgSpendMenstrual, avgSpendNonMenstrual, 1);
    const effectRatio = Math.abs(diff) / refAmount;
    const { score, label } = calcConfidence(
      Math.min(menstrualDays.length, nonMenstrualDays.length),
      effectRatio
    );

    const direction = diff > 0 ? "higher" : "lower";
    const absDiff   = Math.abs(diff);

    return {
      title: `Spending tends to be ${direction} during your period`,
      description: `Over the last 90 days, your average daily impulse spending was $${avgSpendMenstrual.toFixed(0)} on menstrual days and $${avgSpendNonMenstrual.toFixed(0)} on non-menstrual days — a difference of about $${absDiff.toFixed(0)}.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        menstrual_days: menstrualDays.length,
        non_menstrual_days: nonMenstrualDays.length,
        avg_spend_menstrual: avgSpendMenstrual.toFixed(2),
        avg_spend_non_menstrual: avgSpendNonMenstrual.toFixed(2),
        difference_dollars: absDiff.toFixed(2),
        direction,
      },
    };
  },
};
