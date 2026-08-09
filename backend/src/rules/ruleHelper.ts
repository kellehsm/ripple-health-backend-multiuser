/**
 * Shared helpers for insight rules.
 *
 * Only logic that appears in ≥5 rule files is abstracted here.
 * SQL queries are never touched — only the surrounding JS/TS.
 */

// Most rules look back 60 days. Rules that need a different window
// (cycle rules, chain/tri/quad/quint rules, etc.) declare their own constant.
export const LOOKBACK_DAYS = 60;

/**
 * Compute the arithmetic mean of a numeric field across an array of records.
 * Returns 0 for an empty array (callers should guard against that upstream).
 */
export function avgOf<T>(rows: T[], getValue: (r: T) => number): number {
  if (rows.length === 0) return 0;
  return rows.reduce((sum, r) => sum + getValue(r), 0) / rows.length;
}

/**
 * Split an array into bottom-tertile and top-tertile groups by a numeric field.
 *
 * The array is sorted ascending by `getValue`.  The bottom third is everything
 * at or below the value at index ⌊n/3⌋ − 1, and the top third is everything
 * at or above the value at index ⌈2n/3⌉.  This matches the pattern used
 * throughout the rule files (caffeineVsSleep, caffeineVsGlucose, sleepVsGlucose,
 * sleepVsSpending, sleepVsSteps, spendingVsMood, etc.).
 *
 * Returns `{ lowGroup, highGroup }`.  Both may be empty if the array is too
 * short — callers should check lengths before proceeding.
 */
export function tertileSplit<T>(
  rows: T[],
  getValue: (r: T) => number
): { lowGroup: T[]; highGroup: T[] } {
  const sorted = [...rows].sort((a, b) => getValue(a) - getValue(b));
  const n = sorted.length;
  const bottom33Idx = Math.floor(n / 3);
  const top33Idx = Math.ceil((n * 2) / 3);

  const lowThreshold = getValue(sorted[bottom33Idx - 1]);
  const highThreshold = getValue(sorted[top33Idx]);

  return {
    lowGroup: rows.filter(r => getValue(r) <= lowThreshold),
    highGroup: rows.filter(r => getValue(r) >= highThreshold),
  };
}

/**
 * Personalized-baseline bucket split.
 *
 * If a valid baseline (p33 / p67 with at least 10 samples) exists for this
 * user + metric, split the rows into "below p33" and "above p67" groups —
 * that's what "low for you" and "high for you" mean in this user's own
 * distribution.
 *
 * If no baseline exists, fall back to the caller-supplied hard thresholds
 * (the same constants the rule used before this feature landed).
 *
 * Callers still get to describe what "high" and "low" mean in the copy —
 * this helper only does the split.
 */
import { getBaseline, getBaselines, MetricId } from "../services/baselines.js";

/**
 * Resolve a "high for you" threshold — the p67 from the user's baseline if
 * we have a good one, otherwise the fallback constant. Symmetric helper for
 * "low for you" is `personalLowThreshold`.
 *
 * Used by the multi-metric rules (quint/quad/tri/chain) that define "perfect
 * days" via hardcoded cutoffs like sleep >= 7h + steps >= 8k. Replacing
 * those constants with baseline-aware ones makes composite rules meaningful
 * for users whose personal normal sits outside the global buckets.
 */
export async function personalHighThreshold(
  userId: string,
  metric: MetricId,
  fallback: number,
): Promise<{ threshold: number; usedBaseline: boolean }> {
  const b = await getBaseline(userId, metric);
  if (b && b.p67 != null && b.sample_size >= 10) {
    return { threshold: b.p67, usedBaseline: true };
  }
  return { threshold: fallback, usedBaseline: false };
}

export async function personalLowThreshold(
  userId: string,
  metric: MetricId,
  fallback: number,
): Promise<{ threshold: number; usedBaseline: boolean }> {
  const b = await getBaseline(userId, metric);
  if (b && b.p33 != null && b.sample_size >= 10) {
    return { threshold: b.p33, usedBaseline: true };
  }
  return { threshold: fallback, usedBaseline: false };
}

/**
 * Batch version — one round-trip when a composite rule needs several
 * personalized thresholds at once.
 */
export async function personalThresholds(
  userId: string,
  requests: Array<{ metric: MetricId; kind: "low" | "high"; fallback: number }>,
): Promise<Record<string, { threshold: number; usedBaseline: boolean }>> {
  const metrics = Array.from(new Set(requests.map((r) => r.metric)));
  const baselines = await getBaselines(userId, metrics);
  const out: Record<string, { threshold: number; usedBaseline: boolean }> = {};
  for (const req of requests) {
    const b = baselines.get(req.metric);
    const key = `${req.metric}_${req.kind}`;
    if (b && b.sample_size >= 10) {
      const val = req.kind === "high" ? b.p67 : b.p33;
      if (val != null) {
        out[key] = { threshold: val, usedBaseline: true };
        continue;
      }
    }
    out[key] = { threshold: req.fallback, usedBaseline: false };
  }
  return out;
}

export async function bucketByBaseline<T>(
  userId: string,
  metric: MetricId,
  rows: T[],
  getValue: (r: T) => number,
  fallback: { low: number; high: number },  // low=upper bound of low bucket; high=lower bound of high bucket
): Promise<{
  lowGroup: T[];
  highGroup: T[];
  usedBaseline: boolean;
  lowThreshold: number;
  highThreshold: number;
}> {
  const baseline = await getBaseline(userId, metric);
  const usedBaseline = !!(baseline && baseline.p33 != null && baseline.p67 != null && baseline.sample_size >= 10);
  const lowThreshold  = usedBaseline ? baseline!.p33! : fallback.low;
  const highThreshold = usedBaseline ? baseline!.p67! : fallback.high;
  return {
    lowGroup:  rows.filter((r) => getValue(r) <= lowThreshold),
    highGroup: rows.filter((r) => getValue(r) >= highThreshold),
    usedBaseline,
    lowThreshold,
    highThreshold,
  };
}
