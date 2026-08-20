/**
 * Seasonality — year-over-year comparison for the same 30-day window.
 * Only fires when ≥ 365 days of data is available.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { query } from "../db.js";
import { welchTTest } from "./stats.js";

export const SeasonalYoYRule: InsightRule = {
  id: "seasonal_yoy_mood",
  type: "trend",
  minDays: 365,
  tier: "weekly",
  version: 1,
  actionable: false,
  primaryMetric: "mood_score",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    // Current-30-day window comes from the in-memory frame (no extra DB query).
    const recentRows = ctx.frame.rows.slice(-30);
    const nowVals = recentRows
      .map(r => r.mood_score)
      .filter((v): v is number => v != null && Number.isFinite(v));

    // Prior-year window still requires a DB query.
    const priorRows = await query<{ v: number }>(
      `SELECT (summary_data->'mood'->>'averageScore')::numeric AS v
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - INTERVAL '395 days'
         AND date <  CURRENT_DATE - INTERVAL '365 days'
         AND summary_data->'mood'->>'averageScore' IS NOT NULL`,
      [ctx.userId]
    );
    const yr = priorRows.map(r => Number(r.v));
    if (nowVals.length < 10 || yr.length < 10) return null;

    const now = nowVals;
    const t = welchTTest(now, yr);
    if (t.pValue > 0.1) return null;
    if (Math.abs(t.meanA - t.meanB) < 0.3) return null;

    const dir = t.meanA > t.meanB ? "higher" : "lower";
    return {
      title: `Your mood this month is running ${dir} than a year ago`,
      description:
        `In the last 30 days your average mood was ${t.meanA.toFixed(1)}/5, vs ${t.meanB.toFixed(1)}/5 during ` +
        `the same window one year ago. Year-over-year descriptive comparison only.`,
      confidence: t.pValue < 0.02 ? "high" : "moderate",
      confidenceScore: Math.round((1 - Math.min(t.pValue, 0.2) / 0.2) * 70),
      timesObserved: now.length + yr.length,
      pValue: t.pValue,
      supportingData: {
        avg_mood_now: Number(t.meanA.toFixed(2)),
        avg_mood_prior_year: Number(t.meanB.toFixed(2)),
        mood_difference: Number((t.meanA - t.meanB).toFixed(2)),
        p_value: Number(t.pValue.toFixed(3)),
        direction: dir,
      },
    };
  },
};
