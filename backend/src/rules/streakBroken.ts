/**
 * Streak-broken and comeback detection.
 *
 * Two behaviors this rule surfaces:
 *   1. A run of ≥7 consecutive "good" days that just ended.
 *   2. A restart after ≥5 consecutive "off" days.
 *
 * Applies to a small whitelist of daily-binary metrics that map cleanly to
 * "did the user do this today?" (meditated, read, hobby, journaled, hit step goal).
 */

import type { InsightRule, InsightResult } from "./types.js";
import type { DayRow } from "../services/dayFrame.js";
import { personalHighThreshold } from "./ruleHelper.js";

type BinaryMetric = {
  key: string;
  label: string;
  get(r: DayRow): boolean;
};

// Metrics whose predicate doesn't depend on a numeric threshold.
const STATIC_METRICS: BinaryMetric[] = [
  { key: "meditated",    label: "mindfulness sessions", get: r => !!r.meditated },
  { key: "read",         label: "reading",              get: r => !!r.read_book },
  { key: "hobby",        label: "a hobby",              get: r => !!r.had_hobby },
  { key: "journaled",    label: "journaling",           get: r => !!r.journaled },
];

export const StreakBrokenRule: InsightRule = {
  id: "streak_broken_or_restart",
  type: "streak",
  minDays: 14,
  tier: "daily",
  version: 1,
  actionable: true,

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    if (ctx.frame.rows.length < 14) return null;
    const rows = ctx.frame.rows;
    const last = rows[rows.length - 1];

    // Step-goal predicate uses this user's personal p67 bar (falls back to 8k).
    const stepT = await personalHighThreshold(ctx.userId, "steps", 8000);
    const stepCutoff = stepT.threshold;
    const METRICS: BinaryMetric[] = [
      ...STATIC_METRICS,
      { key: "step_goal", label: "your step goal", get: r => (r.steps ?? 0) >= stepCutoff },
    ];

    // Prioritize: broken streaks (larger ones first), then comebacks.
    let bestBroken: { metric: BinaryMetric; length: number } | null = null;
    let bestComeback: { metric: BinaryMetric; gap: number } | null = null;

    for (const m of METRICS) {
      // Broken: yesterday and prior were true for ≥7d, today is false.
      if (!m.get(last)) {
        let run = 0;
        for (let i = rows.length - 2; i >= 0; i--) {
          if (m.get(rows[i])) run++; else break;
        }
        if (run >= 7 && (!bestBroken || run > bestBroken.length)) {
          bestBroken = { metric: m, length: run };
        }
      }
      // Comeback: today true, prior ≥5 days false.
      if (m.get(last)) {
        let gap = 0;
        for (let i = rows.length - 2; i >= 0; i--) {
          if (!m.get(rows[i])) gap++; else break;
        }
        if (gap >= 5 && (!bestComeback || gap > bestComeback.gap)) {
          bestComeback = { metric: m, gap };
        }
      }
    }

    if (bestBroken) {
      return {
        title: `You broke a ${bestBroken.length}-day ${bestBroken.metric.label} streak`,
        description:
          `Your ${bestBroken.length}-day streak of ${bestBroken.metric.label} ended today. ` +
          `A one-day gap is nothing to worry about — momentum is easy to restart.`,
        confidence: "high",
        confidenceScore: 65,
        timesObserved: bestBroken.length,
        actionable: true,
        supportingData: {
          streak_days: bestBroken.length,
          event: "broken",
          metric: bestBroken.metric.label,
        },
      };
    }
    if (bestComeback) {
      return {
        title: `You just restarted after ${bestComeback.gap} days off`,
        description:
          `You returned to ${bestComeback.metric.label} today after ${bestComeback.gap} days off. ` +
          `Comebacks are the hardest part — nice work.`,
        confidence: "high",
        confidenceScore: 60,
        timesObserved: 1,
        actionable: true,
        supportingData: {
          days_off: bestComeback.gap,
          event: "comeback",
          metric: bestComeback.metric.label,
        },
      };
    }
    return null;
  },
};
