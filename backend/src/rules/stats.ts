/**
 * Statistics helpers for the insights engine.
 *
 * WHY: `calcConfidence` in types.ts is a linear blend of sample-size and
 * effect-ratio. It surfaces "moderate" for a 6-vs-6 split with a 0.4-pt mood
 * diff that is indistinguishable from noise. This module adds proper
 * hypothesis testing, effect sizes, CIs, and multiple-comparison correction
 * so we only surface patterns that are unlikely to be random.
 */

export interface TestResult {
  pValue: number;          // two-sided
  effectSize: number;      // Cohen's d for t-test; rank-biserial for MWU
  ci95?: [number, number]; // 95% CI on the mean difference (a - b); undefined for rank tests
  meanA: number;
  meanB: number;
  nA: number;
  nB: number;
  effectiveN: number;      // autocorrelation-adjusted, when provided
}

/** Standard normal CDF via Abramowitz & Stegun 26.2.17. */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/**
 * Two-sided p-value from a t-statistic. We use a normal approximation with
 * a Welch–Satterthwaite adjustment for df >= 20 (accurate enough for our
 * effect sizes; avoids pulling in an incomplete-beta implementation).
 */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  // For small df, apply a conservative correction: inflate |t| by (1 - 3/(4*df-1))
  // (a rough tail-heaviness adjustment relative to normal).
  const scale = df < 30 ? Math.max(0.5, 1 - 3 / (4 * df - 1)) : 1;
  const zEq = Math.abs(t) * scale;
  return 2 * (1 - normCdf(zEq));
}

function mean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1);
}

/**
 * Welch's t-test for two independent samples. Returns p-value, Cohen's d,
 * and a 95% CI on (mean(a) - mean(b)).
 */
export function welchTTest(a: number[], b: number[], effectiveN?: number): TestResult {
  const nA = a.length, nB = b.length;
  const meanA = mean(a), meanB = mean(b);
  const vA = variance(a), vB = variance(b);
  const diff = meanA - meanB;
  const seDiff = Math.sqrt(vA / nA + vB / nB);
  if (!seDiff) {
    return { pValue: 1, effectSize: 0, ci95: [diff, diff], meanA, meanB, nA, nB, effectiveN: effectiveN ?? Math.min(nA, nB) };
  }
  const t = diff / seDiff;
  const dfNum = (vA / nA + vB / nB) ** 2;
  const dfDen = (vA * vA) / (nA * nA * (nA - 1)) + (vB * vB) / (nB * nB * (nB - 1));
  const df = dfDen > 0 ? dfNum / dfDen : Math.min(nA, nB) - 1;
  const pooledSd = Math.sqrt(((nA - 1) * vA + (nB - 1) * vB) / Math.max(1, nA + nB - 2));
  const d = pooledSd > 0 ? diff / pooledSd : 0;

  // If autocorrelation-adjusted effective N is provided, inflate p accordingly
  // by scaling t by sqrt(effectiveN / min(nA, nB)).
  const effN = effectiveN ?? Math.min(nA, nB);
  const shrink = Math.sqrt(effN / Math.min(nA, nB));
  const tAdj = t * shrink;
  const p = tTwoSidedP(tAdj, df);

  const tCrit = 1.96;
  const marg = tCrit * seDiff / shrink;
  return {
    pValue: p,
    effectSize: d,
    ci95: [diff - marg, diff + marg],
    meanA, meanB, nA, nB,
    effectiveN: effN,
  };
}

/**
 * Mann-Whitney U test with normal approximation + tie correction.
 * Preferred for skewed metrics (glucose spikes, spend). Returns
 * rank-biserial correlation as the effect size.
 */
export function mannWhitneyU(a: number[], b: number[]): TestResult {
  const nA = a.length, nB = b.length;
  const combined = a.map(v => ({ v, g: 0 })).concat(b.map(v => ({ v, g: 1 })));
  combined.sort((x, y) => x.v - y.v);

  // Assign average ranks (fractional for ties)
  const ranks = new Array<number>(combined.length);
  let i = 0;
  const tieGroups: number[] = [];
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }

  let rankSumA = 0;
  for (let k = 0; k < combined.length; k++) if (combined[k].g === 0) rankSumA += ranks[k];
  const U_A = rankSumA - (nA * (nA + 1)) / 2;
  const U_B = nA * nB - U_A;
  const U = Math.min(U_A, U_B);

  const meanU = (nA * nB) / 2;
  const N = nA + nB;
  const tieAdj = tieGroups.reduce((s, t) => s + (t ** 3 - t), 0);
  const varU = (nA * nB / 12) * ((N + 1) - tieAdj / (N * (N - 1)));
  const z = varU > 0 ? (U - meanU) / Math.sqrt(varU) : 0;
  const p = 2 * (1 - normCdf(Math.abs(z)));

  // Rank-biserial: effect size on [-1, 1]
  const r = 1 - (2 * U) / (nA * nB);

  const meanA = mean(a), meanB = mean(b);
  return {
    pValue: p,
    effectSize: r,
    ci95: undefined, // rank test doesn't yield a mean-difference CI
    meanA, meanB, nA, nB,
    effectiveN: Math.min(nA, nB),
  };
}

/**
 * Benjamini-Hochberg FDR correction. Given raw p-values, returns a boolean
 * array of "significant at FDR = alpha".
 */
