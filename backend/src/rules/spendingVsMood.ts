import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const SpendingVsMoodRule: InsightRule = {
  id: "spending_vs_mood",
  type: "spending",
  minDays: 20,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; total_spend: number; avg_mood: number }>(
      `SELECT
         ds.date::text AS date,
         (ds.summary_data->'mood'->>'averageScore')::numeric AS avg_mood,
         COALESCE(se.total, 0) AS total_spend
       FROM daily_summaries ds
       LEFT JOIN (
         SELECT logged_at::date AS day, SUM(amount) AS total
         FROM spending_entries
         WHERE user_id = $1 AND logged_at >= CURRENT_DATE - 60
         GROUP BY logged_at::date
       ) se ON se.day = ds.date
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - 60
         AND ds.summary_data->'mood'->>'averageScore' IS NOT NULL
       ORDER BY ds.date DESC`,
      [userId]
    );

    if (rows.length < 20) return null;

    // Compare high-spend days (top 25%) vs low-spend days (bottom 50%)
    const spendValues = rows.map(r => Number(r.total_spend)).sort((a, b) => a - b);
    const p75 = spendValues[Math.floor(spendValues.length * 0.75)];
    const p25 = spendValues[Math.floor(spendValues.length * 0.25)];

    if (p75 <= 0 || p25 === p75) return null;

    const highSpendDays = rows.filter(r => Number(r.total_spend) >= p75);
    const lowSpendDays  = rows.filter(r => Number(r.total_spend) <= p25);

    if (highSpendDays.length < 4 || lowSpendDays.length < 4) return null;

    const avgMoodHighSpend = highSpendDays.reduce((s, r) => s + Number(r.avg_mood), 0) / highSpendDays.length;
    const avgMoodLowSpend  = lowSpendDays.reduce((s, r) => s + Number(r.avg_mood), 0) / lowSpendDays.length;

    const diff = avgMoodHighSpend - avgMoodLowSpend;
    if (Math.abs(diff) < 0.25) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(Math.min(highSpendDays.length, lowSpendDays.length), effectRatio);

    const avgHighSpend = highSpendDays.reduce((s, r) => s + Number(r.total_spend), 0) / highSpendDays.length;
    const avgLowSpend  = lowSpendDays.reduce((s, r) => s + Number(r.total_spend), 0) / lowSpendDays.length;

    const moodDir  = diff > 0 ? "higher" : "lower";
    const spendDir = diff > 0 ? "higher" : "lower";

    return {
      title: `Mood tends to be ${moodDir} on higher-spending days`,
      description: `Over the last 60 days, on your higher-spend days (avg $${avgHighSpend.toFixed(0)}) your mood averaged ${avgMoodHighSpend.toFixed(1)}/5, versus ${avgMoodLowSpend.toFixed(1)}/5 on lower-spend days (avg $${avgLowSpend.toFixed(0)}).`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        high_spend_days: highSpendDays.length,
        low_spend_days: lowSpendDays.length,
        avg_mood_high_spend: avgMoodHighSpend.toFixed(2),
        avg_mood_low_spend: avgMoodLowSpend.toFixed(2),
        avg_high_spend_dollars: avgHighSpend.toFixed(2),
        avg_low_spend_dollars: avgLowSpend.toFixed(2),
        mood_difference: diff.toFixed(2),
      },
    };
  },
};
