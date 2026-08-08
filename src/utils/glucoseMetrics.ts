// ─── Glucose Metrics Utilities ───────────────────────────────────────────────
// Pure functions extracted from OverviewScreen.tsx.
// None of these use React hooks or state.

export type GlucoseReading = { recorded_at: string; mg_dl: number };

/**
 * Computes time-in-range as a percentage (70–180 mg/dL).
 * Returns null if there are fewer than 3 readings.
 */
export function computeTIR(readings: GlucoseReading[]): number | null {
  if (readings.length < 3) return null;
  const inRange = readings.filter(r => Number(r.mg_dl) >= 70 && Number(r.mg_dl) <= 180).length;
  return Math.round((inRange / readings.length) * 100);
}

/**
 * Computes a weighted average glucose across time-of-day buckets from the weekly digest.
 */
export function weekGlucoseAvg(
  glucose_by_tod: Partial<Record<string, { avg: number; count: number }>>,
): number | null {
  let totalWeighted = 0;
  let totalCount = 0;
  for (const v of Object.values(glucose_by_tod)) {
    if (v) { totalWeighted += v.avg * v.count; totalCount += v.count; }
  }
  return totalCount > 0 ? Math.round(totalWeighted / totalCount) : null;
}

/**
 * Linearly interpolates a glucose value at timestamp `t` (ms since epoch)
 * from a sorted array of readings. Returns null if the nearest reading is
 * more than 20 minutes away and there is no bracketing reading.
 */
export function interpolateGlucose(readings: GlucoseReading[], t: number): number | null {
  if (readings.length === 0) return null;
  let before: GlucoseReading | null = null;
  let after: GlucoseReading | null = null;
  for (const r of readings) {
    const rt = new Date(r.recorded_at).getTime();
    if (rt <= t) before = r;
    else if (!after) after = r;
  }
  if (!before && !after) return null;
  if (!before) return Number(after!.mg_dl);
  if (!after) {
    return (t - new Date(before.recorded_at).getTime()) <= 20 * 60 * 1000
      ? Number(before.mg_dl)
      : null;
  }
  const bt = new Date(before.recorded_at).getTime();
  const at = new Date(after.recorded_at).getTime();
  return Number(before.mg_dl) + ((t - bt) / (at - bt)) * (Number(after.mg_dl) - Number(before.mg_dl));
}

/**
 * Maps a glucose value to a Y pixel coordinate within a chart.
 * @param val      The glucose value to position.
 * @param minVal   The minimum glucose value shown on the chart.
 * @param maxVal   The maximum glucose value shown on the chart.
 * @param chartH   Total chart height in pixels.
 * @param padT     Top padding in pixels.
 * @param padB     Bottom padding in pixels.
 */
export function glucoseY(
  val: number,
  minVal: number,
  maxVal: number,
  chartH: number,
  padT: number,
  padB: number,
): number {
  const usableH = chartH - padT - padB;
  return padT + usableH - ((val - minVal) / (maxVal - minVal)) * usableH;
}

/**
 * Maps a timestamp to an X pixel coordinate within a chart time window.
 * @param t           Timestamp in ms since epoch.
 * @param windowStart Start of the visible window in ms.
 * @param windowEnd   End of the visible window in ms.
 * @param chartW      Total chart width in pixels.
 * @param padL        Left padding in pixels.
 */
export function eventX(
  t: number,
  windowStart: number,
  windowEnd: number,
  chartW: number,
  padL: number,
): number {
  return padL + ((t - windowStart) / (windowEnd - windowStart)) * (chartW - padL);
}
