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

// ---- Wave 3: weatherRainActivity (steps comparison) ----
{
  const drySteps   = [8500, 9000, 8200, 8800, 9200, 8600, 8400, 8700, 9100, 8300];
  const rainySteps = [5500, 5800, 5200, 5600, 6000, 5300, 5700, 5400, 5900, 5100];
  const t = welchTTest(drySteps, rainySteps);
  truthy("weatherRainActivity.pValue significant for clear step gap", t.pValue < 0.01);
  truthy("weatherRainActivity.dry steps higher than rainy", t.meanA > t.meanB);
  truthy("weatherRainActivity.passesMDE steps", passesMDE("steps", Math.abs(t.meanA - t.meanB)));
  truthy("weatherRainActivity.effectSize magnitude", Math.abs(t.effectSize) > 0.5);
}

// ---- Wave 3: weatherTempSleep (hot vs cool nights) ----
{
  const coolSleep = [27000, 27600, 26400, 28200, 27000, 28800, 27600, 26400, 27000, 27600]; // ~450min
  const hotSleep  = [22800, 23400, 22200, 23400, 22800, 24000, 23400, 22200, 22800, 23400]; // ~380min
  const t = welchTTest(coolSleep, hotSleep);
  truthy("weatherTempSleep.pValue significant", t.pValue < 0.01);
  truthy("weatherTempSleep.cooler nights longer sleep", t.meanA > t.meanB);
  truthy("weatherTempSleep.passesMDE sleep_secs (30min)", passesMDE("sleep_secs", Math.abs(t.meanA - t.meanB)));
}

// ---- Wave 3: weatherDaylightMood (Pearson correlation) ----
{
  const daylight = [120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 780];
  const mood     = [2.5, 2.8, 3.0, 3.2, 3.4, 3.5, 3.7, 3.8, 4.0, 4.1, 4.2, 4.3];
  const r = pearson(daylight, mood);
  truthy("weatherDaylightMood.pearson positive correlation", r > 0.9);
  truthy("weatherDaylightMood.passes threshold 0.2", Math.abs(r) > 0.2);
}

// ---- Wave 3 cross-metric: bestDayRecipe (lift calculation) ----
{
  // Simulate top-quartile days having behavior present 80% vs 30% on other days.
  const topRateWith    = 8 / 10; // 10 "with" days, 8 in top quartile
  const restRateWith   = 3 / 10; // 10 "without" days, 3 in top quartile
  const lift = topRateWith / Math.max(0.01, restRateWith);
  truthy("bestDayRecipe.lift > 1.4", lift > 1.4);
  // Mood split passes Welch + MDE.
  const withMood    = [4.2, 4.5, 4.3, 4.4, 4.6, 4.1, 4.3, 4.5, 4.2, 4.4];
  const withoutMood = [3.0, 3.2, 2.9, 3.1, 3.0, 3.3, 3.1, 2.8, 3.2, 3.0];
  const t = welchTTest(withMood, withoutMood);
  truthy("bestDayRecipe.welch pValue significant", t.pValue < 0.01);
  truthy("bestDayRecipe.passesMDE mood", passesMDE("mood_score", Math.abs(t.meanA - t.meanB)));
  truthy("bestDayRecipe.meanA > meanB", t.meanA > t.meanB);
}

// ---- Wave 3 cross-metric: sleepExerciseInteraction (2×2 buckets) ----
{
  // Bucket A (sleep+exercise) should show highest next-day mood.
  const bucketA = [4.2, 4.4, 4.3, 4.5, 4.1, 4.3, 4.2, 4.4]; // combined
  const bucketB = [3.6, 3.8, 3.7, 3.5, 3.9, 3.6];            // sleep only
  const bucketC = [3.4, 3.6, 3.5, 3.3, 3.7, 3.5];            // exercise only
  const tAB = welchTTest(bucketA, bucketB);
  const tAC = welchTTest(bucketA, bucketC);
  truthy("sleepExerciseInteraction.A>B pValue<0.05", tAB.pValue < 0.05);
  truthy("sleepExerciseInteraction.A>C pValue<0.05", tAC.pValue < 0.05);
  const bestSingleMean = Math.max(tAB.meanB, tAC.meanB);
  const combinationLift = tAB.meanA - bestSingleMean;
  truthy("sleepExerciseInteraction.combinationLift passesMDE", passesMDE("mood_score", combinationLift));
  const passes = benjaminiHochberg([tAB.pValue, tAC.pValue], 0.10);
  truthy("sleepExerciseInteraction.FDR at least one passes", passes[0] || passes[1]);
}

// ---- Wave 3 cross-metric: mealTimingSleep (duration + quality) ----
{
  // Late meals → less sleep (in minutes).
  const lateSleepMin  = [350, 360, 340, 355, 345, 360, 350, 340, 355, 348];
  const earlySleepMin = [420, 435, 415, 430, 425, 440, 420, 430, 415, 428];
  const tDur = welchTTest(lateSleepMin, earlySleepMin);
  truthy("mealTimingSleep.duration pValue significant", tDur.pValue < 0.05);
  truthy("mealTimingSleep.early sleep longer", tDur.meanB > tDur.meanA);
  // MDE in sleep_secs (convert min to sec).
  truthy("mealTimingSleep.passesMDE sleep_secs", passesMDE("sleep_secs", Math.abs(tDur.meanA - tDur.meanB) * 60));

  // Sleep quality comparison.
  const lateQuality  = [5.5, 5.8, 5.6, 5.4, 5.9, 5.7, 5.5, 5.6, 5.8, 5.4];
  const earlyQuality = [7.2, 7.5, 7.0, 7.3, 7.4, 7.1, 7.2, 7.5, 7.1, 7.3];
  const tQ = welchTTest(lateQuality, earlyQuality);
  truthy("mealTimingSleep.quality pValue significant", tQ.pValue < 0.01);
  truthy("mealTimingSleep.passesMDE sleep_quality", passesMDE("sleep_quality", Math.abs(tQ.meanA - tQ.meanB)));
  const passes = benjaminiHochberg([tDur.pValue, tQ.pValue], 0.10);
  truthy("mealTimingSleep.FDR passes at least one", passes.some(Boolean));
}

