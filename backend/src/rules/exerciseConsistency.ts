import { query } from "../db.js";
import { InsightRule, InsightResult } from "./types.js";

export const ExerciseConsistencyRule: InsightRule = {
  id: "exercise_consistency_monthly",
  type: "exercise",
  minDays: 14,

  async run(userId: string): Promise<InsightResult | null> {
    const windowStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [row] = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM exercise_sessions
       WHERE user_id = $1 AND DATE(started_at AT TIME ZONE 'America/New_York') >= $2`,
      [userId, windowStart]
    );
    const sessions = parseInt(row?.cnt ?? "0");
    if (sessions < 3) return null;

    return {
      title: `${sessions} workout${sessions !== 1 ? "s" : ""} in the last 14 days`,
      description: `You've logged ${sessions} workout session${sessions !== 1 ? "s" : ""} in the last 14 days.`,
      confidence: "high",
      confidenceScore: 80,
      timesObserved: sessions,
      supportingData: { sessions_last_14_days: sessions },
    };
  },
};
