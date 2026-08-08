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
