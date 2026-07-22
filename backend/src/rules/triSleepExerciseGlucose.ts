import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Asks: does the combination of good sleep + exercise reduce next-day glucose
// more than either habit alone? Uses lag: checks next-day glucose.
export const TriSleepExerciseGlucoseRule: InsightRule = {
  id: "tri_sleep_exercise_glucose",
  type: "combined",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      date: string;
      sleep_min: number;
      has_exercise: boolean;
      glucose_avg: number;
    }>(
      `SELECT
         date::text,
         (summary_data->'sleep'->>'minutes')::numeric AS sleep_min,
         COALESCE((summary_data->'activity'->>'exerciseSessionCount')::int, 0) > 0 AS has_exercise,
         (summary_data->'glucose'->>'average')::numeric AS glucose_avg
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND summary_data->'sleep'->>'minutes' IS NOT NULL
         AND summary_data->'glucose'->>'average' IS NOT NULL
         AND (summary_data->'glucose'->>'average')::numeric > 0
       ORDER BY date ASC`,
      [userId]
    );

    if (rows.length < 30) return null;

    // Build next-day glucose lookup
    type Row = { sleep_min: number; has_exercise: boolean; next_glucose: number };
    const paired: Row[] = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const cur  = rows[i];
      const next = rows[i + 1];
      if (!next.glucose_avg) continue;
      paired.push({
        sleep_min: Number(cur.sleep_min),
        has_exercise: cur.has_exercise,
        next_glucose: Number(next.glucose_avg),
      });
    }

    if (paired.length < 20) return null;

    const goodSleep = (r: Row) => r.sleep_min >= 420;
    const exercised = (r: Row) => r.has_exercise;
    const nextGlc   = (r: Row) => r.next_glucose;
    const avg = (arr: Row[]) => arr.reduce((s, r) => s + nextGlc(r), 0) / arr.length;

    const both      = paired.filter(r => goodSleep(r) && exercised(r));
    const sleepOnly = paired.filter(r => goodSleep(r) && !exercised(r));
    const exOnly    = paired.filter(r => !goodSleep(r) && exercised(r));
    const neither   = paired.filter(r => !goodSleep(r) && !exercised(r));

    if (both.length < 5 || neither.length < 5) return null;

    const glucBoth    = avg(both);
    const glucNeither = avg(neither);
    const diff = glucNeither - glucBoth; // positive = both condition gives lower glucose

    if (diff < 4) return null;

    const glucSleepOnly = sleepOnly.length >= 3 ? avg(sleepOnly) : null;
    const glucExOnly    = exOnly.length >= 3 ? avg(exOnly) : null;

    const { score, label } = calcConfidence(
      Math.min(both.length, neither.length),
      diff / Math.max(glucBoth, glucNeither)
    );

    const sleepNote = glucSleepOnly != null
      ? ` Sleep alone (without exercise): ${Math.round(glucSleepOnly)} mg/dL.`
      : "";
    const exNote = glucExOnly != null
      ? ` Exercise alone (without good sleep): ${Math.round(glucExOnly)} mg/dL.`
      : "";

    return {
      title: "Exercise + good sleep is your strongest glucose-lowering combo",
      description: `The day after you both exercised and slept 7+ hours, your average glucose was ${Math.round(glucBoth)} mg/dL — vs ${Math.round(glucNeither)} mg/dL after days with neither.${sleepNote}${exNote} (${both.length} days with both vs ${neither.length} without, last 90 days.)`,
      confidence: label,
      confidenceScore: score,
      timesObserved: paired.length,
      supportingData: {
        days_analyzed: paired.length,
        days_both: both.length,
        days_neither: neither.length,
        days_sleep_only: sleepOnly.length,
        days_exercise_only: exOnly.length,
        next_day_glucose_both: Math.round(glucBoth),
        next_day_glucose_neither: Math.round(glucNeither),
        next_day_glucose_sleep_only: glucSleepOnly != null ? Math.round(glucSleepOnly) : null,
        next_day_glucose_exercise_only: glucExOnly != null ? Math.round(glucExOnly) : null,
        glucose_reduction_mg_dl: Math.round(diff),
      },
    };
  },
};
