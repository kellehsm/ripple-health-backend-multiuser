import { query } from "../db.js";
import { calcConfidence } from "./types.js";

/**
 * Shared machinery for the "trend" family of insights (Phase 2 of the
 * insights-engine push).
 *
 * Where the tertile rules compare two BUCKETS of days within the same window,
 * trend rules compare TWO WINDOWS (recent N days vs prior N days). A steady
 * drop in resting HR, an improving sleep-duration streak, a worsening glucose
 * CV — none of that surfaces from a single-window tertile analysis.
 *
 * Approach: mean of the recent window minus mean of the prior window. Effect
 * size is expressed as a fraction of the overall pooled standard deviation
 * (Cohen's-d-flavored). Confidence uses the shared calcConfidence helper.
 */

export interface TrendResult {
  recentMean: number;
  priorMean: number;
  diff: number;                 // recent − prior
  effectRatio: number;          // |diff| / pooled SD, clamped to 0–1
  confidence: "low" | "moderate" | "high" | "very_high";
  confidenceScore: number;
  recentCount: number;
  priorCount: number;
}

/**
 * Simple two-window trend detector. Callers supply a query that returns one
 * row per day with `metric_value`. Both windows are aligned to today's
 * calendar day; missing days are simply absent (not zero-filled — a missing
 * day is not the same as a zero-value day).
 */
export async function detectWindowTrend(
  userId: string,
  sqlDayQuery: string,             // must return columns (day date, metric_value numeric)
  recentDays = 30,
  priorDays = 30,
  minPerWindow = 8,
): Promise<TrendResult | null> {
  const rows = await query<{ day: string; metric_value: number }>(sqlDayQuery, [userId]);
  if (rows.length === 0) return null;

  const now = new Date();
  const recentCutoff = new Date(now.getTime() - recentDays * 86400_000);
  const priorCutoff  = new Date(now.getTime() - (recentDays + priorDays) * 86400_000);

  const recent: number[] = [];
  const prior:  number[] = [];
  for (const r of rows) {
    const d = new Date(r.day);
    if (d >= recentCutoff)               recent.push(Number(r.metric_value));
    else if (d >= priorCutoff)           prior.push(Number(r.metric_value));
  }

  if (recent.length < minPerWindow || prior.length < minPerWindow) return null;

  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const recentMean = mean(recent);
  const priorMean  = mean(prior);
  const diff = recentMean - priorMean;

  // Pooled standard deviation across both windows.
  const pooled = [...recent, ...prior];
  const overallMean = mean(pooled);
  const variance = pooled.reduce((s, v) => s + (v - overallMean) ** 2, 0) / (pooled.length - 1);
  const sd = Math.sqrt(variance);

  const effectRatio = sd > 0 ? Math.min(1, Math.abs(diff) / sd) : 0;
  const { score, label } = calcConfidence(Math.min(recent.length, prior.length), effectRatio);

  return {
    recentMean,
    priorMean,
    diff,
    effectRatio,
    confidence: label,
    confidenceScore: score,
    recentCount: recent.length,
    priorCount: prior.length,
  };
}
