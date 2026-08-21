/**
 * Best-day recipe — Wave 3 cross-metric.
 *
 * Takes the user's top-quartile mood days from the last 60 days and finds
 * the 2–3 behaviors most over-represented on those days vs the rest,
 * reporting individual lift per behavior (not a combo). Different from
 * habitClusters (Apriori combos, top-20%) and bestDaysCommon (overall
 * wellness score, 90-day window).
 *
 * Tier: weekly.
 * Requires: ≥5 top-quartile days, lift threshold 1.4×, Welch + MDE + FDR.
 */

import type { InsightRule, InsightResult } from "./types.js";
import type { DayRow } from "../services/dayFrame.js";
import { welchTTest, passesMDE, effectiveSampleSize } from "./stats.js";
import { personalThresholds } from "./ruleHelper.js";

interface BehaviorDef {
  key: string;
  label: string;
  get(r: DayRow): boolean;
}

export const BestDayRecipeRule: InsightRule = {
  id: "best_day_recipe",
  type: "combined",
  minDays: 30,
  tier: "weekly",
  version: 1,
  actionable: true,
  primaryMetric: "mood_score",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    const rows = ctx.frame.rows.filter(r => r.mood_score != null);
    if (rows.length < 30) return null;

    // Top-quartile mood cutoff (p75).
    const moods = rows.map(r => r.mood_score!).sort((a, b) => a - b);
    const q75 = moods[Math.floor(moods.length * 0.75)];
    const topRows = rows.filter(r => r.mood_score! >= q75);
    const restRows = rows.filter(r => r.mood_score! < q75);

    if (topRows.length < 5 || restRows.length < 5) return null;

    // Personal thresholds for sleep + steps.
    const t = await personalThresholds(ctx.userId, [
      { metric: "sleep_secs", kind: "high", fallback: 25200 },
      { metric: "steps",      kind: "high", fallback: 8000 },
    ]);
    const sleepMinCutoff = t.sleep_secs_high.threshold / 60;
    const stepCutoff     = t.steps_high.threshold;
    const sleepLabel     = `${(sleepMinCutoff / 60).toFixed(sleepMinCutoff % 60 === 0 ? 0 : 1)}h+ sleep`;

    const BEHAVIORS: BehaviorDef[] = [
      { key: "sleep_hi",  label: sleepLabel,           get: r => (r.sleep_min ?? 0) >= sleepMinCutoff },
      { key: "steps_hi",  label: "active day",         get: r => (r.steps ?? 0) >= stepCutoff },
      { key: "exercise",  label: "some exercise",      get: r => (r.exercise_min ?? 0) > 0 },
      { key: "read",      label: "reading time",       get: r => !!r.read_book },
      { key: "hobby",     label: "hobby time",         get: r => !!r.had_hobby },
      { key: "mindful",   label: "mindfulness",        get: r => !!r.meditated },
      { key: "water",     label: "≥6 glasses water",   get: r => (r.water_glasses ?? 0) >= 6 },
      { key: "no_late",   label: "no late meals",      get: r => !r.late_meal },
      { key: "no_alc",    label: "no alcohol",         get: r => !(r.alcohol_g && r.alcohol_g > 0) },
    ];

    // For each behavior: gather mood scores on days it was/wasn't present,
    // run Welch t-test, compute lift (top-quartile rate in "with" vs "without").
    const topMoodArr = topRows.map(r => r.mood_score!);
    const restMoodArr = restRows.map(r => r.mood_score!);

    interface ScoredBehavior {
      label: string;
      lift: number;
      topPct: number;
      restPct: number;
      pValue: number;
      diff: number;
    }

    const scored: ScoredBehavior[] = [];
    const allPValues: number[] = [];
    const candidates: Array<{ b: BehaviorDef; stat: ReturnType<typeof welchTTest>; topPct: number; restPct: number }> = [];

    for (const b of BEHAVIORS) {
      const withRows = rows.filter(r => b.get(r));
      const withoutRows = rows.filter(r => !b.get(r));
      if (withRows.length < 5 || withoutRows.length < 5) continue;

      const withMoods = withRows.map(r => r.mood_score!);
      const withoutMoods = withoutRows.map(r => r.mood_score!);
      const effN = effectiveSampleSize(withMoods);
      const stat = welchTTest(withMoods, withoutMoods, effN);

      // Lift = fraction of "with" days in top-quartile vs fraction of "without" days.
      const topPct = withRows.filter(r => r.mood_score! >= q75).length / withRows.length;
      const restPct = withoutRows.filter(r => r.mood_score! >= q75).length / withoutRows.length;
      const lift = topPct / Math.max(0.01, restPct);

      if (lift < 1.4) continue;
      if (!passesMDE("mood_score", Math.abs(stat.meanA - stat.meanB))) continue;

      allPValues.push(stat.pValue);
      candidates.push({ b, stat, topPct, restPct });
    }

    if (candidates.length === 0) return null;

    // Simple BH correction among candidates.
    const sorted = [...candidates].sort((a, b) => a.stat.pValue - b.stat.pValue);
    const alpha = 0.10;
    let cutoff = -1;
    for (let k = 0; k < sorted.length; k++) {
      if (sorted[k].stat.pValue <= ((k + 1) / sorted.length) * alpha) cutoff = k;
    }
    const surviving = sorted.slice(0, cutoff + 1);
    if (surviving.length === 0) return null;

    // Rank by lift, take top 3.
    const top3 = surviving
      .sort((a, b) => {
        const lA = a.topPct / Math.max(0.01, a.restPct);
        const lB = b.topPct / Math.max(0.01, b.restPct);
        return lB - lA;
      })
      .slice(0, 3);

    const behaviorLabels = top3.map(c => c.b.label);
    const topLabel = behaviorLabels.join(", ");

    const supportingBehaviors = top3.map(c => ({
      behavior: c.b.label,
      top_quartile_rate_pct: Math.round(c.topPct * 100),
      other_days_rate_pct: Math.round(c.restPct * 100),
      lift_x: Number((c.topPct / Math.max(0.01, c.restPct)).toFixed(2)),
      mood_diff: Number((c.stat.meanA - c.stat.meanB).toFixed(2)),
      p_value: Number(c.stat.pValue.toFixed(3)),
    }));

    return {
      title: `Your best days this month tended to share: ${topLabel}`,
      description:
        `Looking at your top-quartile mood days over the last 60 days (${topRows.length} days), ` +
        `these behaviors appeared most often: ${topLabel}. ` +
        `Each was at least ${top3[0] ? (top3[0].topPct / Math.max(0.01, top3[0].restPct)).toFixed(1) : "1.4"}× more common on your best days than on other days.`,
      confidence: top3[0].stat.pValue < 0.05 ? "high" : "moderate",
      confidenceScore: Math.min(85, 40 + Math.round(top3.length * 10 + (1 - top3[0].stat.pValue) * 20)),
      timesObserved: topRows.length,
      pValue: top3[0].stat.pValue,
      effectSize: top3[0].stat.effectSize,
      supportingData: {
        top_quartile_days: topRows.length,
        other_days: restRows.length,
        mood_cutoff: Number(q75.toFixed(2)),
        behaviors: supportingBehaviors,
      },
    };
  },
};