export function benjaminiHochberg(pValues: number[], alpha = 0.1): boolean[] {
  const n = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let cutoff = -1;
  for (let k = 0; k < n; k++) {
    if (indexed[k].p <= ((k + 1) / n) * alpha) cutoff = k;
  }
  const passing = new Set<number>();
  for (let k = 0; k <= cutoff; k++) passing.add(indexed[k].i);
  return pValues.map((_, i) => passing.has(i));
}

/**
 * Bootstrap 95% CI for the mean difference (a - b), percentile method.
 * Used for rules with small samples where the t-CI is unreliable.
 */
export function bootstrapMeanDiffCI(
  a: number[],
  b: number[],
  iters = 1000,
): [number, number] {
  if (a.length === 0 || b.length === 0) return [0, 0];
  const diffs = new Array<number>(iters);
  for (let it = 0; it < iters; it++) {
    let sA = 0, sB = 0;
    for (let k = 0; k < a.length; k++) sA += a[Math.floor(Math.random() * a.length)];
    for (let k = 0; k < b.length; k++) sB += b[Math.floor(Math.random() * b.length)];
    diffs[it] = sA / a.length - sB / b.length;
  }
  diffs.sort((x, y) => x - y);
  return [diffs[Math.floor(iters * 0.025)], diffs[Math.floor(iters * 0.975)]];
}

/**
 * Lag-1 autocorrelation for a time-ordered series. Used to derive an
 * effective sample size so consecutive-day observations don't inflate
 * apparent significance.
 */
export function lag1Autocorr(xs: number[]): number {
  if (xs.length < 3) return 0;
  const m = mean(xs);
  let num = 0, den = 0;
  for (let i = 1; i < xs.length; i++) num += (xs[i] - m) * (xs[i - 1] - m);
  for (let i = 0; i < xs.length; i++) den += (xs[i] - m) ** 2;
  if (den === 0) return 0;
  return num / den;
}

/**
 * Effective sample size under lag-1 autocorrelation:
 *   N_eff = N * (1 - r) / (1 + r)
 * Clamped to [3, N].
 */
export function effectiveSampleSize(xs: number[]): number {
  const r = Math.max(-0.9, Math.min(0.9, lag1Autocorr(xs)));
  const nEff = xs.length * (1 - r) / (1 + r);
  return Math.max(3, Math.min(xs.length, Math.round(nEff)));
}

/** Percentile (linear interpolation) on a pre-sorted array. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = p * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo);
}

/**
 * Winsorize an array at the given percentiles. Values below p_lo are set to
 * the p_lo value; values above p_hi are set to the p_hi value. Used to keep
 * baselines from being dragged by rare extreme days.
 */
export function winsorize(xs: number[], pLo = 0.02, pHi = 0.98): number[] {
  if (xs.length < 5) return xs.slice();
  const sorted = [...xs].sort((a, b) => a - b);
  const lo = percentile(sorted, pLo);
  const hi = percentile(sorted, pHi);
  return xs.map(v => Math.min(hi, Math.max(lo, v)));
}

/**
 * Per-metric Minimum Detectable Effect. A pattern must exceed this raw
 * mean-difference to even be considered — protects against microscopic
 * effects reaching "significant" by sheer sample size.
 *
 * Numbers are in the metric's native units.
 */
export const MDE: Record<string, number> = {
  mood_score: 0.3,          // /5 scale
  sleep_secs: 30 * 60,      // 30 min
  sleep_quality: 0.5,       // /10 scale
  glucose_mg_dl: 8,         // mg/dL
  glucose_cv: 0.03,         // 3 pct-points CV
  steps: 800,
  water_glasses: 1,
  spending_dollars: 5,
  resting_hr_bpm: 3,
  caffeine_mg: 40,
  alcohol_grams: 5,
  minutes: 15,
  energy_level: 0.5,        // /10 scale (cycle energy)
  glucose_cv_pct: 5,        // 5 pct-points overnight CV
};

export function passesMDE(metric: keyof typeof MDE | string, absDiff: number): boolean {
  const gate = MDE[metric];
  return gate == null || absDiff >= gate;
}

/**
 * Produce a human-readable CI string, e.g. "95% CI: 0.2–0.8".
 * Handles the sign convention consistently (always shows lower/upper).
 */
export function formatCI([lo, hi]: [number, number], digits = 1): string {
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  return `95% CI: ${a.toFixed(digits)}–${b.toFixed(digits)}`;
}

/**
 * Given a p-value and effect size, produce a "confidence" label consistent
 * with the existing InsightResult.confidence enum. Effect size falls back to
 * the original calcConfidence semantics when p is unavailable.
 */
export function confidenceFromStats(p: number, absEffect: number): { score: number; label: "low" | "moderate" | "high" | "very_high" } {
  // Score = 60 * (1 - min(p, 0.2)/0.2) + 40 * min(absEffect / 0.8, 1)
  // (Cohen's d 0.8 is a large effect, so cap there.)
  const pFactor = 1 - Math.min(p, 0.2) / 0.2;
  const effFactor = Math.min(absEffect / 0.8, 1);
  const score = Math.round(pFactor * 60 + effFactor * 40);
  let label: "low" | "moderate" | "high" | "very_high" = "low";
  if (score >= 75) label = "very_high";
  else if (score >= 50) label = "high";
  else if (score >= 25) label = "moderate";
  return { score, label };
}
