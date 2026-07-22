import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// 4-node causal chain: poor sleep → less exercise → lower mood → higher spending.
// Verifies each of the 3 links plus the end-to-end effect.
export const ChainSleepExerciseMoodSpendingRule: InsightRule = {
  id: "chain_sleep_exercise_mood_spending",
  type: "combined",
  minDays: 35,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      sleep_min: number;
      has_exercise: boolean;
      avg_mood: number;
      total_spend: number;
    }>(
      `SELECT
         (summary_data->'sleep'->>'minutes')::numeric AS sleep_min,
         COALESCE((summary_data->'activity'->>'exerciseSessionCount')::int, 0) > 0 AS has_exercise,
         (summary_data->'mood'->>'averageScore')::numeric AS avg_mood,
         (summary_data->'finance'->>'totalSpend')::numeric AS total_spend
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND summary_data->'sleep'->>'minutes' IS NOT NULL
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
         AND summary_data->'finance'->>'totalSpend' IS NOT NULL
         AND (summary_data->'finance'->>'totalSpend')::numeric > 0`,
      [userId]
    );

    if (rows.length < 35) return null;

    type R = typeof rows[0];
    const poorSleep = rows.filter(r => Number(r.sleep_min) < 360);
    const goodSleep = rows.filter(r => Number(r.sleep_min) >= 420);
    if (poorSleep.length < 6 || goodSleep.length < 6) return null;

    // Link 1: poor sleep → less exercise
    const exRatePoor = poorSleep.filter(r => r.has_exercise).length / poorSleep.length;
    const exRateGood = goodSleep.filter(r => r.has_exercise).length / goodSleep.length;
    if (exRateGood - exRatePoor < 0.1) return null;

    // Link 2: exercise → better mood (among all rows)
    const exDays   = rows.filter(r => r.has_exercise);
    const noExDays = rows.filter(r => !r.has_exercise);
    if (exDays.length < 5 || noExDays.length < 5) return null;
    const moodEx   = exDays.reduce((s, r) => s + Number(r.avg_mood), 0) / exDays.length;
    const moodNoEx = noExDays.reduce((s, r) => s + Number(r.avg_mood), 0) / noExDays.length;
    if (moodEx - moodNoEx < 0.25) return null;

    // Link 3: lower mood → higher spending
    const sorted = [...rows].sort((a, b) => Number(a.avg_mood) - Number(b.avg_mood));
    const bottomMood = sorted.slice(0, Math.floor(sorted.length / 3));
    const topMood    = sorted.slice(Math.ceil(sorted.length * 2 / 3));
    const spendLowMood  = bottomMood.reduce((s, r) => s + Number(r.total_spend), 0) / bottomMood.length;
    const spendHighMood = topMood.reduce((s, r) => s + Number(r.total_spend), 0) / topMood.length;
    if (spendLowMood - spendHighMood < 3) return null;

    // End-to-end: poor sleep days vs good sleep days spending
    const spendPoor = poorSleep.reduce((s, r) => s + Number(r.total_spend), 0) / poorSleep.length;
    const spendGood = goodSleep.reduce((s, r) => s + Number(r.total_spend), 0) / goodSleep.length;
    if (spendPoor - spendGood < 2) return null;

    const { score, label } = calcConfidence(
      Math.min(poorSleep.length, goodSleep.length, exDays.length, noExDays.length),
      Math.min((exRateGood - exRatePoor), (moodEx - moodNoEx) / 4, (spendLowMood - spendHighMood) / 30)
    );

    return {
      title: "A 4-step chain connects sleep → exercise → mood → spending",
      description: `Short nights are followed by ${Math.round((1 - exRatePoor) * 100)}% skipping exercise vs ${Math.round((1 - exRateGood) * 100)}% on good nights. Exercise days average ${moodEx.toFixed(1)}/5 mood vs ${moodNoEx.toFixed(1)}/5 without. Low-mood days cost $${Math.round(spendLowMood)} vs $${Math.round(spendHighMood)} on high-mood days. End-to-end: poor-sleep days average $${Math.round(Math.abs(spendPoor - spendGood))} more in spending.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        poor_sleep_days: poorSleep.length,
        good_sleep_days: goodSleep.length,
        exercise_rate_poor_sleep: exRatePoor.toFixed(2),
        exercise_rate_good_sleep: exRateGood.toFixed(2),
        mood_exercise_days: moodEx.toFixed(2),
        mood_no_exercise_days: moodNoEx.toFixed(2),
        spend_low_mood: Math.round(spendLowMood),
        spend_high_mood: Math.round(spendHighMood),
        end_to_end_spend_gap: Math.round(spendPoor - spendGood),
      },
    };
  },
};
