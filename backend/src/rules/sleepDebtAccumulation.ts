import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

const TARGET_SLEEP_HOURS = 8;
const TARGET_SLEEP_MINUTES = TARGET_SLEEP_HOURS * 60;
const DEBT_THRESHOLD_HOURS = 4;
const DEBT_THRESHOLD_MINUTES = DEBT_THRESHOLD_HOURS * 60;

export const SleepDebtAccumulationRule: InsightRule = {
  id: "sleep_debt_accumulation",
  type: "sleep",
  minDays: 14,
  tier: "daily",
  actionable: true,

  async run(userId: string): Promise<InsightResult | null> {
    // Fetch the last 14 days of sleep duration (in minutes) ordered ascending
    const rows = await query<{ date: string; duration_minutes: string }>(
      `SELECT
         date::text,
         (summary_data->'sleep'->>'duration')::numeric AS duration_minutes
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 14
         AND summary_data->'sleep'->>'duration' IS NOT NULL
         AND (summary_data->'sleep'->>'duration')::numeric > 0
       ORDER BY date ASC`,
      [userId]
    );

    if (rows.length < 7) return null;

    // Split into current week (last 7 days) and prior week (days 8–14)
    const sorted = rows.slice().reverse(); // newest first
    const currentWeek = sorted.slice(0, 7);
    const priorWeek   = sorted.slice(7, 14);

    if (currentWeek.length < 7) return null;

    // Calculate 7-day rolling sleep debt for current week
    const currentDebtMinutes = currentWeek.reduce((sum, r) => {
      const deficit = TARGET_SLEEP_MINUTES - Number(r.duration_minutes);
      return sum + Math.max(0, deficit);
    }, 0);

    if (currentDebtMinutes < DEBT_THRESHOLD_MINUTES) return null;

    // Calculate prior week debt for trend
    let trendLabel = "";
    let debtGrowing: boolean | null = null;
    if (priorWeek.length >= 7) {
      const priorDebtMinutes = priorWeek.reduce((sum, r) => {
        const deficit = TARGET_SLEEP_MINUTES - Number(r.duration_minutes);
        return sum + Math.max(0, deficit);
      }, 0);
      const debtDelta = currentDebtMinutes - priorDebtMinutes;
      debtGrowing = debtDelta > 30; // more than 30 min change is meaningful
      if (Math.abs(debtDelta) <= 30) {
        trendLabel = "roughly the same as last week";
      } else if (debtGrowing) {
        trendLabel = `${Math.round(debtDelta / 60 * 10) / 10} h more than last week — and growing`;
      } else {
        trendLabel = `${Math.round(Math.abs(debtDelta) / 60 * 10) / 10} h less than last week — improving`;
      }
    }

    const currentDebtHours = (currentDebtMinutes / 60).toFixed(1);
    const avgShortfall = (currentDebtMinutes / currentWeek.length / 60).toFixed(1);

    // Confidence scales with how far over the threshold the debt is
    const excessOverThreshold = currentDebtMinutes - DEBT_THRESHOLD_MINUTES;
    const effectRatio = Math.min(1, excessOverThreshold / DEBT_THRESHOLD_MINUTES);
    const { score, label } = calcConfidence(currentWeek.length, effectRatio);

    const trendSuffix = trendLabel ? ` This is ${trendLabel}.` : "";

    return {
      title: `You've built up over ${DEBT_THRESHOLD_HOURS} hours of sleep debt this week`,
      description: `Over the past 7 days you slept an average of ${avgShortfall} h less than the 8-hour target per night, totalling ${currentDebtHours} h of sleep debt.${trendSuffix} Prioritising sleep in the coming days may help you recover.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: currentWeek.length,
      primaryMetric: "sleep_duration_minutes",
      actionable: true,
      supportingData: {
        days_in_current_week: currentWeek.length,
        current_7d_debt_minutes: Math.round(currentDebtMinutes),
        current_7d_debt_hours: currentDebtHours,
        target_sleep_hours: TARGET_SLEEP_HOURS,
        avg_nightly_shortfall_hours: avgShortfall,
        debt_growing: debtGrowing,
        trend_label: trendLabel || null,
      },
    };
  },
};
