/**
 * Medication adherence vs outcomes.
 *
 * Compares mood/sleep/symptoms on days when ALL scheduled doses were taken
 * vs days when at least one dose was skipped. Needs ≥10 days per bucket.
 *
 * Tier: weekly, mutable, actionable.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { welchTTest, formatCI, passesMDE, effectiveSampleSize } from "./stats.js";
import { query } from "../db.js";

interface DoseSummary {
  log_date: string;
  taken: number;
  skipped: number;
  scheduled: number;
}

export const MedicationAdherenceOutcomesRule: InsightRule = {
  id: "medication_adherence_outcomes",
  type: "medication",
  minDays: 28,
  tier: "weekly",
  version: 1,
  actionable: true,
  primaryMetric: "mood_score",

  async run(userId, capabilities): Promise<InsightResult | null> {
    if (capabilities && !capabilities.has_medications) return null;

    // Get per-day dose summary for the last 90 days.
    const doseRows = await query<DoseSummary>(
      `SELECT
         mdl.log_date::text AS log_date,
         COUNT(*) FILTER (WHERE mdl.status = 'taken')   AS taken,
         COUNT(*) FILTER (WHERE mdl.status = 'skipped') AS skipped,
         (SELECT COUNT(*) FROM medication_schedule_slots mss2
          JOIN medications m2 ON m2.id = mss2.medication_id
          WHERE m2.user_id = $1 AND m2.active = true)   AS scheduled
       FROM medication_dose_logs mdl
       JOIN medications m ON m.id = mdl.medication_id
       WHERE m.user_id = $1
         AND mdl.log_date >= CURRENT_DATE - 90
       GROUP BY mdl.log_date
       ORDER BY mdl.log_date`,
      [userId]
    );

    if (doseRows.length < 20) return null;

    // Days where all doses taken vs days with ≥1 skipped.
    const fullDates = new Set<string>();
    const missedDates = new Set<string>();
    for (const r of doseRows) {
      const sched = Number(r.scheduled);
      if (sched === 0) continue;
      if (Number(r.skipped) === 0 && Number(r.taken) >= sched) {
        fullDates.add(r.log_date);
      } else if (Number(r.skipped) > 0) {
        missedDates.add(r.log_date);
      }
    }

    if (fullDates.size < 10 || missedDates.size < 10) return null;

    // Pull mood + sleep from daily_summaries for those dates.
    const summaryRows = await query<{ date: string; mood: number | null; sleep_min: number | null }>(
      `SELECT
         date::text AS date,
         (summary_data->'mood'->>'averageScore')::numeric  AS mood,
         (summary_data->'sleep'->>'minutes')::numeric       AS sleep_min
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90`,
      [userId]
    );

    const fullMood: number[] = [], missedMood: number[] = [];
    const fullSleep: number[] = [], missedSleep: number[] = [];

    for (const r of summaryRows) {
      const mood = Number(r.mood);
      const sleep = Number(r.sleep_min);
      if (fullDates.has(r.date)) {
        if (Number.isFinite(mood))  fullMood.push(mood);
        if (Number.isFinite(sleep)) fullSleep.push(sleep);
      } else if (missedDates.has(r.date)) {
        if (Number.isFinite(mood))  missedMood.push(mood);
        if (Number.isFinite(sleep)) missedSleep.push(sleep);
      }
    }

    // Require ≥10 pairs for each bucket.
    if (fullMood.length < 10 || missedMood.length < 10) return null;

    const effN = effectiveSampleSize(fullMood);
    const t = welchTTest(fullMood, missedMood, effN);
    if (t.pValue > 0.1) return null;
    if (!passesMDE("mood_score", Math.abs(t.meanA - t.meanB))) return null;

    const diff = t.meanA - t.meanB;
    const dir = diff > 0 ? "higher" : "lower";
    const ciStr = t.ci95 ? ` ${formatCI(t.ci95, 2)}.` : "";

    // Sleep supplement text.
    let sleepLine = "";
    if (fullSleep.length >= 8 && missedSleep.length >= 8) {
      const avgFull   = fullSleep.reduce((s, v) => s + v, 0) / fullSleep.length;
      const avgMissed = missedSleep.reduce((s, v) => s + v, 0) / missedSleep.length;
      const sDiff = avgFull - avgMissed;
      if (Math.abs(sDiff) >= 15) {
        sleepLine = ` Sleep also averaged ${Math.abs(sDiff).toFixed(0)} min ${sDiff > 0 ? "more" : "less"} on full-dose days.`;
      }
    }

    return {
      title: `Mood appears ${dir} on days when all doses are taken`,
      description:
        `On ${fullDates.size} days with full adherence, average mood was ${t.meanA.toFixed(1)}/5 ` +
        `vs ${t.meanB.toFixed(1)}/5 on ${missedDates.size} days with a missed dose.${ciStr}${sleepLine}`,
      confidence: t.pValue < 0.05 ? "high" : "moderate",
      confidenceScore: Math.round(Math.min(85, 35 + Math.abs(t.effectSize) * 40 + Math.min(fullMood.length, 20))),
      timesObserved: fullMood.length + missedMood.length,
      pValue: t.pValue,
      effectSize: t.effectSize,
      ci95: t.ci95,
      actionable: true,
      supportingData: {
        full_days: fullDates.size,
        missed_days: missedDates.size,
        avg_mood_full: Number(t.meanA.toFixed(2)),
        avg_mood_missed: Number(t.meanB.toFixed(2)),
        difference: Number(diff.toFixed(2)),
        direction: dir,
        p_value: Number(t.pValue.toFixed(3)),
      },
    };
  },
};
