/**
 * Habit-cluster mining (Apriori-lite over daily binary flags).
 *
 * Finds the 2- or 3-behavior combination whose "top-20% mood day" lift is
 * the largest. That combo is surfaced as "your best days share these three
 * habits."
 */

import type { InsightRule, InsightResult } from "./types.js";
import type { DayRow } from "../services/dayFrame.js";

type Flag = { key: string; label: string; get(r: DayRow): boolean };

const FLAGS: Flag[] = [
  { key: "sleep7",   label: "sleep ≥ 7h",           get: r => (r.sleep_min ?? 0) >= 420 },
  { key: "steps8k",  label: "steps ≥ 8,000",        get: r => (r.steps ?? 0) >= 8000 },
  { key: "no_alc",   label: "no alcohol",           get: r => !r.alcohol_g },
  { key: "mind",     label: "mindfulness",          get: r => !!r.meditated },
  { key: "read",     label: "reading",              get: r => !!r.read_book },
  { key: "hobby",    label: "a hobby",              get: r => !!r.had_hobby },
  { key: "water",    label: "≥ 6 glasses water",    get: r => (r.water_glasses ?? 0) >= 6 },
  { key: "no_late",  label: "no late meals",        get: r => !r.late_meal },
];

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, chosen: T[]) => {
    if (chosen.length === k) { out.push(chosen.slice()); return; }
    for (let i = start; i < arr.length; i++) { chosen.push(arr[i]); rec(i + 1, chosen); chosen.pop(); }
  };
  rec(0, []);
  return out;
}

export const HabitClustersRule: InsightRule = {
  id: "habit_clusters_best_days",
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
    const moods = rows.map(r => r.mood_score!).sort((a, b) => b - a);
    const cut = moods[Math.floor(rows.length * 0.2)];
    const topRows = rows.filter(r => r.mood_score! >= cut);
    const base = topRows.length / rows.length;

    let best: { combo: string[]; lift: number; support: number; baseRate: number } | null = null;
    for (const size of [2, 3]) {
      for (const combo of combos(FLAGS, size)) {
        const matches = rows.filter(r => combo.every(f => f.get(r)));
        if (matches.length < 6) continue;
        const topMatches = matches.filter(r => r.mood_score! >= cut);
        const rate = topMatches.length / matches.length;
        const lift = rate / Math.max(0.01, base);
        if (lift > 1.5 && (!best || lift > best.lift)) {
          best = {
            combo: combo.map(f => f.label),
            lift,
            support: matches.length,
            baseRate: base,
          };
        }
      }
    }
    if (!best) return null;

    return {
      title: `Your best-mood days share: ${best.combo.join(" + ")}`,
      description:
        `When you do all of ${best.combo.join(", ")} on the same day, ${(best.lift * best.baseRate * 100).toFixed(0)}% of ` +
        `those days land in your top-mood tier vs a ${(best.baseRate * 100).toFixed(0)}% base rate — ` +
        `a lift of ${best.lift.toFixed(1)}×.`,
      confidence: best.lift > 2.5 ? "very_high" : best.lift > 2 ? "high" : "moderate",
      confidenceScore: Math.min(85, 40 + Math.round(best.lift * 20)),
      timesObserved: best.support,
      supportingData: {
        combo: best.combo.join(" + "),
        matching_days: best.support,
        lift_x: Number(best.lift.toFixed(2)),
        base_rate_pct: Number((best.baseRate * 100).toFixed(0)),
      },
    };
  },
};
