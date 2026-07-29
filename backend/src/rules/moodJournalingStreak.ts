import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { estToday, estYesterday } from "../lib/estDate.js";

export const MoodJournalingStreakRule: InsightRule = {
  id: "mood_journaling_streak",
  type: "streak",
  minDays: 7,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string }>(
      `SELECT date::text
       FROM daily_summaries
       WHERE user_id = $1
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
       ORDER BY date DESC
       LIMIT 90`,
      [userId]
    );

    if (rows.length === 0) return null;

    const today = estToday();
    const yesterday = estYesterday();

    const days = rows.map(r => String(r.date).slice(0, 10));

    if (days[0] !== today && days[0] !== yesterday) return null;

    let streak = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1] + "T12:00:00");
      prev.setDate(prev.getDate() - 1);
      const expectedPrev = prev.toISOString().slice(0, 10);
      if (days[i] === expectedPrev) {
        streak++;
      } else {
        break;
      }
    }

    if (streak < 7) return null;

    const effectRatio = Math.min(1, (streak - 5) / 25);
    const { score, label } = calcConfidence(streak, effectRatio);

    return {
      title: `You've logged your mood ${streak} days in a row`,
      description: `You've recorded mood data for ${streak} consecutive days. Longer streaks give the insight engine more data to surface stronger patterns — keep it going.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: streak,
      supportingData: {
        streak_days: streak,
      },
    };
  },
};
