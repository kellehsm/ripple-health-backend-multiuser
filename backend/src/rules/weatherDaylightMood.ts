/**
 * Daylight minutes vs mood — Pearson correlation across the season.
 *
 * Uses the causality.pearson helper (same pattern as other correlation rules).
 * Tier: weekly.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { passesMDE } from "./stats.js";
import { pearson } from "../services/causality.js";
import { query } from "../db.js";

export const WeatherDaylightMoodRule: InsightRule = {
  id: "weather_daylight_mood",
  type: "mood",
  minDays: 30,
  tier: "weekly",
  version: 1,
  actionable: false,
  primaryMetric: "mood_score",

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      date: string;
      daylight_minutes: string | null;
      avg_mood: string | null;
    }>(
      `SELECT
         wd.date::text,
         wd.daylight_minutes::text,
         (ds.summary_data->'mood'->>'averageScore')::text AS avg_mood
       FROM weather_daily wd
       LEFT JOIN daily_summaries ds
         ON ds.user_id = wd.user_id AND ds.date = wd.date
       WHERE wd.user_id = $1
         AND wd.date >= CURRENT_DATE - 90
         AND wd.daylight_minutes IS NOT NULL
         AND ds.summary_data->'mood'->>'averageScore' IS NOT NULL`,
      [userId],
    );

    if (rows.length < 20) return null;

    const daylight = rows.map((r) => Number(r.daylight_minutes));
    const mood     = rows.map((r) => Number(r.avg_mood));

    const r = pearson(daylight, mood);
    if (!Number.isFinite(r) || Math.abs(r) < 0.2) return null;

    // Require at least a small mood range that clears MDE
    const moodMin = Math.min(...mood);
    const moodMax = Math.max(...mood);
    if (!passesMDE("mood_score", moodMax - moodMin)) return null;

    // Approximate p-value via t-distribution: t = r * sqrt((n-2)/(1-r^2))
    const n = rows.length;
    const t = r * Math.sqrt((n - 2) / Math.max(0.0001, 1 - r * r));
    // Use normal approximation for df >= 18
    const pApprox = 2 * (1 - (0.5 * (1 + Math.sign(t) * Math.sqrt(1 - Math.exp(-2 * t * t / n)))));

    const dirWord  = r > 0 ? "higher" : "lower";
    const strength = Math.abs(r) >= 0.4 ? "a moderate" : "a weak";

    const avgDaylight = Math.round(daylight.reduce((s, v) => s + v, 0) / daylight.length);

    return {
      title: `Mood tends to be ${dirWord} on days with more daylight`,
      description:
        `Across ${n} days with both daylight and mood data, there is ${strength} positive association ` +
        `between sunshine duration and logged mood score (r = ${r.toFixed(2)}). ` +
        `Average daylight in this window was ${avgDaylight} minutes per day.`,
      confidence: Math.abs(r) >= 0.4 ? "moderate" : "low",
      confidenceScore: Math.round(Math.min(80, 20 + Math.abs(r) * 60 + Math.min(n, 20))),
      timesObserved: n,
      pValue: Math.max(0.001, pApprox),
      effectSize: r,
      supportingData: {
        n_days: n,
        pearson_r: Number(r.toFixed(3)),
        avg_daylight_min: avgDaylight,
        direction: dirWord,
        p_approx: Number(Math.max(0.001, pApprox).toFixed(3)),
      },
    };
  },
};
