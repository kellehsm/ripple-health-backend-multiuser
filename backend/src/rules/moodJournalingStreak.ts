import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();
    const yesterdayTs = todayTs - 86400000;

    const dateTimes = rows.map(r => {
      const d = new Date(r.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    });

    // Streak must anchor to today or yesterday
    if (dateTimes[0] !== todayTs && dateTimes[0] !== yesterdayTs) return null;

    let streak = 1;
    for (let i = 1; i < dateTimes.length; i++) {
      if (dateTimes[i] === dateTimes[i - 1] - 86400000) {
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
