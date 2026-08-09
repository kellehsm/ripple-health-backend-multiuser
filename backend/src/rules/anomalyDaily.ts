/**
 * Daily anomaly / novelty detector.
 *
 * Flags the most recent day's metric that sits farthest outside the user's
 * own 60-day baseline (measured in z-scores). Distinct from long-run
 * correlation rules — this one is meant to make the feed feel *alive*.
 *
 * Tier: daily. Fires at most one insight per user per run.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { getBaselines } from "../services/baselines.js";
import { formatCI } from "./stats.js";

const METRIC_LABELS: Record<string, { label: string; unit: string; primary: string }> = {
  glucose_avg: { label: "average glucose",       unit: " mg/dL", primary: "glucose_mg_dl" },
  glucose_cv:  { label: "glucose variability",   unit: "%",      primary: "glucose_cv" },
  steps:       { label: "step count",            unit: "",       primary: "steps" },
  sleep_secs:  { label: "total sleep",           unit: " min",   primary: "sleep_secs" },
  resting_hr:  { label: "resting heart rate",    unit: " bpm",   primary: "resting_hr_bpm" },
  mood:        { label: "mood score",            unit: "/5",     primary: "mood_score" },
  water:       { label: "hydration",             unit: " glasses", primary: "water_glasses" },
  spending:    { label: "spending",              unit: " $",     primary: "spending_dollars" },
};

// Frame -> today's raw value per metric.
function currentValue(frame: any, metric: string): number | null {
  if (frame.rows.length === 0) return null;
  const last = frame.rows[frame.rows.length - 1];
  switch (metric) {
    case "glucose_avg": return last.glucose_avg;
    case "glucose_cv":  return last.glucose_cv;
    case "steps":       return last.steps;
    case "sleep_secs":  return last.sleep_min != null ? last.sleep_min * 60 : null;
    case "resting_hr":  return last.resting_hr;
    case "mood":        return last.mood_score;
    case "water":       return last.water_glasses;
    case "spending":    return last.spend_total;
    default:            return null;
  }
}

function fmtValue(metric: string, v: number): string {
  const info = METRIC_LABELS[metric];
  if (!info) return v.toFixed(1);
  if (metric === "sleep_secs") return `${(v / 60).toFixed(0)}${info.unit}`;
  if (metric === "glucose_cv") return `${(v * 100).toFixed(0)}${info.unit}`;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}${info.unit}`;
}

export const AnomalyDailyRule: InsightRule = {
  id: "anomaly_daily",
  type: "anomaly",
  minDays: 21,
  tier: "daily",
  version: 1,
  actionable: false,
  primaryMetric: "mixed",

  async run(): Promise<InsightResult | null> { return null; }, // requires frame

  async runWithContext(ctx): Promise<InsightResult | null> {
    const metrics = Object.keys(METRIC_LABELS) as any[];
    const baselines = await getBaselines(ctx.userId, metrics);
    if (baselines.size === 0) return null;

    let best: {
      metric: string;
      z: number;
      value: number;
      median: number;
      direction: "unusually_high" | "unusually_low";
    } | null = null;

    for (const metric of metrics) {
      const b = baselines.get(metric);
      if (!b || b.median == null || !b.std_dev || b.sample_size < 15) continue;
      const v = currentValue(ctx.frame, metric);
      if (v == null) continue;
      const z = (v - b.median) / b.std_dev;
      if (Math.abs(z) < 2) continue;
      if (!best || Math.abs(z) > Math.abs(best.z)) {
        best = {
          metric,
          z,
          value: v,
          median: b.median,
          direction: z > 0 ? "unusually_high" : "unusually_low",
        };
      }
    }
    if (!best) return null;

    const info = METRIC_LABELS[best.metric];
    const dirWord = best.direction === "unusually_high" ? "high" : "low";
    const zAbs = Math.abs(best.z);
    return {
      title: `Today's ${info.label} looks unusually ${dirWord}`,
      description:
        `Today's ${info.label} of ${fmtValue(best.metric, best.value)} sits ${zAbs.toFixed(1)} standard deviations ` +
        `from your 60-day median of ${fmtValue(best.metric, best.median)}. This isn't a diagnosis — just a heads up.`,
      confidence: zAbs >= 3 ? "very_high" : zAbs >= 2.5 ? "high" : "moderate",
      confidenceScore: Math.min(100, Math.round(30 + zAbs * 20)),
      timesObserved: 1,
      primaryMetric: info.primary,
      supportingData: {
        metric: info.label,
        today_value: fmtValue(best.metric, best.value),
        your_median: fmtValue(best.metric, best.median),
        z_score: Number(best.z.toFixed(2)),
        direction: best.direction,
      },
    };
  },
};
