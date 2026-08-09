/**
 * Causality-adjacent helpers.
 *
 * The insights engine can only detect correlation, but we can lean the copy
 * in the direction of causality when:
 *   - the correlation survives at a temporal lag (X on day N predicts Y on N+1)
 *   - the residual correlation survives controlling for known confounders
 *     (weekend, cycle phase, weather)
 *   - a change-point in the joint distribution can be pinpointed to a specific
 *     date range
 *   - a dose-response curve shows a monotonic (or clearly-inflected) shape
 *
 * These helpers are pure functions over DayFrame data — no DB reads.
 */

import type { DayFrame, DayRow } from "./dayFrame.js";
import { welchTTest, effectiveSampleSize, lag1Autocorr } from "../rules/stats.js";

/**
 * Pearson correlation of two aligned numeric arrays.
 */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Granger-style predictive-lift check.
 * Compare Y[t] ~ Y[t-1]   vs   Y[t] ~ Y[t-1] + X[t-1].
 * Returns the R^2 gain — if it's substantially > 0, X carries information
 * about future Y that Y's own history doesn't already contain.
 */
export function grangerLift(x: number[], y: number[]): { lift: number; nEff: number } {
  if (x.length < 20 || y.length < 20) return { lift: 0, nEff: 0 };
  // Build lag pairs
  const yLag: number[] = [], xLag: number[] = [], yNow: number[] = [];
  const n = Math.min(x.length, y.length);
  for (let t = 1; t < n; t++) {
    yNow.push(y[t]); yLag.push(y[t - 1]); xLag.push(x[t - 1]);
  }
  const r_y = Math.abs(pearson(yLag, yNow));
  const r_yx = Math.max(r_y, Math.abs(pearson(xLag, yNow)));
  // Rough R^2 gain via difference-of-squares.
  const lift = Math.max(0, r_yx * r_yx - r_y * r_y);
  return { lift, nEff: effectiveSampleSize(y) };
}

/**
 * Partial-out a confounder. Regress `y` on `z` linearly and return the
 * residuals — subsequent correlations against those residuals control for z.
 */
export function partialOut(y: number[], z: number[]): number[] {
  const n = Math.min(y.length, z.length);
  if (n < 3) return y.slice();
  let sy = 0, sz = 0;
  for (let i = 0; i < n; i++) { sy += y[i]; sz += z[i]; }
  const my = sy / n, mz = sz / n;
  let num = 0, denom = 0;
  for (let i = 0; i < n; i++) {
    num += (z[i] - mz) * (y[i] - my);
    denom += (z[i] - mz) ** 2;
  }
  const slope = denom === 0 ? 0 : num / denom;
  const intercept = my - slope * mz;
  return y.map((v, i) => v - (slope * z[i] + intercept));
}

/**
 * Residualize a column against weekend + cycle phase (menstrual vs not).
 * Cheap and covers the two biggest confounders in this app's data.
 */
export function residualizeAgainstCommonConfounders(
  frame: DayFrame,
  field: keyof DayRow,
): { residuals: number[]; dates: string[] } {
  const y: number[] = [];
  const weekend: number[] = [];
  const menstrual: number[] = [];
  const dates: string[] = [];
  for (const r of frame.rows) {
    const v = (r as any)[field];
    if (typeof v === "number" && Number.isFinite(v)) {
      y.push(v);
      weekend.push(r.isWeekend ? 1 : 0);
      menstrual.push(r.cycle_phase === "menstrual" ? 1 : 0);
      dates.push(r.date);
    }
  }
  if (y.length < 8) return { residuals: y, dates };
  let residuals = partialOut(y, weekend);
  residuals = partialOut(residuals, menstrual);
  return { residuals, dates };
}

/**
 * Change-point detection via a windowed mean-shift search.
 * Given a time-ordered series, find the split index that maximizes the
 * absolute t-statistic between before/after — subject to each side having
 * at least `minSide` observations.
 *
 * Returns the split date and the magnitude of the shift (only when the
 * shift is significant at p<0.05 uncorrected).
 */
export function findChangePoint(
  series: { date: string; value: number }[],
  minSide = 14,
): { date: string; before: number; after: number; delta: number; pValue: number } | null {
  if (series.length < 2 * minSide) return null;

  let best: { i: number; t: number } | null = null;
  const values = series.map(s => s.value);

  for (let i = minSide; i <= series.length - minSide; i++) {
    const before = values.slice(0, i);
    const after = values.slice(i);
    const r = welchTTest(before, after);
    const tAbs = Math.abs((r.meanA - r.meanB)) / Math.max(1e-9, (r.ci95[1] - r.ci95[0]) / 3.92);
    if (!best || tAbs > best.t) best = { i, t: tAbs };
  }
  if (!best) return null;

  const before = values.slice(0, best.i);
  const after = values.slice(best.i);
  const r = welchTTest(before, after);
  if (r.pValue > 0.05) return null;
  return {
    date: series[best.i].date,
    before: r.meanA,
    after: r.meanB,
    delta: r.meanB - r.meanA,
    pValue: r.pValue,
  };
}

/**
 * Dose-response inflection: fit a piecewise-constant curve over sorted
 * dose bins and return the bin where the outcome mean shifts most sharply.
 * Cheap but interpretable for post-caffeine sleep quality, etc.
 */
export function findDoseInflection(
  pairs: { dose: number; outcome: number }[],
  bins = 5,
): { threshold: number; below: number; above: number; delta: number } | null {
  if (pairs.length < bins * 3) return null;
  const sorted = [...pairs].sort((a, b) => a.dose - b.dose);
  const perBin = Math.floor(sorted.length / bins);

  const binMeans = Array.from({ length: bins }, (_, k) => {
    const slice = sorted.slice(k * perBin, (k + 1) * perBin);
    const avg = slice.reduce((s, p) => s + p.outcome, 0) / slice.length;
    return { threshold: sorted[Math.min(sorted.length - 1, (k + 1) * perBin - 1)].dose, mean: avg };
  });

  let biggest = 0, at = -1;
  for (let k = 1; k < binMeans.length; k++) {
    const d = Math.abs(binMeans[k].mean - binMeans[k - 1].mean);
    if (d > biggest) { biggest = d; at = k; }
  }
  if (at < 0) return null;

  return {
    threshold: binMeans[at].threshold,
    below: binMeans[at - 1].mean,
    above: binMeans[at].mean,
    delta: binMeans[at].mean - binMeans[at - 1].mean,
  };
}

/** Re-export for convenience. */
export { effectiveSampleSize, lag1Autocorr };
