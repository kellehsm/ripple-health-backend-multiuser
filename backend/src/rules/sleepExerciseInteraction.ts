/**
 * Sleep × exercise interaction — Wave 3 cross-metric.
 *
 * 2×2 interaction: compares next-day mood across four buckets:
 *   A) good sleep AND exercise
 *   B) good sleep only
 *   C) exercise only
 *   D) neither
 *
 * Reports the combination effect only when bucket A significantly exceeds
 * the best single-predictor bucket (B or C) by at least MDE, Welch + FDR.
 *
 * Tier: weekly.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { welchTTest, passesMDE, effectiveSampleSize, benjaminiHochberg } from "./stats.js";
import { personalThresholds } from "./ruleHelper.js";

export const SleepExerciseInteractionRule: InsightRule = {
  id: "sleep_exercise_interaction",
  type: "combined",
  minDays: 30,
  tier: "weekly",
  version: 1,
  actionable: true,
  primaryMetric: "mood_score",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    const { frame } = ctx;
    const rows = frame.rows.filter(r => r.mood_score != null);
    if (rows.length < 30) return null;

    // Personal thresholds for "good sleep" and "any exercise".
    const t = await personalThresholds(ctx.userId, [
      { metric: "sleep_secs", kind: "high", fallback: 25200 }, // 7h
    ]);
    const sleepMinCutoff = t.sleep_secs_high.threshold / 60;

    // Build next-day mood pairs: use lag 1 on the frame.
    // For each row with a mood score, check the previous day's sleep + exercise.
    interface PairRow { prevSleepMin: number | null; prevExerciseMin: number | null; nextMood: number }
    const pairs: PairRow[] = [];

    for (let i = 1; i < frame.rows.length; i++) {
      const prev = frame.rows[i - 1];
      const curr = frame.rows[i];
      if (curr.mood_score == null) continue;
      // Verify dates are consecutive.
      const prevD = new Date(prev.date + "T00:00:00Z");
      prevD.setUTCDate(prevD.getUTCDate() + 1);
      if (prevD.toISOString().slice(0, 10) !== curr.date) continue;
      pairs.push({
        prevSleepMin:    prev.sleep_min,
        prevExerciseMin: prev.exercise_min,
        nextMood:        curr.mood_score,
      });
    }

    if (pairs.length < 20) return null;

    const goodSleep = (p: PairRow) => p.prevSleepMin != null && p.prevSleepMin >= sleepMinCutoff;
    const anyExercise = (p: PairRow) => p.prevExerciseMin != null && p.prevExerciseMin > 0;

    const bucketA = pairs.filter(p => goodSleep(p) && anyExercise(p)).map(p => p.nextMood);
    const bucketB = pairs.filter(p => goodSleep(p) && !anyExercise(p)).map(p => p.nextMood);
    const bucketC = pairs.filter(p => !goodSleep(p) && anyExercise(p)).map(p => p.nextMood);
    const bucketD = pairs.filter(p => !goodSleep(p) && !anyExercise(p)).map(p => p.nextMood);

    if (bucketA.length < 5) return null;
    // Need at least one single bucket with ≥5 to compare.
    const bestSingle = bucketB.length >= bucketC.length ? bucketB : bucketC;
    if (bestSingle.length < 5) return null;

    const effN = effectiveSampleSize(bucketA);
    const tAB = welchTTest(bucketA, bucketB, effN);
    const tAC = welchTTest(bucketA, bucketC, effN);
    const tAD = bucketD.length >= 5 ? welchTTest(bucketA, bucketD, effN) : null;

    // FDR across comparisons.
    const pValues = [tAB.pValue, tAC.pValue, ...(tAD ? [tAD.pValue] : [])];
    const passing = benjaminiHochberg(pValues, 0.10);
    if (!passing[0] && !passing[1]) return null; // A must beat at least B or C after FDR.

    // The combination must beat the best single bucket.
    const meanA = tAB.meanA;
    const meanB = tAB.meanB;
    const meanC = tAC.meanB;
    const bestSingleMean = Math.max(meanB, meanC);
    const combinationLift = meanA - bestSingleMean;

    if (!passesMDE("mood_score", combinationLift)) return null;

    const sleepHLabel = `${(sleepMinCutoff / 60).toFixed(sleepMinCutoff % 60 === 0 ? 0 : 1)}h+ sleep`;

    return {
      title: `Sleep and exercise together appear linked to higher next-day mood than either alone`,
      description:
        `On the ${bucketA.length} days following both ${sleepHLabel} and some exercise, ` +
        `next-day mood averaged ${meanA.toFixed(1)}/5 — ` +
        `compared to ${meanB.toFixed(1)}/5 for sleep alone (${bucketB.length} days) ` +
        `and ${meanC.toFixed(1)}/5 for exercise alone (${bucketC.length} days). ` +
        `The combination appeared ${combinationLift.toFixed(1)} points above the stronger single predictor.`,
      confidence: (tAB.pValue < 0.05 || tAC.pValue < 0.05) ? "high" : "moderate",
      confidenceScore: Math.min(85, 40 + Math.round(Math.abs(combinationLift) * 30 + bucketA.length)),
      timesObserved: bucketA.length + bucketB.length + bucketC.length + bucketD.length,
      pValue: Math.min(tAB.pValue, tAC.pValue),
      effectSize: tAB.effectSize,
      ci95: tAB.ci95,
      supportingData: {
        bucket_sleep_and_exercise_n: bucketA.length,
        bucket_sleep_only_n: bucketB.length,
        bucket_exercise_only_n: bucketC.length,
        bucket_neither_n: bucketD.length,
        avg_mood_combined: Number(meanA.toFixed(2)),
        avg_mood_sleep_only: Number(meanB.toFixed(2)),
        avg_mood_exercise_only: Number(meanC.toFixed(2)),
        avg_mood_neither: tAD ? Number(tAD.meanB.toFixed(2)) : null,
        combination_lift_vs_best_single: Number(combinationLift.toFixed(2)),
        sleep_threshold_min: sleepMinCutoff,
        p_value_combined_vs_sleep: Number(tAB.pValue.toFixed(3)),
        p_value_combined_vs_exercise: Number(tAC.pValue.toFixed(3)),
      },
    };
  },
};
