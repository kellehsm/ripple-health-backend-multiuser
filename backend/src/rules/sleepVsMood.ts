import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { bucketByBaseline } from "./ruleHelper.js";

export const SleepVsMoodRule: InsightRule = {
  id: "sleep_vs_mood",
  type: "sleep",
  minDays: 20,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; sleep_min: number; avg_mood: number }>(
      `SELECT
         date,
         (summary_data->'sleep'->>'minutes')::numeric AS sleep_min,
         (summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND summary_data->'sleep'->>'minutes' IS NOT NULL
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
       ORDER BY date DESC`,
      [userId]
    );

    if (rows.length < 20) return null;

    // Baseline-aware split — "high" = p67 of your own sleep, "low" = p33.
    // Falls back to the legacy 7h / 6h constants if we don't have a
    // baseline yet.  Baseline is in seconds, so 420min * 60 = 25200s,
    // 360min * 60 = 21600s for the fallback.
    const split = await bucketByBaseline(
      userId,
      "sleep_secs",
      rows,
      (r) => Number(r.sleep_min) * 60,
      { low: 21600, high: 25200 }
    );
    const highSleep = split.highGroup;
    const lowSleep = split.lowGroup;

    if (highSleep.length < 6 || lowSleep.length < 6) return null;

    const avgMoodHigh = highSleep.reduce((s, r) => s + Number(r.avg_mood), 0) / highSleep.length;
    const avgMoodLow  = lowSleep.reduce((s, r) => s + Number(r.avg_mood), 0) / lowSleep.length;

    const diff = avgMoodHigh - avgMoodLow;
    if (Math.abs(diff) < 0.3) return null; // not meaningful

    const effectRatio = Math.abs(diff) / 4; // mood scale is 1–5, max diff = 4
    const { score, label } = calcConfidence(Math.min(highSleep.length, lowSleep.length), effectRatio);

    const direction = diff > 0 ? "higher" : "lower";
    const avgH = avgMoodHigh.toFixed(1);
    const avgL = avgMoodLow.toFixed(1);
    const highHrs = (split.highThreshold / 3600).toFixed(1);
    const lowHrs  = (split.lowThreshold  / 3600).toFixed(1);
    const bandNote = split.usedBaseline
      ? `nights with ${highHrs}h+ sleep (your own top tier)`
      : `nights with 7+ hours sleep`;
    const lowNote = split.usedBaseline
      ? `nights under ${lowHrs}h (your own bottom tier)`
      : `nights under 6 hours`;

    return {
      title: "Longer sleep appears linked to better mood",
      description: `Over the last 90 days, on ${bandNote} your average mood was ${avgH}/5, compared to ${avgL}/5 on ${lowNote} — a difference of ${Math.abs(diff).toFixed(1)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        high_sleep_days: highSleep.length,
        low_sleep_days: lowSleep.length,
        avg_mood_high_sleep: avgH,
        avg_mood_low_sleep: avgL,
        mood_difference: diff.toFixed(2),
        direction,
        used_personalized_baseline: split.usedBaseline,
        high_threshold_hours: highHrs,
        low_threshold_hours: lowHrs,
      },
    };
  },
};
