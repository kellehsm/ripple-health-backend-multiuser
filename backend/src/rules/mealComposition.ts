/**
 * Meal composition — which macronutrient tracks with the biggest glucose
 * response. Picks the strongest correlation among carbs / protein / fat / fiber
 * (partial-correlation-lite: each vs glucose_avg).
 */

import type { InsightRule, InsightResult } from "./types.js";
import { pearson } from "../services/causality.js";

const MACROS: Array<{ field: any; label: string; unit: string }> = [
  { field: "carbs_g",   label: "carbohydrates", unit: "g" },
  { field: "protein_g", label: "protein",       unit: "g" },
  { field: "fat_g",     label: "fat",           unit: "g" },
  { field: "fiber_g",   label: "fiber",         unit: "g" },
];

export const MealCompositionRule: InsightRule = {
  id: "meal_composition_glucose",
  type: "glucose",
  minDays: 30,
  tier: "weekly",
  version: 1,
  actionable: true,
  primaryMetric: "glucose_mg_dl",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    if (!ctx.capabilities.has_glucose) return null;
    let best: { macro: typeof MACROS[number]; r: number } | null = null;
    for (const m of MACROS) {
      const xs: number[] = [], ys: number[] = [];
      for (const row of ctx.frame.rows) {
        const x = (row as any)[m.field];
        const y = row.glucose_avg;
        if (typeof x === "number" && typeof y === "number") { xs.push(x); ys.push(y); }
      }
      if (xs.length < 20) continue;
      const r = pearson(xs, ys);
      if (Math.abs(r) < 0.25) continue;
      if (!best || Math.abs(r) > Math.abs(best.r)) best = { macro: m, r };
    }
    if (!best) return null;

    const dir = best.r > 0 ? "higher" : "lower";
    return {
      title: `Days higher in ${best.macro.label} track with ${dir} glucose`,
      description:
        `Across the past 90 days, days with more ${best.macro.label} (${best.macro.unit}) show a ` +
        `${Math.abs(best.r).toFixed(2)} correlation with your daily average glucose. ` +
        `Descriptive only — many factors influence glucose.`,
      confidence: Math.abs(best.r) > 0.45 ? "high" : "moderate",
      confidenceScore: Math.min(80, 40 + Math.round(Math.abs(best.r) * 60)),
      timesObserved: ctx.frame.rows.length,
      supportingData: {
        macro: best.macro.label,
        correlation_r: Number(best.r.toFixed(2)),
        direction: dir,
      },
    };
  },
};
