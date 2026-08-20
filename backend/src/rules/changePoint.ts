/**
 * Change-point rule.
 *
 * Scans key metrics for a persistent shift (mean-break) in the past 90 days
 * and surfaces the most striking one with its date, before/after means, and
 * p-value.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { findChangePoint } from "../services/causality.js";
import { confidenceFromStats } from "./stats.js";

const CANDIDATES: Array<{ field: any; label: string; unit: string }> = [
  { field: "resting_hr",  label: "resting heart rate",   unit: " bpm" },
  { field: "sleep_min",   label: "average sleep",        unit: " min" },
  { field: "glucose_avg", label: "average glucose",      unit: " mg/dL" },
  { field: "steps",       label: "daily steps",          unit: "" },
  { field: "mood_score",  label: "mood score",           unit: "/5" },
];

export const ChangePointRule: InsightRule = {
  id: "change_point",
  type: "trend",
  minDays: 45,
  tier: "weekly",
  version: 1,
  actionable: false,

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    let best: { cp: any; label: string; unit: string; field: string } | null = null;
    let testsPerformed = 0;
    for (const c of CANDIDATES) {
      const series = ctx.frame.colWithDates(c.field);
      if (series.length < 30) continue;
      const cp = findChangePoint(series);
      if (!cp) continue;
      testsPerformed++;
      if (!best || cp.pValue < best.cp.pValue) {
        best = { cp, label: c.label, unit: c.unit, field: c.field as any };
      }
    }
    if (!best) return null;
    // Bonferroni: multiply winning p by number of tests performed (cap at 1).
    best.cp = { ...best.cp, pValue: Math.min(1, best.cp.pValue * Math.max(1, testsPerformed)) };

    const dir = best.cp.delta > 0 ? "up" : "down";
    return {
      title: `A shift in your ${best.label} around ${best.cp.date}`,
      description:
        `Your ${best.label} appears to have shifted ${dir} around ${best.cp.date} — averaging ` +
        `${best.cp.before.toFixed(1)}${best.unit} before and ${best.cp.after.toFixed(1)}${best.unit} after ` +
        `(a ${best.cp.delta > 0 ? "+" : ""}${best.cp.delta.toFixed(1)}${best.unit} change).`,
      confidence: confidenceFromStats(best.cp.pValue, Math.abs(best.cp.delta)).label,
      confidenceScore: confidenceFromStats(best.cp.pValue, Math.abs(best.cp.delta)).score,
      timesObserved: 1,
      pValue: best.cp.pValue,
      supportingData: {
        change_date: best.cp.date,
        metric: best.label,
        before_mean: Number(best.cp.before.toFixed(2)),
        after_mean: Number(best.cp.after.toFixed(2)),
        difference: Number(best.cp.delta.toFixed(2)),
        p_value: Number(best.cp.pValue.toFixed(3)),
        direction: dir,
      },
    };
  },
};
