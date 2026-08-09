/**
 * Symptom → trigger lag discovery.
 *
 * Given days with any reported symptom (from symptom_logs), search 1–3 days
 * back for the behavior/metric that most differs from a non-symptom baseline.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { query } from "../db.js";
import { welchTTest } from "./stats.js";

const CANDIDATE_FIELDS: Array<{ field: any; label: string }> = [
  { field: "alcohol_g",   label: "alcohol grams" },
  { field: "caffeine_mg", label: "caffeine mg" },
  { field: "sleep_min",   label: "sleep minutes" },
  { field: "stress_score", label: "stress score" },
  { field: "spend_total", label: "spending" },
];

export const SymptomLagTriggerRule: InsightRule = {
  id: "symptom_lag_trigger",
  type: "combined",
  minDays: 30,
  tier: "weekly",
  version: 1,
  actionable: true,

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    // Pull the last 90 days of symptom log dates. Table may not exist for all
    // users — swallow errors.
    let symptomDates: Set<string>;
    try {
      const rows = await query<{ d: string }>(
        `SELECT DISTINCT logged_at::date::text AS d
         FROM symptom_logs
         WHERE user_id = $1 AND logged_at >= CURRENT_DATE - 90`,
        [ctx.userId]
      );
      symptomDates = new Set(rows.map(r => r.d));
    } catch {
      return null;
    }
    if (symptomDates.size < 5) return null;

    const rows = ctx.frame.rows;
    let best: { field: string; label: string; lag: number; delta: number; p: number } | null = null;
    for (const c of CANDIDATE_FIELDS) {
      for (const lag of [1, 2, 3]) {
        const symptomPrior: number[] = [], normalPrior: number[] = [];
        for (let i = lag; i < rows.length; i++) {
          const target = rows[i];
          const trigger = rows[i - lag];
          const v = (trigger as any)[c.field];
          if (typeof v !== "number" || !Number.isFinite(v)) continue;
          if (symptomDates.has(target.date)) symptomPrior.push(v);
          else normalPrior.push(v);
        }
        if (symptomPrior.length < 4 || normalPrior.length < 10) continue;
        const t = welchTTest(symptomPrior, normalPrior);
        if (t.pValue > 0.1) continue;
        const delta = t.meanA - t.meanB;
        if (!best || t.pValue < best.p) {
          best = { field: c.field as any, label: c.label, lag, delta, p: t.pValue };
        }
      }
    }
    if (!best) return null;

    const dir = best.delta > 0 ? "higher" : "lower";
    return {
      title: `Symptom days often follow ${dir} ${best.label} ${best.lag} day(s) prior`,
      description:
        `On the ${best.lag}-day lag, days you logged a symptom had ${dir} ${best.label} beforehand ` +
        `(delta ${best.delta > 0 ? "+" : ""}${best.delta.toFixed(1)}, p=${best.p.toFixed(3)}). Correlation only.`,
      confidence: best.p < 0.02 ? "high" : "moderate",
      confidenceScore: Math.min(80, 40 + Math.round((1 - best.p) * 40)),
      timesObserved: symptomDates.size,
      pValue: best.p,
      supportingData: {
        trigger_metric: best.label,
        lag_days: best.lag,
        difference: Number(best.delta.toFixed(2)),
        direction: dir,
        p_value: Number(best.p.toFixed(3)),
      },
    };
  },
};