// ---- fired/not-fired persistence logic (unit-style simulation) ----
{
  // Simulate the evalRecords logic: a rule that returns null → fired=false.
  // A rule that returns a result and survives FDR → fired=true.
  // A rule that is FDR-rejected → fired=false (fdr_rejected=true).
  type MockResult = { __fdrRejected?: boolean } | null;
  type EvalRecord = { ruleId: string; fired: boolean; fdrRejected: boolean };

  function buildEvalRecord(ruleId: string, result: MockResult): EvalRecord {
    if (!result) return { ruleId, fired: false, fdrRejected: false };
    const fdrRejected = !!(result as any).__fdrRejected;
    return { ruleId, fired: !fdrRejected, fdrRejected };
  }

  // Rule returns null → not fired.
  const r1 = buildEvalRecord("sleepVsMood", null);
  falsy("fired/null: fired=false for null result", r1.fired);
  falsy("fired/null: fdrRejected=false for null result", r1.fdrRejected);

  // Rule returns result, passes FDR → fired.
  const r2 = buildEvalRecord("streakRule", {});
  truthy("fired/result: fired=true for passing result", r2.fired);
  falsy("fired/result: fdrRejected=false for passing result", r2.fdrRejected);

  // Rule FDR-rejected → not fired, fdr_rejected=true.
  const r3 = buildEvalRecord("correlationRule", { __fdrRejected: true });
  falsy("fired/fdr: fired=false when FDR-rejected", r3.fired);
  truthy("fired/fdr: fdrRejected=true when FDR-rejected", r3.fdrRejected);
}

// ---- MDE key-matching warning path ----
{
  // Simulate the MDE gate logic: if no "difference" key found in supportingData,
  // a warning should be emitted and the gate should be skipped (not block the rule).
  const { MDE: mdeTable, passesMDE: passMDE } = { MDE, passesMDE };

  function simulateMDEGate(
    metric: string,
    supportingData: Record<string, unknown>
  ): { blocked: boolean; missingKey: boolean } {
    if (!mdeTable[metric as keyof typeof mdeTable]) {
      return { blocked: false, missingKey: false };
    }
    const diffKey = Object.keys(supportingData).find(k => /difference/i.test(k));
    if (!diffKey) {
      // Warning would be logged; gate is skipped (not blocked).
      return { blocked: false, missingKey: true };
    }
    const rawDiff = Number((supportingData as any)[diffKey]);
    if (Number.isFinite(rawDiff) && !passMDE(metric, Math.abs(rawDiff))) {
      return { blocked: true, missingKey: false };
    }
    return { blocked: false, missingKey: false };
  }

  // Known metric, no "difference" key → missingKey=true, not blocked (gate skipped).
  const noKey = simulateMDEGate("mood_score", { avg_mood: 3.5, n: 10 });
  truthy("MDE/missingKey: missingKey=true when no difference key", noKey.missingKey);
  falsy("MDE/missingKey: not blocked when key missing (gate skipped)", noKey.blocked);

  // Known metric, has "difference" key, effect too small → blocked.
  const tooSmall = simulateMDEGate("mood_score", { moodDifference: 0.1 });
  falsy("MDE/tooSmall: missingKey=false", tooSmall.missingKey);
  truthy("MDE/tooSmall: blocked=true for sub-MDE effect", tooSmall.blocked);

  // Known metric, has "difference" key, effect passes → not blocked.
  const passes = simulateMDEGate("mood_score", { moodDifference: 0.6 });
  falsy("MDE/passes: not blocked for above-MDE effect", passes.blocked);

  // Unknown metric → not blocked, no warning.
  const unknown = simulateMDEGate("unknown_metric", { avg: 5 });
  falsy("MDE/unknown: not blocked for unknown metric", unknown.blocked);
  falsy("MDE/unknown: no missingKey for unknown metric", unknown.missingKey);
}

// ---- Representative streak/adherence rule assertions ----
// These mirror simple deterministic logic used in streak-type rules.
{
  // Streak: N consecutive days → streak length.
  function streakLength(days: boolean[]): number {
    let len = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (!days[i]) break;
      len++;
    }
    return len;
  }

  eq("streak: 5 consecutive → 5", streakLength([true, true, true, true, true]), 5, 0);
  eq("streak: broken at day 3 → 2", streakLength([true, true, true, false, true, true]), 2, 0);
  eq("streak: no days → 0", streakLength([false, false, false]), 0, 0);

  // Adherence: taken/total.
  function adherenceRate(taken: number, total: number): number {
    return total === 0 ? 0 : taken / total;
  }
  eq("adherence: 7/7 → 1.0", adherenceRate(7, 7), 1.0, 0.001);
  eq("adherence: 5/7 → 0.714", adherenceRate(5, 7), 5 / 7, 0.001);
  eq("adherence: 0/0 → 0", adherenceRate(0, 0), 0, 0.001);

  // MealStreakRule-style: days with ≥3 meals = streak eligible.
  const mealCounts = [3, 2, 4, 3, 3, 1, 3, 3, 3];
  const mealStreak = streakLength(mealCounts.map(n => n >= 3));
  eq("mealStreak: last 3 days ≥3 meals → streak=3", mealStreak, 3, 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
