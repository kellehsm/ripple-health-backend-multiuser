/**
 * Time-lagged: poor sleep on night N → elevated glucose on morning N+1.
 *
 * Uses lagPairColumns to align (last night's sleep, today's glucose) and
 * a proper Welch's t-test on the top/bottom sleep tertile. This is the
 * *directional* version of sleep_vs_glucose.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { lagPairColumns } from "../services/dayFrame.js";
import { welchTTest, formatCI, passesMDE } from "./stats.js";

export const LagSleepGlucoseRule: InsightRule = {
  id: "lag_sleep_glucose",
  type: "glucose",
  minDays: 30,
  tier: "semiweekly",
  version: 1,
  actionable: true,
  primaryMetric: "glucose_mg_dl",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    if (!ctx.capabilities.has_glucose) return null;
    const pairs = lagPairColumns(ctx.frame, "sleep_min", "glucose_avg", 1);
    if (pairs.a.length < 20) return null;

    // Split by sleep tertiles (lower third vs upper third).
    const sorted = [...pairs.a].map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const cut = Math.floor(sorted.length / 3);
    const lowIdx = new Set(sorted.slice(0, cut).map(x => x.i));
    const highIdx = new Set(sorted.slice(-cut).map(x => x.i));
    const lowGlu: number[] = [], highGlu: number[] = [];
    for (let i = 0; i < pairs.b.length; i++) {
      if (lowIdx.has(i))  lowGlu.push(pairs.b[i]);
      if (highIdx.has(i)) highGlu.push(pairs.b[i]);
    }
    if (lowGlu.length < 6 || highGlu.length < 6) return null;

    const t = welchTTest(lowGlu, highGlu);
    if (t.pValue > 0.1) return null;
    if (!passesMDE("glucose_mg_dl", Math.abs(t.meanA - t.meanB))) return null;

    const dir = t.meanA > t.meanB ? "higher" : "lower";
    const ci = t.ci95 ? formatCI(t.ci95, 1) : null;
    return {
      title: `Nights of poor sleep run into ${dir}-glucose mornings`,
      description:
        `On mornings after your bottom-tertile sleep nights, your average glucose was ${t.meanA.toFixed(0)} mg/dL, ` +
        `vs ${t.meanB.toFixed(0)} mg/dL after your best sleep nights.` +
        (ci ? ` ${ci}.` : ""),
      confidence: t.pValue < 0.01 ? "very_high" : t.pValue < 0.05 ? "high" : "moderate",
      confidenceScore: Math.round((1 - Math.min(t.pValue, 0.2) / 0.2) * 60 + Math.min(Math.abs(t.effectSize) / 0.8, 1) * 40),
      timesObserved: pairs.a.length,
      pValue: t.pValue,
      effectSize: t.effectSize,
      ci95: t.ci95,
      supportingData: {
        pairs_analyzed: pairs.a.length,
        avg_glucose_poor_sleep: Number(t.meanA.toFixed(1)),
        avg_glucose_good_sleep: Number(t.meanB.toFixed(1)),
        difference_mg_dl: Number((t.meanA - t.meanB).toFixed(1)),
        p_value: Number(t.pValue.toFixed(3)),
        lag_days: 1,
        direction: dir,
      },
    };
  },
};
