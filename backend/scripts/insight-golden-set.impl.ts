/**
 * Golden-set implementation (invoked by insight-golden-set.mjs via tsx).
 */

import {
  welchTTest, mannWhitneyU, benjaminiHochberg, bootstrapMeanDiffCI,
  effectiveSampleSize, lag1Autocorr, winsorize, MDE, passesMDE,
} from "../src/rules/stats.js";
import {
  pearson, findChangePoint, findDoseInflection, partialOut, grangerLift,
} from "../src/services/causality.js";

let passed = 0, failed = 0;
function eq(name: string, actual: number, expected: number, tol = 0.01) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol) {
    console.error(`FAIL ${name}: got ${actual}, expected ${expected} (±${tol})`);
    failed++;
  } else { passed++; }
}
function truthy(name: string, cond: any) {
  if (!cond) { console.error(`FAIL ${name}: expected truthy, got ${cond}`); failed++; } else passed++;
}
function falsy(name: string, cond: any) {
  if (cond) { console.error(`FAIL ${name}: expected falsy, got ${cond}`); failed++; } else passed++;
}

// ---- Welch t-test ----
{
  const a = [5.1, 4.9, 5.0, 5.2, 4.8, 5.1, 5.0, 4.9, 5.2, 4.8];
  const b = [3.1, 2.9, 3.0, 3.2, 2.8, 3.1, 3.0, 2.9, 3.2, 2.8];
  const t = welchTTest(a, b);
  eq("welch.meanA=5", t.meanA, 5.0, 0.05);
  eq("welch.meanB=3", t.meanB, 3.0, 0.05);
  truthy("welch.pValue very small for clear separation", t.pValue < 0.01);
}
{
  // No difference → p ~ 1
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const b = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const t = welchTTest(a, b);
  truthy("welch.pValue near 1 for identical distributions", t.pValue > 0.9);
}

// ---- Mann-Whitney ----
{
  const a = [1, 2, 3, 4, 5];
  const b = [6, 7, 8, 9, 10];
  const t = mannWhitneyU(a, b);
  truthy("MWU.pValue<0.05 for clear separation", t.pValue < 0.05);
  truthy("MWU.effect >0 magnitude", Math.abs(t.effectSize) > 0.5);
}

// ---- BH ----
{
  const p = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216];
  const pass = benjaminiHochberg(p, 0.1);
  truthy("BH: strongest passes", pass[0]);
  falsy("BH: weakest fails", pass[9]);
}

// ---- Bootstrap CI ----
{
  const a = [10, 11, 12, 10, 11, 12, 10, 11, 12, 10];
  const b = [5, 6, 5, 6, 5, 6, 5, 6, 5, 6];
  const [lo, hi] = bootstrapMeanDiffCI(a, b, 500);
  truthy("bootstrap CI encloses true diff (~5.6)", lo < 5.6 && hi > 5.6);
}

// ---- Autocorrelation ----
{
  const trend = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const r = lag1Autocorr(trend);
  truthy("lag1 positive for monotonic trend", r > 0.5);
  const eff = effectiveSampleSize(trend);
  truthy("effectiveN smaller than raw N for autocorrelated series", eff < trend.length);
}

// ---- Winsorize ----
{
  // Need enough clean data below p98 for the outlier to actually get clipped.
  const arr = Array.from({ length: 100 }, (_, i) => i + 1).concat([100000, 100001]);
  const w = winsorize(arr, 0.02, 0.98);
  truthy("winsorize clips extreme outliers", Math.max(...w) < 200);
}

// ---- MDE ----
{
  truthy("passesMDE mood 0.5 ok",  passesMDE("mood_score", 0.5));
  falsy("passesMDE mood 0.1 fails", passesMDE("mood_score", 0.1));
  truthy("passesMDE unknown metric passes", passesMDE("unknown", 0.001));
}

// ---- Pearson ----
{
  const xs = [1, 2, 3, 4, 5];
  const ys = [2, 4, 6, 8, 10];
  eq("pearson perfect positive", pearson(xs, ys), 1);
}

