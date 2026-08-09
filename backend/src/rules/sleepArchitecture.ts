/**
 * Sleep architecture — surfaces the biggest predictor among REM %, deep %,
 * and wake count for the user's next-morning mood.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { lagPairColumns } from "../services/dayFrame.js";
import { welchTTest } from "./stats.js";

export const SleepArchitectureRule: InsightRule = {
  id: "sleep_architecture_mood",
  type: "sleep",
  minDays: 30,
  tier: "weekly",
  version: 1,
  actionable: true,
  primaryMetric: "mood_score",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    const variants: Array<{ field: any; label: string; hint: string }> = [
      { field: "rem_min",    label: "REM sleep",       hint: "more" },
      { field: "deep_min",   label: "deep sleep",      hint: "more" },
      { field: "wake_count", label: "wake-up count",   hint: "fewer" },
    ];

    let best: { label: string; hint: string; t: ReturnType<typeof welchTTest> } | null = null;
    for (const v of variants) {
      const pairs = lagPairColumns(ctx.frame, v.field as any, "mood_score", 0);
      if (pairs.a.length < 15) continue;
      const sorted = pairs.a.map((val, i) => ({ val, i })).sort((x, y) => x.val - y.val);
      const cut = Math.floor(sorted.length / 3);
      if (cut < 3) continue;
      const lowIdx = new Set(sorted.slice(0, cut).map(x => x.i));
      const highIdx = new Set(sorted.slice(-cut).map(x => x.i));
      const lowMood: number[] = [], highMood: number[] = [];
      for (let i = 0; i < pairs.b.length; i++) {
        if (lowIdx.has(i))  lowMood.push(pairs.b[i]);
        if (highIdx.has(i)) highMood.push(pairs.b[i]);
      }
      if (lowMood.length < 4 || highMood.length < 4) continue;
      const t = welchTTest(highMood, lowMood);
      if (t.pValue > 0.1) continue;
      if (!best || t.pValue < best.t.pValue) best = { label: v.label, hint: v.hint, t };
    }
    if (!best) return null;

    const dir = best.t.meanA > best.t.meanB ? "better" : "worse";
    return {
      title: `${best.hint === "more" ? "More" : "Fewer"} ${best.label} tracks with ${dir} mood`,
      description:
        `On nights in your top tertile for ${best.label}, next-day mood averaged ${best.t.meanA.toFixed(1)}/5 ` +
        `vs ${best.t.meanB.toFixed(1)}/5 on bottom-tertile nights.`,
      confidence: best.t.pValue < 0.01 ? "very_high" : "high",
      confidenceScore: Math.round((1 - Math.min(best.t.pValue, 0.2) / 0.2) * 70),
      timesObserved: best.t.nA + best.t.nB,
      pValue: best.t.pValue,
      effectSize: best.t.effectSize,
      ci95: best.t.ci95,
      supportingData: {
        architecture_metric: best.label,
        avg_mood_top:    Number(best.t.meanA.toFixed(2)),
        avg_mood_bottom: Number(best.t.meanB.toFixed(2)),
        mood_difference: Number((best.t.meanA - best.t.meanB).toFixed(2)),
        p_value:         Number(best.t.pValue.toFixed(3)),
      },
    };
  },
};
