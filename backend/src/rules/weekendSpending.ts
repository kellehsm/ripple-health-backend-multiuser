import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const WeekendSpendingRule: InsightRule = {
  id: "weekend_spending",
  type: "spending",
  minDays: 20,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; total: number; dow: number }>(
      `SELECT
         logged_at::date AS date,
         SUM(amount) AS total,
         EXTRACT(DOW FROM logged_at) AS dow
       FROM spending_entries
       WHERE user_id = $1 AND logged_at >= CURRENT_DATE - 60
       GROUP BY logged_at::date, EXTRACT(DOW FROM logged_at)
       ORDER BY date DESC`,
      [userId]
    );

    if (rows.length < 20) return null;

    const weekendDays = rows.filter(r => Number(r.dow) === 0 || Number(r.dow) === 6);
    const weekdayDays = rows.filter(r => Number(r.dow) >= 1 && Number(r.dow) <= 5);

    if (weekendDays.length < 4 || weekdayDays.length < 10) return null;

    const avgWeekend = weekendDays.reduce((s, r) => s + Number(r.total), 0) / weekendDays.length;
    const avgWeekday = weekdayDays.reduce((s, r) => s + Number(r.total), 0) / weekdayDays.length;

    const diff = avgWeekend - avgWeekday;
    if (Math.abs(diff) < 5) return null; // less than $5 difference, not notable

    const refAmount = Math.max(avgWeekend, avgWeekday, 1);
    const effectRatio = Math.abs(diff) / refAmount;
    const { score, label } = calcConfidence(Math.min(weekendDays.length, weekdayDays.length), effectRatio);

    const highDay = diff > 0 ? "weekends" : "weekdays";
    const lowDay  = diff > 0 ? "weekdays" : "weekends";
    const multiplier = (Math.max(avgWeekend, avgWeekday) / Math.max(Math.min(avgWeekend, avgWeekday), 1)).toFixed(1);

    return {
      title: `Spending tends to be higher on ${highDay}`,
      description: `Over the last 60 days, your average daily spending was $${avgWeekend.toFixed(0)} on weekends and $${avgWeekday.toFixed(0)} on weekdays — about ${multiplier}× difference.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        weekend_days: weekendDays.length,
        weekday_days: weekdayDays.length,
        avg_spend_weekend: avgWeekend.toFixed(2),
        avg_spend_weekday: avgWeekday.toFixed(2),
        difference_dollars: Math.abs(diff).toFixed(2),
        higher_on: highDay,
      },
    };
  },
};
