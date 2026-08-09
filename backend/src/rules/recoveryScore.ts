/**
 * Composite Recovery Score.
 *
 * Blends sleep, resting HR (inverted), HRV, and previous-day activity load
 * into a single 0–100 daily recovery number. Fires as an insight when the
 * 7-day trailing average shifts meaningfully vs the prior 21 days.
 */

import type { InsightRule, InsightResult } from "./types.js";

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

/** Map a value's z-score against a series to a 0–100 sub-score. */
function subscore(v: number | null, series: number[], invert = false): number {
  if (v == null || !Number.isFinite(v) || series.length < 5) return 50;
  const m = series.reduce((s, x) => s + x, 0) / series.length;
  const sd = Math.sqrt(series.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, series.length - 1));
  if (sd === 0) return 50;
  const z = (v - m) / sd;
  const zAdj = invert ? -z : z;
  return clamp(50 + zAdj * 15, 0, 100);
}

export const RecoveryScoreRule: InsightRule = {
  id: "recovery_score",
  type: "trend",
  minDays: 21,
  tier: "daily",
  version: 1,
  actionable: false,
  primaryMetric: "mixed",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    const rows = ctx.frame.rows;
    if (rows.length < 21) return null;

    const sleepSeries    = ctx.frame.col("sleep_min");
    const hrSeries       = ctx.frame.col("resting_hr");
    const hrvSeries      = ctx.frame.col("hrv");
    const activitySeries = ctx.frame.col("exercise_min");

    const perDay = rows.map(r => {
      const parts = [
        subscore(r.sleep_min,    sleepSeries),
        subscore(r.resting_hr,   hrSeries, true),
        subscore(r.hrv,          hrvSeries),
        subscore(r.exercise_min, activitySeries),
      ];
      const good = parts.filter(p => Number.isFinite(p));
      if (good.length === 0) return null;
      return good.reduce((s, v) => s + v, 0) / good.length;
    }).filter((v): v is number => v != null);

    if (perDay.length < 21) return null;

    const recent = perDay.slice(-7);
    const prior  = perDay.slice(-28, -7);
    if (prior.length < 10) return null;
    const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const priorAvg  = prior.reduce((s, v) => s + v, 0) / prior.length;
    const delta = recentAvg - priorAvg;
    if (Math.abs(delta) < 4) return null;

    const dir = delta > 0 ? "up" : "down";
    return {
      title: `Your recovery score is trending ${dir}`,
      description:
        `Your composite recovery score (sleep, resting HR, HRV, activity) averaged ` +
        `${recentAvg.toFixed(0)} over the last 7 days vs ${priorAvg.toFixed(0)} the 3 weeks before — ` +
        `a shift of ${delta > 0 ? "+" : ""}${delta.toFixed(1)} points.`,
      confidence: Math.abs(delta) > 8 ? "very_high" : "high",
      confidenceScore: Math.min(90, 50 + Math.round(Math.abs(delta) * 3)),
      timesObserved: perDay.length,
      supportingData: {
        recovery_7d: Number(recentAvg.toFixed(1)),
        recovery_prior_21d: Number(priorAvg.toFixed(1)),
        difference: Number(delta.toFixed(1)),
        direction: dir,
      },
    };
  },
};
