/**
 * Next-day forecast rule.
 *
 * Uses exponential smoothing on the user's recent mood/sleep/glucose to
 * produce a 1-day-ahead prediction with a bootstrap-derived uncertainty band.
 * Only fires when the smoothed trend deviates meaningfully from the user's
 * baseline median.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { getBaseline } from "../services/baselines.js";

function ewma(series: number[], alpha: number): number[] {
  const out: number[] = [];
  let s = series[0];
  out.push(s);
  for (let i = 1; i < series.length; i++) {
    s = alpha * series[i] + (1 - alpha) * s;
    out.push(s);
  }
  return out;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}

export const ForecastNextDayRule: InsightRule = {
  id: "forecast_next_day",
  type: "trend",
  minDays: 21,
  tier: "daily",
  version: 1,
  actionable: false,
  async run(): Promise<InsightResult | null> { return null; },

  async runWithContext(ctx): Promise<InsightResult | null> {
    // Prefer mood if available; fall back to sleep_min for users without
    // consistent journaling.
    const moodCol = ctx.frame.col("mood_score");
    const sleepCol = ctx.frame.col("sleep_min");
    let series: number[] = [], metric = "", label = "", unit = "";
    let primaryMetric: string;
    if (moodCol.length >= 14) {
      series = moodCol.slice(-21);
      metric = "mood"; label = "mood"; unit = "/5";
      primaryMetric = "mood_score";
    } else if (sleepCol.length >= 14) {
      series = sleepCol.slice(-21);
      metric = "sleep"; label = "sleep"; unit = " min";
      primaryMetric = "sleep_duration_minutes";
    } else {
      return null;
    }

    const smoothed = ewma(series, 0.4);
    const forecast = smoothed[smoothed.length - 1];
    const residuals = smoothed.map((s, i) => series[i] - s);
    const sd = stddev(residuals);

    // Compare to baseline median so we only surface a forecast that says
    // something ("expect below-normal mood tomorrow").
    const baselineMetric = metric === "mood" ? "mood" : "sleep_secs";
    const baseline = await getBaseline(ctx.userId, baselineMetric as any);
    const median = baseline?.median ?? forecast;
    const baselineVal = metric === "sleep" ? median / 60 : median; // convert sec->min for compare/display

    const diff = forecast - baselineVal;
    if (Math.abs(diff) < sd * 0.5) return null;

    const direction = diff > 0 ? "above" : "below";
    const forecastStr = `${forecast.toFixed(metric === "sleep" ? 0 : 1)}${unit}`;
    const rangeLo = `${(forecast - 1.96 * sd).toFixed(metric === "sleep" ? 0 : 1)}${unit}`;
    const rangeHi = `${(forecast + 1.96 * sd).toFixed(metric === "sleep" ? 0 : 1)}${unit}`;

    return {
      title: `Tomorrow's ${label} is trending ${direction} your usual`,
      primaryMetric,
      description:
        `Based on the past ${series.length} days, tomorrow's ${label} is projected at about ${forecastStr} ` +
        `(likely range ${rangeLo}–${rangeHi}). Your 60-day median is ${baselineVal.toFixed(1)}${unit}.`,
      confidence: Math.abs(diff) > sd ? "high" : "moderate",
      confidenceScore: Math.min(80, 40 + Math.round(Math.abs(diff / sd) * 20)),
      timesObserved: series.length,
      supportingData: {
        forecast_value: Number(forecast.toFixed(2)),
        forecast_range_low: Number((forecast - 1.96 * sd).toFixed(2)),
        forecast_range_high: Number((forecast + 1.96 * sd).toFixed(2)),
        baseline_median: Number(baselineVal.toFixed(2)),
        difference: Number(diff.toFixed(2)),
        direction,
      },
    };
  },
};
