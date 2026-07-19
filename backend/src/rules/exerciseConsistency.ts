import { query } from "../db.js";
import { InsightRule, InsightResult } from "./types.js";

export const ExerciseConsistencyRule: InsightRule = {
  id: "exercise_consistency_monthly",
  type: "exercise",
  minDays: 14,

  async run(userId: string): Promise<InsightResult | null> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    const [row] = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM exercise_sessions
       WHERE user_id = $1 AND DATE(started_at AT TIME ZONE 'America/New_York') >= $2`,
      [userId, monthStart]
    );
    const sessions = parseInt(row?.cnt ?? "0");
    if (sessions === 0) return null;

    const dayOfMonth = now.getDate();

    return {
      title: `${sessions} workout${sessions !== 1 ? "s" : ""} completed this month`,
      description: `You've logged ${sessions} workout session${sessions !== 1 ? "s" : ""} so far this month (${dayOfMonth} days in).`,
      confidence: "high",
      confidenceScore: 80,
      timesObserved: sessions,
      supportingData: { sessions_this_month: sessions, days_in_month_so_far: dayOfMonth },
    };
  },
};
