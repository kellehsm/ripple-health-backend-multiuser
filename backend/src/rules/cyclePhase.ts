/**
 * Cycle-phase vs mood/energy/symptom frequency.
 *
 * Estimates cycle phases from logged cycle_day_logs (flow_intensity + energy_level)
 * and the DayFrame's mood scores. Compares the menstrual and luteal phases against
 * the follicular/ovulatory baseline using Welch's t-test.
 *
 * Tier: weekly (runs on Sundays — phase windows need full-week coverage).
 */

import type { InsightRule, InsightResult } from "./types.js";
import { welchTTest, formatCI, passesMDE, effectiveSampleSize } from "./stats.js";
import { query } from "../db.js";

/** Estimate cycle phase from flow_intensity and a cycle-start heuristic. */
function estimatePhase(
  flowIntensity: string | null,
  dayOfCycle: number | null,
): "menstrual" | "follicular" | "ovulatory" | "luteal" | null {
  if (flowIntensity && flowIntensity !== "none") return "menstrual";
  if (dayOfCycle == null) return null;
  if (dayOfCycle <= 5)  return "menstrual";
  if (dayOfCycle <= 13) return "follicular";
  if (dayOfCycle <= 16) return "ovulatory";
  return "luteal";
}

export const CyclePhaseRule: InsightRule = {
  id: "cycle_phase_mood_energy",
  type: "cycle",
  minDays: 56,
  tier: "weekly",
  version: 1,
  actionable: false,
  primaryMetric: "mood_score",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    if (!ctx.capabilities.has_cycle) return null;

    // Pull raw cycle logs for the last 120 days so we can compute day-of-cycle.
    const cycleRows = await query<{
      log_date: string;
      flow_intensity: string | null;
      energy_level: number | null;
      symptoms: string[] | null;
    }>(
      `SELECT log_date::text AS log_date, flow_intensity, energy_level, symptoms
       FROM cycle_day_logs
       WHERE user_id = $1
         AND log_date >= CURRENT_DATE - 120
       ORDER BY log_date`,
      [ctx.userId]
    );

    if (cycleRows.length < 28) return null;

    // Find cycle start dates (first day flow_intensity != 'none' after a gap).
    const cycleStarts: string[] = [];
    for (let i = 0; i < cycleRows.length; i++) {
      const r = cycleRows[i];
      const isFlow = r.flow_intensity && r.flow_intensity !== "none";
      if (!isFlow) continue;
      const prev = cycleRows[i - 1];
      const prevIsFlow = prev && prev.flow_intensity && prev.flow_intensity !== "none";
      if (!prevIsFlow) cycleStarts.push(r.log_date);
    }

    // Build a map: date → dayOfCycle (1-indexed).
    const dayOfCycleByDate = new Map<string, number>();
    for (const start of cycleStarts) {
      const startMs = new Date(start + "T00:00:00Z").getTime();
      for (let d = 0; d < 35; d++) {
        const date = new Date(startMs + d * 86400000).toISOString().slice(0, 10);
        if (!dayOfCycleByDate.has(date)) dayOfCycleByDate.set(date, d + 1);
      }
    }

    // Group DayFrame rows by phase, collecting mood and energy scores.
    const phaseData: Record<string, { mood: number[]; energy: number[] }> = {
      menstrual:  { mood: [], energy: [] },
      follicular: { mood: [], energy: [] },
      ovulatory:  { mood: [], energy: [] },
      luteal:     { mood: [], energy: [] },
    };

    for (const row of ctx.frame.rows) {
      const cycleRow = cycleRows.find(cr => cr.log_date === row.date);
      const flow = cycleRow?.flow_intensity ?? null;
      const doc = dayOfCycleByDate.get(row.date) ?? null;
      const phase = estimatePhase(flow, doc);
      if (!phase) continue;

      if (row.mood_score != null && Number.isFinite(row.mood_score)) {
        phaseData[phase].mood.push(row.mood_score);
      }
      if (cycleRow?.energy_level != null) {
        phaseData[phase].energy.push(cycleRow.energy_level);
      }
    }

    // Baseline: follicular + ovulatory combined.
    const baselineMood = [...phaseData.follicular.mood, ...phaseData.ovulatory.mood];
    const baselineEnergy = [...phaseData.follicular.energy, ...phaseData.ovulatory.energy];

    // Find the phase with the largest supported mood difference vs baseline.
    let bestResult: InsightResult | null = null;
    let bestEffect = 0;

    for (const phaseName of ["menstrual", "luteal"] as const) {
      const phaseMood = phaseData[phaseName].mood;
      if (phaseMood.length < 6 || baselineMood.length < 8) continue;

      const effN = effectiveSampleSize(phaseMood);
      const t = welchTTest(phaseMood, baselineMood, effN);
      if (t.pValue > 0.1) continue;
      if (!passesMDE("mood_score", Math.abs(t.meanA - t.meanB))) continue;
      if (Math.abs(t.effectSize) <= bestEffect) continue;

      bestEffect = Math.abs(t.effectSize);
      const diff = t.meanA - t.meanB;
      const dir = diff > 0 ? "higher" : "lower";
      const label = phaseName === "menstrual" ? "menstrual" : "luteal";
      const ciStr = t.ci95 ? ` ${formatCI(t.ci95, 2)}.` : "";

      // Energy supplement text.
      let energyLine = "";
      const phaseEnergy = phaseData[phaseName].energy;
      if (phaseEnergy.length >= 4 && baselineEnergy.length >= 4) {
        const avgE = phaseEnergy.reduce((s, v) => s + v, 0) / phaseEnergy.length;
        const baseE = baselineEnergy.reduce((s, v) => s + v, 0) / baselineEnergy.length;
        const eDiff = avgE - baseE;
        if (Math.abs(eDiff) >= 0.5) {
          energyLine = ` Energy logs show a similar pattern (${eDiff > 0 ? "+" : ""}${eDiff.toFixed(1)} avg points).`;
        }
      }

      bestResult = {
        title: `Mood tends to run ${dir} during your ${label} phase`,
        description:
          `Over the past 120 days, your mood averaged ${t.meanA.toFixed(1)}/5 during your ${label} phase ` +
          `vs ${t.meanB.toFixed(1)}/5 during your follicular/ovulatory window.${ciStr}${energyLine}`,
        confidence: t.pValue < 0.05 ? "high" : "moderate",
        confidenceScore: Math.round(Math.min(90, 40 + Math.abs(t.effectSize) * 40 + phaseMood.length)),
        timesObserved: phaseMood.length + baselineMood.length,
        pValue: t.pValue,
        effectSize: t.effectSize,
        ci95: t.ci95,
        supportingData: {
          phase: phaseName,
          phase_days: phaseMood.length,
          baseline_days: baselineMood.length,
          avg_mood_phase: Number(t.meanA.toFixed(2)),
          avg_mood_baseline: Number(t.meanB.toFixed(2)),
          difference: Number(diff.toFixed(2)),
          direction: dir,
          p_value: Number(t.pValue.toFixed(3)),
        },
      };
    }

    return bestResult;
  },
};
