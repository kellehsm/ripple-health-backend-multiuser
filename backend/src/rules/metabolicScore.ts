/**
 * Metabolic Day Score.
 *
 * Combines glucose time-in-range, coefficient-of-variation, and mean glucose
 * into a single 0–100 daily number. Fires when 7-day avg has shifted
 * meaningfully vs prior 21 days. Only runs if the user has glucose data.
 */

import type { InsightRule, InsightResult } from "./types.js";

function tirScore(tir: number | null): number {
  if (tir == null) return 50;
  return Math.max(0, Math.min(100, tir * 100));
}

function cvScore(cv: number | null): number {
  // CV of 0.20 = poor, 0.36+ = very poor. Below 0.36 gets partial credit.
  if (cv == null) return 50;
  return Math.max(0, Math.min(100, 100 - (cv - 0.15) * 250));
}

function meanScore(avg: number | null): number {
  if (avg == null) return 50;
  const target = 110;
  const dev = Math.abs(avg - target);
  return Math.max(0, 100 - dev * 1.5);
}

export const MetabolicScoreRule: InsightRule = {
  id: "metabolic_score",
  type: "glucose",
  minDays: 21,
  tier: "daily",
  version: 1,
  actionable: false,
  primaryMetric: "glucose_mg_dl",
  clinicalRisk: false,

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    if (!ctx.capabilities.has_glucose) return null;
    const rows = ctx.frame.rows;
    const perDay = rows.map(r => {
      const parts = [tirScore(r.glucose_tir), cvScore(r.glucose_cv), meanScore(r.glucose_avg)]
        .filter(v => Number.isFinite(v));
      if (parts.length === 0) return null;
      return parts.reduce((s, v) => s + v, 0) / parts.length;
    }).filter((v): v is number => v != null);

    if (perDay.length < 21) return null;
    const recent = perDay.slice(-7);
    const prior  = perDay.slice(-28, -7);
    if (prior.length < 10) return null;

    const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const priorAvg  = prior.reduce((s, v) => s + v, 0) / prior.length;
    const delta = recentAvg - priorAvg;
    if (Math.abs(delta) < 4) return null;
    const dir = delta > 0 ? "improved" : "worsened";

    return {
      title: `Your metabolic score has ${dir}`,
      description:
        `Your composite metabolic day score (time-in-range, variability, mean glucose) averaged ` +
        `${recentAvg.toFixed(0)} in the last 7 days vs ${priorAvg.toFixed(0)} the 3 weeks before — a ` +
        `${delta > 0 ? "+" : ""}${delta.toFixed(1)}-point shift.`,
      confidence: Math.abs(delta) > 8 ? "very_high" : "high",
      confidenceScore: Math.min(90, 50 + Math.round(Math.abs(delta) * 3)),
      timesObserved: perDay.length,
      supportingData: {
        metabolic_7d: Number(recentAvg.toFixed(1)),
        metabolic_prior_21d: Number(priorAvg.toFixed(1)),
        difference: Number(delta.toFixed(1)),
        direction: dir,
      },
    };
  },
};
