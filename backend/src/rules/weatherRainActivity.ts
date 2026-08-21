/**
 * Rain vs activity + mood.
 *
 * On days with measurable precipitation (precipitation_mm > 1 or rain_hours > 0),
 * compares step count and mood against dry days using Welch's t-test + MDE + FDR.
 * Requires ≥8 days in each bucket.
 *
 * Tier: weekly. Actionable: yes.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { welchTTest, passesMDE, effectiveSampleSize, benjaminiHochberg, formatCI } from "./stats.js";
import { query } from "../db.js";

export const WeatherRainActivityRule: InsightRule = {
  id: "weather_rain_activity",
  type: "exercise",
  minDays: 30,
  tier: "weekly",
  version: 1,
  actionable: true,
  primaryMetric: "steps",

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      date: string;
      precipitation_mm: string | null;
      rain_hours: string | null;
      steps: string | null;
      avg_mood: string | null;
    }>(
      `SELECT
         wd.date::text,
         wd.precipitation_mm::text,
         wd.rain_hours::text,
         (ds.summary_data->'steps'->>'total')::text AS steps,
         (ds.summary_data->'mood'->>'averageScore')::text AS avg_mood
       FROM weather_daily wd
       LEFT JOIN daily_summaries ds
         ON ds.user_id = wd.user_id AND ds.date = wd.date
       WHERE wd.user_id = $1
         AND wd.date >= CURRENT_DATE - 90
         AND wd.precipitation_mm IS NOT NULL`,
      [userId],
    );

    if (rows.length < 30) return null;

    const rainy = rows.filter(
      (r) => Number(r.precipitation_mm ?? 0) > 1 || Number(r.rain_hours ?? 0) > 0,
    );
    const dry = rows.filter(
      (r) => Number(r.precipitation_mm ?? 0) <= 1 && Number(r.rain_hours ?? 0) === 0,
    );

    if (rainy.length < 8 || dry.length < 8) return null;

    const toSteps = (r: typeof rows[0]) => Number(r.steps);
    const toMood  = (r: typeof rows[0]) => Number(r.avg_mood);

    const rainySteps = rainy.filter((r) => r.steps != null && Number.isFinite(toSteps(r))).map(toSteps);
    const drySteps   = dry.filter((r)   => r.steps != null && Number.isFinite(toSteps(r))).map(toSteps);
    const rainyMood  = rainy.filter((r) => r.avg_mood != null && Number.isFinite(toMood(r))).map(toMood);
    const dryMood    = dry.filter((r)   => r.avg_mood != null && Number.isFinite(toMood(r))).map(toMood);

    if (rainySteps.length < 8 || drySteps.length < 8) return null;

    const effSteps = effectiveSampleSize([...rainySteps, ...drySteps]);
    const tSteps   = welchTTest(drySteps, rainySteps, effSteps);
    const stepsDiff = tSteps.meanA - tSteps.meanB; // dry - rainy

    if (!passesMDE("steps", Math.abs(stepsDiff))) return null;

    // FDR correction across both tests
    const hasMood = rainyMood.length >= 6 && dryMood.length >= 6;
    const tMood   = hasMood ? welchTTest(dryMood, rainyMood) : null;
    const pValues = hasMood && tMood ? [tSteps.pValue, tMood.pValue] : [tSteps.pValue];
    const [stepsPass, moodPass] = benjaminiHochberg(pValues, 0.1);

    if (!stepsPass) return null;

    const stepsDirWord = stepsDiff > 0 ? "fewer" : "more";
    const moodDiff     = tMood ? tMood.meanA - tMood.meanB : 0; // dry - rainy
    const bothLower    = moodPass && tMood && moodDiff > 0 && passesMDE("mood_score", Math.abs(moodDiff));

    const ciStr = tSteps.ci95 ? ` ${formatCI(tSteps.ci95, 0)}` : "";

    let description: string;
    if (bothLower && tMood) {
      description =
        `On rainy days over the past 3 months you logged lower mood (${tMood.meanB.toFixed(1)}/5 vs ${tMood.meanA.toFixed(1)}/5 on dry days) and ${stepsDirWord} steps (${Math.round(tSteps.meanB).toLocaleString()} vs ${Math.round(tSteps.meanA).toLocaleString()}).${ciStr}`;
    } else {
      description =
        `On rainy days over the past 3 months you logged ${stepsDirWord} steps on average (${Math.round(tSteps.meanB).toLocaleString()} vs ${Math.round(tSteps.meanA).toLocaleString()} on dry days).${ciStr}`;
    }

    return {
      title: `You log ${stepsDirWord} steps on rainy days`,
      description,
      confidence: tSteps.pValue < 0.05 ? "high" : "moderate",
      confidenceScore: Math.round(
        Math.min(85, 30 + Math.abs(tSteps.effectSize) * 30 + Math.min(rainySteps.length, 25)),
      ),
      timesObserved: rainySteps.length + drySteps.length,
      pValue: tSteps.pValue,
      effectSize: tSteps.effectSize,
      ci95: tSteps.ci95,
      supportingData: {
        rainy_days: rainySteps.length,
        dry_days: drySteps.length,
        avg_steps_rainy: Math.round(tSteps.meanB),
        avg_steps_dry: Math.round(tSteps.meanA),
        steps_difference: Math.round(stepsDiff),
        avg_mood_rainy: tMood ? Number(tMood.meanB.toFixed(2)) : null,
        avg_mood_dry:   tMood ? Number(tMood.meanA.toFixed(2)) : null,
        mood_passes_fdr: bothLower,
        direction: stepsDirWord,
        p_value: Number(tSteps.pValue.toFixed(3)),
      },
    };
  },
};
