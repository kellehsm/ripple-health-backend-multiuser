/**
 * Dose-response: caffeine intake vs same-night sleep quality.
 *
 * Finds the caffeine dose (mg) where sleep quality sharply drops. Uses
 * findDoseInflection so the reported number is an interpretable threshold,
 * not just a "high vs low" comparison.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { findDoseInflection } from "../services/causality.js";
import { passesMDE } from "./stats.js";

export const CaffeineDoseRule: InsightRule = {
  id: "caffeine_dose_response",
  type: "sleep",
  minDays: 30,
  tier: "weekly",
  version: 1,
  actionable: true,
  primaryMetric: "sleep_quality",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    const pairs: { dose: number; outcome: number }[] = [];
    for (const r of ctx.frame.rows) {
      if (r.caffeine_mg != null && r.sleep_quality != null) {
        pairs.push({ dose: r.caffeine_mg, outcome: r.sleep_quality });
      }
    }
    if (pairs.length < 20) return null;

    const inf = findDoseInflection(pairs, 5);
    if (!inf) return null;
    if (!passesMDE("sleep_quality", Math.abs(inf.delta))) return null;

    return {
      title: `Sleep quality drops after ~${Math.round(inf.threshold)} mg caffeine`,
      description:
        `Above roughly ${Math.round(inf.threshold)} mg of caffeine, your same-night sleep quality averaged ` +
        `${inf.above.toFixed(1)}/10, vs ${inf.below.toFixed(1)}/10 below that threshold — a drop of ` +
        `${Math.abs(inf.delta).toFixed(1)} points.`,
      confidence: Math.abs(inf.delta) > 1 ? "high" : "moderate",
      confidenceScore: Math.min(80, 40 + Math.round(Math.abs(inf.delta) * 20)),
      timesObserved: pairs.length,
      supportingData: {
        threshold_mg: Math.round(inf.threshold),
        avg_sleep_quality_above: Number(inf.above.toFixed(2)),
        avg_sleep_quality_below: Number(inf.below.toFixed(2)),
        quality_difference: Number(inf.delta.toFixed(2)),
      },
    };
  },
};