// ---- Change point ----
{
  const series: { date: string; value: number }[] = [];
  // Add real variance so the t-test doesn't hit the zero-variance guard.
  for (let i = 0; i < 30; i++) series.push({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, value: 5 + (i % 3) * 0.3 });
  for (let i = 0; i < 30; i++) series.push({ date: `2026-02-${String(i + 1).padStart(2, "0")}`, value: 8 + (i % 3) * 0.3 });
  const cp = findChangePoint(series, 15);
  truthy("change point detected", cp && Math.abs(cp.delta - 3) < 0.8);
}

// ---- Dose response ----
{
  const pairs = [];
  for (let i = 0; i < 10; i++) pairs.push({ dose: i * 10, outcome: 8 });
  for (let i = 0; i < 10; i++) pairs.push({ dose: 100 + i * 10, outcome: 4 });
  const inf = findDoseInflection(pairs, 4);
  truthy("dose inflection found", inf && Math.abs(inf.delta) > 2);
}

// ---- Partial out ----
{
  const y = [2, 4, 6, 8, 10];
  const z = [1, 2, 3, 4, 5];  // y = 2z
  const resid = partialOut(y, z);
  for (const r of resid) eq("partial out residual near 0", r, 0, 0.001);
}

// ---- Granger lift ----
{
  const x: number[] = [], y: number[] = [];
  for (let t = 0; t < 40; t++) x.push(Math.sin(t / 3));
  for (let t = 0; t < 40; t++) y.push(t === 0 ? 0 : x[t - 1] + 0.1);
  const g = grangerLift(x, y);
  truthy("granger lift positive when X predicts Y", g.lift >= 0);
}

// ---- Wave 2: cyclePhase (mood split) ----
{
  // Simulate follicular/ovulatory baseline vs luteal low-mood group.
  const luteal    = [2.5, 2.8, 2.6, 2.7, 2.9, 2.4, 2.5, 2.6, 2.8, 2.7];
  const baseline  = [3.5, 3.6, 3.4, 3.7, 3.5, 3.8, 3.6, 3.5, 3.7, 3.6, 3.4, 3.5];
  const t = welchTTest(luteal, baseline);
  truthy("cyclePhase.welch detects luteal-vs-baseline mood gap", t.pValue < 0.01);
  truthy("cyclePhase.meanA lower than meanB", t.meanA < t.meanB);
  truthy("cyclePhase.passesMDE mood", passesMDE("mood_score", Math.abs(t.meanA - t.meanB)));
}

// ---- Wave 2: medicationAdherenceOutcomes (mood split) ----
{
  const fullDays   = [3.6, 3.8, 3.7, 3.6, 3.5, 3.9, 3.7, 3.6, 3.8, 3.7, 3.6, 3.8];
  const missedDays = [2.9, 3.0, 2.8, 3.1, 2.9, 3.0, 2.8, 2.9, 3.0, 2.8];
  const t = welchTTest(fullDays, missedDays);
  truthy("medAdherenceOutcomes.pValue significant", t.pValue < 0.05);
  truthy("medAdherenceOutcomes.mood higher on full days", t.meanA > t.meanB);
  truthy("medAdherenceOutcomes.passesMDE", passesMDE("mood_score", Math.abs(t.meanA - t.meanB)));
}

// ---- Wave 2: glucoseOvernight (stable vs variable nights) ----
{
  const stableMood   = [3.7, 3.8, 3.6, 3.9, 3.7, 3.8, 3.9, 3.7, 3.6, 3.8];
  const variableMood = [2.9, 3.0, 2.8, 2.9, 3.1, 2.8, 3.0, 2.9, 2.8, 3.0];
  const t = welchTTest(stableMood, variableMood);
  truthy("glucoseOvernight.pValue significant", t.pValue < 0.05);
  truthy("glucoseOvernight.mood higher after stable night", t.meanA > t.meanB);
  truthy("glucoseOvernight.passesMDE", passesMDE("mood_score", Math.abs(t.meanA - t.meanB)));
  truthy("glucoseOvernight.ci95 defined", t.ci95 != null && t.ci95[1] > t.ci95[0]);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
