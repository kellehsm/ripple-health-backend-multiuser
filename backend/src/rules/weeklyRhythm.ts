/**
 * Weekly rhythm — detects a specific day-of-week that is consistently the
 * user's best or worst for mood/spending. Only fires if the effect is
 * statistically credible.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { welchTTest, passesMDE } from "./stats.js";

const DAY_LABEL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

async function run(ctx: any, field: "mood_score" | "spend_total", niceLabel: string, unit: string, primaryMetric: string): Promise<InsightResult | null> {
  const byDow: number[][] = Array.from({ length: 7 }, () => []);
  for (const r of ctx.frame.rows) {
    const v = r[field];
    if (typeof v === "number" && Number.isFinite(v)) byDow[r.dow].push(v);
  }
  if (byDow.some(g => g.length < 4)) return null;

  const overall = byDow.flat();
  if (overall.length < 30) return null;
  const grandMean = overall.reduce((s, v) => s + v, 0) / overall.length;

  let bestDow = -1, biggest = 0, direction: "high" | "low" = "high";
  const stats: { p: number; diff: number; mean: number } = { p: 1, diff: 0, mean: 0 };
  for (let d = 0; d < 7; d++) {
    const group = byDow[d];
    const others = overall.filter((_, i) => Math.floor(i / (overall.length / 7)) !== d);
    if (others.length < 10 || group.length < 4) continue;
    const t = welchTTest(group, others);
    const diff = Math.abs(t.meanA - t.meanB);
    if (diff > biggest && t.pValue < 0.1) {
      biggest = diff;
      bestDow = d;
      direction = t.meanA > t.meanB ? "high" : "low";
      stats.p = t.pValue; stats.diff = t.meanA - t.meanB; stats.mean = t.meanA;
    }
  }
  if (bestDow === -1) return null;
  if (!passesMDE(primaryMetric, Math.abs(stats.diff))) return null;

  const label = direction === "high" ? "best" : "worst";
  return {
    title: `${DAY_LABEL[bestDow]} are consistently your ${label} ${niceLabel} day`,
    description:
      `${niceLabel[0].toUpperCase() + niceLabel.slice(1)} on ${DAY_LABEL[bestDow].toLowerCase()} averages ` +
      `${stats.mean.toFixed(1)}${unit} vs your overall average of ${grandMean.toFixed(1)}${unit} — a ` +
      `difference of ${stats.diff > 0 ? "+" : ""}${stats.diff.toFixed(1)}${unit}.`,
    confidence: (stats.p < 0.02 ? "very_high" : stats.p < 0.05 ? "high" : "moderate") as InsightResult["confidence"],
    confidenceScore: Math.min(85, 45 + Math.round((1 - stats.p) * 40)),
    timesObserved: overall.length,
    pValue: stats.p,
    supportingData: {
      day_of_week: DAY_LABEL[bestDow],
      day_mean: Number(stats.mean.toFixed(2)),
      other_days_mean: Number((stats.mean - stats.diff).toFixed(2)),
      difference: Number(stats.diff.toFixed(2)),
      direction,
      p_value: Number(stats.p.toFixed(3)),
    },
  };
}

export const WeeklyRhythmMoodRule: InsightRule = {
  id: "weekly_rhythm_mood",
  type: "mood",
  minDays: 45,
  tier: "weekly",
  version: 1,
  actionable: true,
  primaryMetric: "mood_score",
  async run(): Promise<InsightResult | null> { return null; },
  async runWithContext(ctx) { return run(ctx, "mood_score", "mood", "/5", "mood_score"); },
};

export const WeeklyRhythmSpendRule: InsightRule = {
  id: "weekly_rhythm_spend",
  type: "spending",
  minDays: 45,
  tier: "weekly",
  version: 1,
  actionable: true,
  primaryMetric: "spending_dollars",
  async run(): Promise<InsightResult | null> { return null; },
  async runWithContext(ctx) { return run(ctx, "spend_total", "spending", " $", "spending_dollars"); },
};
