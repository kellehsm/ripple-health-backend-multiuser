import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Detects a 3-node causal chain: poor sleep → lower mood → higher spending.
// Tests each link independently and requires both links to be significant.
export const ChainSleepMoodSpendingRule: InsightRule = {
  id: "chain_sleep_mood_spending",
  type: "combined",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      date: string;
      sleep_min: number;
      avg_mood: number;
      total_spend: number;
    }>(
      `SELECT
         date::text,
         (summary_data->'sleep'->>'minutes')::numeric      AS sleep_min,
         (summary_data->'mood'->>'averageScore')::numeric  AS avg_mood,
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

    if (rows.length < 30) return null;

    type Row = { sleep_min: number; avg_mood: number; total_spend: number };
    const parse = (r: typeof rows[0]): Row => ({
      sleep_min: Number(r.sleep_min),
      avg_mood:  Number(r.avg_mood),
      total_spend: Number(r.total_spend),
    });
    const data = rows.map(parse);

    // ── Link 1: poor sleep → lower mood ───────────────────────────────────────
    const poorSleep  = data.filter(r => r.sleep_min < 360);
    const goodSleep  = data.filter(r => r.sleep_min >= 420);
    if (poorSleep.length < 6 || goodSleep.length < 6) return null;

    const avgMoodPoor  = poorSleep.reduce((s, r) => s + r.avg_mood, 0) / poorSleep.length;
    const avgMoodGood  = goodSleep.reduce((s, r) => s + r.avg_mood, 0) / goodSleep.length;
    const sleepMoodGap = avgMoodGood - avgMoodPoor;
    if (sleepMoodGap < 0.3) return null; // link 1 not strong enough

    // ── Link 2: lower mood → higher spending ──────────────────────────────────
    const sorted = [...data].sort((a, b) => a.avg_mood - b.avg_mood);
    const bottomMood = sorted.slice(0, Math.floor(sorted.length / 3));
    const topMood    = sorted.slice(Math.ceil(sorted.length * 2 / 3));

    const avgSpendLowMood  = bottomMood.reduce((s, r) => s + r.total_spend, 0) / bottomMood.length;
    const avgSpendHighMood = topMood.reduce((s, r) => s + r.total_spend, 0) / topMood.length;
    const moodSpendGap     = avgSpendLowMood - avgSpendHighMood;
    if (moodSpendGap < 3) return null; // link 2 not strong enough

    // ── End-to-end: poor sleep → higher spending (confirms chain) ─────────────
    const avgSpendPoorSleep = poorSleep.reduce((s, r) => s + r.total_spend, 0) / poorSleep.length;
    const avgSpendGoodSleep = goodSleep.reduce((s, r) => s + r.total_spend, 0) / goodSleep.length;
    const endToEndGap       = avgSpendPoorSleep - avgSpendGoodSleep;

    if (endToEndGap < 2) return null; // chain doesn't hold end-to-end

    const { score, label } = calcConfidence(
      Math.min(poorSleep.length, goodSleep.length, bottomMood.length, topMood.length),
      Math.min(sleepMoodGap / 4, moodSpendGap / 30)
    );

    return {
      title: "A chain links your sleep → mood → spending",
      description: `Short nights appear to lower your mood, and lower-mood days tend to cost more. After under 6h of sleep, your mood averaged ${avgMoodPoor.toFixed(1)}/5 vs ${avgMoodGood.toFixed(1)}/5 on good nights. Low-mood days averaged $${Math.round(avgSpendLowMood)} vs $${Math.round(avgSpendHighMood)} on high-mood days — a $${Math.round(Math.abs(moodSpendGap))} difference. End-to-end: poor-sleep days cost $${Math.round(Math.abs(endToEndGap))} more than good-sleep days.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        poor_sleep_days: poorSleep.length,
        good_sleep_days: goodSleep.length,
        avg_mood_poor_sleep: avgMoodPoor.toFixed(2),
        avg_mood_good_sleep: avgMoodGood.toFixed(2),
        sleep_mood_gap: sleepMoodGap.toFixed(2),
        avg_spend_low_mood: Math.round(avgSpendLowMood),
        avg_spend_high_mood: Math.round(avgSpendHighMood),
        mood_spend_gap_dollars: Math.round(moodSpendGap),
        end_to_end_spend_gap_dollars: Math.round(endToEndGap),
      },
    };
  },
};
