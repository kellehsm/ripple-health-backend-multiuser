/**
 * Meal timing vs sleep — Wave 3 cross-metric.
 *
 * Late dinners (last meal logged after 8:30 PM local time) vs earlier
 * on the same day: compare next-night sleep duration AND sleep quality.
 * When glucose data is available, also compares overnight glucose CV.
 *
 * Different from lateMealsVsSleep: uses 8:30 PM threshold (not 9 PM UTC),
 * adds sleep duration, and includes overnight glucose CV when available.
 * Uses DayFrame + Welch + MDE + FDR.
 *
 * Tier: semiweekly.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { welchTTest, passesMDE, effectiveSampleSize, benjaminiHochberg } from "./stats.js";
import { query } from "../db.js";

interface LateMealDay { date: string }

async function getLateMealDays(userId: string): Promise<Set<string>> {
  // 20:30 EST = last_meal_hour > 20.5 in the user's local time.
  const rows = await query<{ date: string }>(
    `SELECT DISTINCT
       (logged_at AT TIME ZONE 'America/New_York')::date::text AS date
     FROM meals
     WHERE user_id = $1
       AND logged_at >= NOW() - INTERVAL '60 days'
       AND EXTRACT(HOUR FROM logged_at AT TIME ZONE 'America/New_York') * 60
           + EXTRACT(MINUTE FROM logged_at AT TIME ZONE 'America/New_York') > 1230`,  // 20*60+30 = 1230
    [userId]
  );
  return new Set(rows.map(r => r.date));
}

export const MealTimingSleepRule: InsightRule = {
  id: "meal_timing_sleep",
  type: "combined",
  minDays: 21,
  tier: "semiweekly",
  version: 1,
  actionable: true,
  primaryMetric: "sleep_quality",

  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    const { frame } = ctx;

    // Need both meal data and sleep data.
    const lateMealDates = await getLateMealDays(ctx.userId);
    if (lateMealDates.size < 5) return null;

    // For each row, look at the NEXT night's sleep (lag = 1 day).
    interface SleepPair {
      date: string;
      isLate: boolean;
      nextSleepMin: number | null;
      nextSleepQuality: number | null;
      nextGlucoseCV: number | null;
    }

    const pairs: SleepPair[] = [];
    for (let i = 0; i < frame.rows.length - 1; i++) {
      const curr = frame.rows[i];
      const next = frame.rows[i + 1];
      // Verify consecutive.
      const currD = new Date(curr.date + "T00:00:00Z");
      currD.setUTCDate(currD.getUTCDate() + 1);
      if (currD.toISOString().slice(0, 10) !== next.date) continue;
      // Must have at least sleep_min or sleep_quality on next day.
      if (next.sleep_min == null && next.sleep_quality == null) continue;

      pairs.push({
        date: curr.date,
        isLate: lateMealDates.has(curr.date),
        nextSleepMin:     next.sleep_min,
        nextSleepQuality: next.sleep_quality,
        nextGlucoseCV:    next.glucose_cv,
      });
    }

    const latePairs  = pairs.filter(p => p.isLate);
    const earlyPairs = pairs.filter(p => !p.isLate);

    if (latePairs.length < 5 || earlyPairs.length < 5) return null;

    // Sleep duration comparison (in minutes, then report as hours).
    const lateDurations  = latePairs.map(p => p.nextSleepMin).filter((v): v is number => v != null);
    const earlyDurations = earlyPairs.map(p => p.nextSleepMin).filter((v): v is number => v != null);

    // Sleep quality comparison.
    const lateQuality  = latePairs.map(p => p.nextSleepQuality).filter((v): v is number => v != null);
    const earlyQuality = earlyPairs.map(p => p.nextSleepQuality).filter((v): v is number => v != null);

    // Overnight glucose CV comparison (optional).
    const lateCV  = latePairs.map(p => p.nextGlucoseCV).filter((v): v is number => v != null);
    const earlyCV = earlyPairs.map(p => p.nextGlucoseCV).filter((v): v is number => v != null);

    const pValues: number[] = [];
    let tDuration = null, tQuality = null, tCV = null;

    if (lateDurations.length >= 5 && earlyDurations.length >= 5) {
      // MDE for sleep duration in seconds, but we have minutes — compare using minutes directly.
      // passesMDE("sleep_secs") expects seconds; convert MDE to 30min = 1800s → 30min.
      const effN = effectiveSampleSize(lateDurations);
      tDuration = welchTTest(lateDurations, earlyDurations, effN);
      pValues.push(tDuration.pValue);
    }
    if (lateQuality.length >= 5 && earlyQuality.length >= 5) {
      const effN = effectiveSampleSize(lateQuality);
      tQuality = welchTTest(lateQuality, earlyQuality, effN);
      pValues.push(tQuality.pValue);
    }
    if (lateCV.length >= 5 && earlyCV.length >= 5) {
      const effN = effectiveSampleSize(lateCV);
      tCV = welchTTest(lateCV, earlyCV, effN);
      pValues.push(tCV.pValue);
    }

    if (pValues.length === 0) return null;

    const passes = benjaminiHochberg(pValues, 0.10);
    let anyPasses = passes.some(Boolean);

    // Check MDE for at least one metric.
    let mdeOk = false;
    let pIdx = 0;
    if (tDuration) {
      // Convert minute diff to seconds for MDE check.
      if (passesMDE("sleep_secs", Math.abs(tDuration.meanA - tDuration.meanB) * 60) && passes[pIdx]) mdeOk = true;
      pIdx++;
    }
    if (tQuality) {
      if (passesMDE("sleep_quality", Math.abs(tQuality.meanA - tQuality.meanB)) && passes[pIdx]) mdeOk = true;
      pIdx++;
    }
    if (tCV) {
      if (passesMDE("glucose_cv", Math.abs(tCV.meanA - tCV.meanB)) && passes[pIdx]) mdeOk = true;
      pIdx++;
    }

    if (!anyPasses || !mdeOk) return null;

    // Build description from whichever metrics survived.
    const parts: string[] = [];
    if (tDuration && passes[0]) {
      const diffMin = tDuration.meanB - tDuration.meanA; // early - late (positive = early longer)
      const dir = diffMin > 0 ? "shorter" : "longer";
      parts.push(`sleep duration was ${Math.abs(diffMin).toFixed(0)} min ${dir} after late dinners`);
    }
    let qIdx = tDuration ? 1 : 0;
    if (tQuality && passes[qIdx]) {
      const diffQ = tQuality.meanB - tQuality.meanA;
      const dir = diffQ > 0 ? "lower" : "higher";
      parts.push(`sleep quality was ${dir} (${tQuality.meanA.toFixed(1)} vs ${tQuality.meanB.toFixed(1)})`);
    }
    let cvIdx = (tDuration ? 1 : 0) + (tQuality ? 1 : 0);
    if (tCV && passes[cvIdx]) {
      const diffCV = tCV.meanA - tCV.meanB; // late - early
      const dir = diffCV > 0 ? "higher" : "lower";
      parts.push(`overnight glucose variability was ${dir} (CV ${tCV.meanA.toFixed(1)}% vs ${tCV.meanB.toFixed(1)}%)`);
    }

    if (parts.length === 0) return null;

    const primaryP = Math.min(...pValues.filter((_, i) => passes[i]));

    return {
      title: `Eating after 8:30 PM appears associated with differences in next-night sleep`,
      description:
        `On ${latePairs.length} days with a meal after 8:30 PM: ${parts.join("; ")} ` +
        `(compared to ${earlyPairs.length} days with earlier last meals).`,
      confidence: primaryP < 0.05 ? "high" : "moderate",
      confidenceScore: Math.min(82, 40 + Math.round((1 - primaryP) * 30 + latePairs.length)),
      timesObserved: latePairs.length + earlyPairs.length,
      pValue: primaryP,
      effectSize: tDuration?.effectSize ?? tQuality?.effectSize ?? undefined,
      supportingData: {
        late_dinner_days: latePairs.length,
        early_dinner_days: earlyPairs.length,
        late_cutoff_local: "20:30",
        ...(tDuration ? {
          avg_sleep_min_late:  Number(tDuration.meanA.toFixed(1)),
          avg_sleep_min_early: Number(tDuration.meanB.toFixed(1)),
          sleep_duration_diff_min: Number((tDuration.meanB - tDuration.meanA).toFixed(1)),
        } : {}),
        ...(tQuality ? {
          avg_sleep_quality_late:  Number(tQuality.meanA.toFixed(2)),
          avg_sleep_quality_early: Number(tQuality.meanB.toFixed(2)),
        } : {}),
        ...(tCV ? {
          avg_glucose_cv_pct_late:  Number(tCV.meanA.toFixed(2)),
          avg_glucose_cv_pct_early: Number(tCV.meanB.toFixed(2)),
        } : {}),
      },
    };
  },
};
