/**
 * Worst-days-common — the inverse of BestDaysCommon.
 *
 * Reverse-engineers what behaviors correlate with the user's *worst* 20% of
 * mood days. Users learn as much from anti-patterns as from success recipes.
 */

import type { InsightRule, InsightResult } from "./types.js";
import type { DayRow } from "../services/dayFrame.js";
import { personalThresholds } from "./ruleHelper.js";

type Flag = { key: string; label: string; get(r: DayRow): boolean };

// Non-personal flags (values are self-referential or symptom-defined).
const STATIC_FLAGS: Flag[] = [
  { key: "drank",         label: "any alcohol",          get: r => (r.alcohol_g ?? 0) > 0 },
  { key: "no_hobby",      label: "no hobby",             get: r => !r.had_hobby },
  { key: "late_meal",     label: "a late meal",          get: r => !!r.late_meal },
  { key: "high_caff",     label: "caffeine ≥ 250 mg",    get: r => (r.caffeine_mg ?? 0) >= 250 },
  { key: "high_screen",   label: "screen-heavy evening", get: r => false }, // placeholder if screen-time lands in frame
];

export const WorstDaysCommonRule: InsightRule = {
  id: "worst_days_common",
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

    // Personal low-bar for sleep + steps — user's own p33 falls back to
    // 6h / 3000 steps. Symmetric to habit_clusters using p67 as the high bar.
    const t = await personalThresholds(ctx.userId, [
      { metric: "sleep_secs", kind: "low",  fallback: 21600 },
      { metric: "steps",      kind: "low",  fallback: 3000 },
    ]);
    const lowSleepMin = t.sleep_secs_low.threshold / 60;
    const lowStep     = t.steps_low.threshold;
    const dynamicFlags: Flag[] = [
      { key: "sleep_short", label: `sleep under ${(lowSleepMin / 60).toFixed(lowSleepMin % 60 === 0 ? 0 : 1)}h`,
        get: r => (r.sleep_min ?? 999) < lowSleepMin },
      { key: "sedentary",   label: `steps under ${Math.round(lowStep).toLocaleString()}`,
        get: r => (r.steps ?? 999999) < lowStep },
    ];
    const FLAGS: Flag[] = [...dynamicFlags, ...STATIC_FLAGS];

    const moods = rows.map(r => r.mood_score!).sort((a, b) => a - b);
    const cut = moods[Math.floor(rows.length * 0.2)];
    const bottomRows = rows.filter(r => r.mood_score! <= cut);
    const base = bottomRows.length / rows.length;

    let best: { flag: Flag; lift: number; matches: number } | null = null;
    for (const f of FLAGS) {
      const matches = rows.filter(r => f.get(r));
      if (matches.length < 5) continue;
      const worstMatches = matches.filter(r => r.mood_score! <= cut);
      const rate = worstMatches.length / matches.length;
      const lift = rate / Math.max(0.01, base);
      if (lift > 1.5 && (!best || lift > best.lift)) {
        best = { flag: f, lift, matches: matches.length };
      }
    }
    if (!best) return null;

    return {
      title: `Your low-mood days most often include: ${best.flag.label}`,
      description:
        `Days with ${best.flag.label} are ${best.lift.toFixed(1)}× more likely to land in your bottom-mood ` +
        `tier than a random day (observed on ${best.matches} days).`,
      confidence: best.lift > 2 ? "high" : "moderate",
      confidenceScore: Math.min(80, 40 + Math.round(best.lift * 15)),
      timesObserved: best.matches,
      supportingData: {
        pattern: best.flag.label,
        lift_x: Number(best.lift.toFixed(2)),
        matching_days: best.matches,
      },
    };
  },
};
